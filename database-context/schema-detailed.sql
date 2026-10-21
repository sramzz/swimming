-- ============================================================================
-- AlleZwembaden.nl — Detailed Relational & Geospatial Schema (SQLite / Cloudflare D1)
-- Engine: SQLite 3 / Cloudflare D1 (Strict Mode & Foreign Keys Enabled)
-- Principles: 3-Entity Grain, SCD Type 2 History, Explicit FSM State Constraints,
--             Idempotent Ingestion Keys, AVG/GDPR Data Minimization.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 1. GEOGRAPHIC & DUTCH CONTEXT REFERENCE TABLES
-- ----------------------------------------------------------------------------

-- Grain: 1 row per Dutch Municipality (Gemeente, ~342 rows)
CREATE TABLE IF NOT EXISTS municipalities (
    slug                TEXT PRIMARY KEY,               -- e.g. 'amsterdam', 'utrecht'
    cbs_code            TEXT NOT NULL UNIQUE,           -- e.g. 'GM0363'
    name                TEXT NOT NULL,                  -- e.g. 'Amsterdam'
    province_slug       TEXT NOT NULL,                  -- e.g. 'noord-holland'
    province_name       TEXT NOT NULL,                  -- e.g. 'Noord-Holland'
    school_vacation_region TEXT NOT NULL CHECK (
        school_vacation_region IN ('noord', 'midden', 'zuid')
    ),
    center_lat          REAL NOT NULL,
    center_lng          REAL NOT NULL,
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_municipalities_province ON municipalities(province_slug);

-- Grain: 1 row per 4-digit Dutch Postcode centroid (PC4, ~4,000 rows) for <0.5ms radius search
CREATE TABLE IF NOT EXISTS postcode_pc4 (
    pc4                 TEXT PRIMARY KEY CHECK (length(pc4) = 4), -- e.g. '1079'
    municipality_slug   TEXT NOT NULL REFERENCES municipalities(slug),
    lat                 REAL NOT NULL,
    lng                 REAL NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_postcode_pc4_bbox ON postcode_pc4(lat, lng);

-- Grain: 1 row per Official Dutch Public Holiday (Feestdag) per date
CREATE TABLE IF NOT EXISTS nl_public_holidays (
    holiday_date        TEXT PRIMARY KEY,               -- ISO 'YYYY-MM-DD'
    name_nl             TEXT NOT NULL,                  -- e.g. 'Koningsdag', 'Tweede Paasdag'
    is_national         INTEGER NOT NULL DEFAULT 1 CHECK (is_national IN (0, 1))
) STRICT;

-- Grain: 1 row per Rijksoverheid Regional School Vacation window
CREATE TABLE IF NOT EXISTS nl_school_vacations (
    id                  TEXT PRIMARY KEY,               -- e.g. '2026-herfst-noord'
    school_year         TEXT NOT NULL,                  -- e.g. '2026-2027'
    vacation_name       TEXT NOT NULL,                  -- e.g. 'Herfstvakantie', 'Zomervakantie'
    region              TEXT NOT NULL CHECK (region IN ('noord', 'midden', 'zuid')),
    start_date          TEXT NOT NULL,                  -- ISO 'YYYY-MM-DD'
    end_date            TEXT NOT NULL,                  -- ISO 'YYYY-MM-DD'
    scrape_trigger_date TEXT NOT NULL                   -- 14 days before start_date ('YYYY-MM-DD')
) STRICT;

CREATE INDEX IF NOT EXISTS idx_school_vacations_lookup
    ON nl_school_vacations(region, start_date, end_date);

-- Grain: 1 row per Active/Historical KNMI Weather Warning per Province
CREATE TABLE IF NOT EXISTS weather_alerts (
    id                  TEXT PRIMARY KEY,
    province_slug       TEXT NOT NULL,
    knmi_code           TEXT NOT NULL CHECK (knmi_code IN ('GROEN', 'GEEL', 'ORANJE', 'ROOD')),
    phenomenon          TEXT NOT NULL,                  -- e.g. 'Onweer', 'Extreme hitte', 'Storm'
    headline_nl         TEXT NOT NULL,
    valid_from          TEXT NOT NULL,                  -- ISO8601 UTC
    valid_to            TEXT NOT NULL,                  -- ISO8601 UTC
    is_active           INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    synced_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_weather_alerts_active
    ON weather_alerts(province_slug, is_active);

-- ----------------------------------------------------------------------------
-- 2. CORE ENTITY 1: VENUES (Physical Swimming Locations & Open-Water Spots)
-- ----------------------------------------------------------------------------

-- Grain: 1 row per Physical Venue / Open-Water Spot in the Netherlands
CREATE TABLE IF NOT EXISTS venues (
    id                      TEXT PRIMARY KEY,           -- UUID / ULID
    slug                    TEXT NOT NULL,              -- e.g. 'de-mirandabad'
    municipality_slug       TEXT NOT NULL REFERENCES municipalities(slug),
    name                    TEXT NOT NULL,              -- e.g. 'Zwemcentrum De Mirandabad'
    venue_type              TEXT NOT NULL CHECK (
        venue_type IN (
            'INDOOR_ONLY',
            'INDOOR_AND_OUTDOOR',
            'SUBTROPICAL_PARADISE',
            'OUTDOOR_SEASONAL_POOL',
            'OPEN_WATER_NATURAL',
            'BOUTIQUE_SWIM_SCHOOL_POOL'
        )
    ),
    enrichment_tier         TEXT NOT NULL DEFAULT 'BASELINE' CHECK (
        enrichment_tier IN ('BASELINE', 'GOLD_STANDARD')
    ),
    -- Operational Status FSM
    operational_state       TEXT NOT NULL DEFAULT 'OPEN_REGULAR' CHECK (
        operational_state IN (
            'OPEN_REGULAR',
            'OPEN_VACATION_SCHEDULE',
            'SEASONAL_TRANSITION',
            'CLOSED_OFFSEASON',
            'WARNING_WATER_QUALITY',    -- e.g. Blauwalg / Zwemmersjeuk warning
            'CLOSED_UNSAFE_OR_WEATHER', -- e.g. KNMI Code Oranje/Rood or technical closure
            'PERMANENTLY_CLOSED'
        )
    ),
    -- Address & Geospatial (Bounding-Box indexed for <0.5ms radius search)
    street_address          TEXT,                       -- e.g. 'De Mirandalaan 9'
    postcode_pc6            TEXT,                       -- e.g. '1079 PA'
    postcode_pc4            TEXT REFERENCES postcode_pc4(pc4),
    neighborhood_name       TEXT,                       -- e.g. 'Amsterdam Zuid (Rivierenbuurt)'
    lat                     REAL NOT NULL,
    lng                     REAL NOT NULL,
    -- Operator & Accreditations
    operator_name           TEXT,                       -- e.g. 'Gemeente Amsterdam Sportbedrijf', 'Optisport'
    is_nrz_licensed         INTEGER NOT NULL DEFAULT 0 CHECK (is_nrz_licensed IN (0, 1)),
    is_knzb_affiliated      INTEGER NOT NULL DEFAULT 0 CHECK (is_knzb_affiliated IN (0, 1)),
    municipal_keurmerk_label TEXT,                      -- e.g. 'Gemeente Amsterdam Keurmerk'
    -- Primary Disinfection Summary (Denormalized from primary basin for instant card filtering)
    primary_water_treatment TEXT NOT NULL DEFAULT 'TRADITIONAL_CHLORINE' CHECK (
        primary_water_treatment IN (
            'SALT_ELECTROLYSIS',        -- Zoutelektrolyse (Zacht water / Huidvriendelijk)
            'TRADITIONAL_CHLORINE',     -- Klassiek Chloor
            'UV_LOW_CHLORINE',          -- UV + Laag chloor
            'NATURAL_UNTREATED'         -- Natuurwater (Onbehandeld)
        )
    ),
    -- Accessibility, Transit & Discount Passes
    has_wheelchair_lift     INTEGER NOT NULL DEFAULT 0 CHECK (has_wheelchair_lift IN (0, 1)),
    has_accessible_changing INTEGER NOT NULL DEFAULT 0 CHECK (has_accessible_changing IN (0, 1)),
    parking_info_nl         TEXT,                       -- e.g. 'Eigen parkeerterrein (€ 1,60/uur) + 8 laadpalen'
    ev_chargers_count       INTEGER DEFAULT 0,
    transit_chips_json      TEXT NOT NULL DEFAULT '[]', -- JSON array of {icon, title, subtitle}
    municipal_pass_name     TEXT,                       -- e.g. 'Stadspas Amsterdam', 'U-pas', 'Ooievaarspas'
    municipal_pass_discount_nl TEXT,                    -- e.g. 'Tot 80% korting met groene stip'
    -- Maps & Official Links
    google_maps_embed_url   TEXT,                       -- Free lazy-loaded <iframe> embed URL for Detail page
    google_maps_route_url   TEXT,                       -- Direct route link
    official_website_url    TEXT,
    official_tickets_url    TEXT,                       -- Outbound target for Sticky Price Calculator CTA
    scraper_source_url      TEXT,
    -- Aggregated Display Metrics (for fast sorting on listing cards)
    rating_score            REAL CHECK (rating_score IS NULL OR (rating_score >= 1.0 AND rating_score <= 5.0)),
    rating_count            INTEGER NOT NULL DEFAULT 0,
    min_single_price_cents  INTEGER,                    -- e.g. 820 (€ 8,20) for card display; 0 for free open water
    featured_badge_nl       TEXT,                       -- e.g. 'Populairste Keuze', 'Direct Beschikbaar'
    hero_photos_json        TEXT NOT NULL DEFAULT '[]', -- JSON array of {url, alt_nl, badge_nl} (5-photo grid)
    -- SEO & Sitemap Tracking
    content_hash            TEXT,                       -- Only bump lastmod_at when content_hash changes!
    lastmod_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (municipality_slug, slug)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_venues_geo_bbox ON venues(lat, lng);
CREATE INDEX IF NOT EXISTS idx_venues_municipality ON venues(municipality_slug, venue_type);
CREATE INDEX IF NOT EXISTS idx_venues_treatment ON venues(primary_water_treatment);

-- ----------------------------------------------------------------------------
-- 3. CORE ENTITY 2: BASINS (Individual Water Basins inside a Venue)
-- ----------------------------------------------------------------------------

-- Grain: 1 row per physical water basin inside a venue (every venue has >= 1 default basin)
CREATE TABLE IF NOT EXISTS basins (
    id                      TEXT PRIMARY KEY,
    venue_id                TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    name_nl                 TEXT NOT NULL,              -- e.g. '50m Wedstrijdbad', 'Golfslag- & Recreatiebad'
    basin_category          TEXT NOT NULL CHECK (
        basin_category IN (
            'COMPETITION_50M',
            'COMPETITION_25M',
            'INSTRUCTION_TARGET_GROUP', -- Doelgroepenbad / Instructiebad (vaak 31-32°C)
            'SUBTROPICAL_WAVE_RECREATION',
            'TODDLER_POOL',             -- Peuter- & Kleuterbad (vaak 32.5-33°C)
            'OUTDOOR_HEATED_BASIN',
            'OUTDOOR_UNHEATED_BASIN',
            'NATURAL_OPEN_WATER'
        )
    ),
    is_default_basin        INTEGER NOT NULL DEFAULT 0 CHECK (is_default_basin IN (0, 1)),
    is_indoor               INTEGER NOT NULL DEFAULT 1 CHECK (is_indoor IN (0, 1)),
    length_meters           REAL,                       -- e.g. 25.0, 50.0
    lanes_count             INTEGER,                    -- e.g. 8
    has_movable_floor       INTEGER NOT NULL DEFAULT 0 CHECK (has_movable_floor IN (0, 1)),
    water_treatment         TEXT NOT NULL DEFAULT 'TRADITIONAL_CHLORINE' CHECK (
        water_treatment IN (
            'SALT_ELECTROLYSIS',
            'TRADITIONAL_CHLORINE',
            'UV_LOW_CHLORINE',
            'NATURAL_UNTREATED'
        )
    ),
    -- Indoor basins have fixed target temperatures; outdoor/open-water use outdoor_conditions
    target_temp_celsius     REAL,                       -- e.g. 27.8, 31.2, 32.5
    warm_water_day_note_nl  TEXT                        -- e.g. 'Woensdag Warmwaterdag (32.0°C)'
) STRICT;

CREATE INDEX IF NOT EXISTS idx_basins_venue ON basins(venue_id);

-- Grain: 1 row per environmental reading for OUTDOOR / OPEN-WATER venues only
CREATE TABLE IF NOT EXISTS outdoor_conditions (
    id                      TEXT PRIMARY KEY,
    venue_id                TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    source_authority        TEXT NOT NULL CHECK (
        source_authority IN ('RIJKSWATERSTAAT', 'ZWEMWATER_NL', 'MUNICIPAL_SENSOR', 'MANUAL')
    ),
    water_temp_celsius      REAL,                       -- e.g. 14.2
    water_quality_state     TEXT NOT NULL DEFAULT 'CLEAN_APPROVED' CHECK (
        water_quality_state IN (
            'CLEAN_APPROVED',           -- Goedgekeurd / Schoon
            'WARNING_BLAUWALG',         -- Waarschuwing blauwalg
            'WARNING_ZWEMMERSJEUK',     -- Waarschuwing zwemmersjeuk
            'NEGATIVE_SWIM_ADVICE',     -- Negatief zwemadvies
            'SWIMMING_BAN'              -- Zwemverbod
        )
    ),
    wetsuit_advice_nl       TEXT,                       -- e.g. 'Wetsuit vereist (3-5mm) + zwemboei'
    measured_at             TEXT NOT NULL,              -- ISO8601 UTC
    is_current              INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1))
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_outdoor_conditions_current
    ON outdoor_conditions(venue_id) WHERE is_current = 1;

-- ----------------------------------------------------------------------------
-- 4. SCHEDULES & HOLIDAY ROSTERS (SCD2 + Verification FSM)
-- ----------------------------------------------------------------------------

-- Grain: 1 row per schedule period (Regular Winter/Summer, School Vacation, or Public Holiday)
CREATE TABLE IF NOT EXISTS schedule_periods (
    id                      TEXT PRIMARY KEY,
    venue_id                TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    schedule_type           TEXT NOT NULL CHECK (
        schedule_type IN (
            'REGULAR_WINTER',
            'REGULAR_SUMMER',
            'SCHOOL_VACATION',          -- e.g. Herfstvakantierooster
            'PUBLIC_HOLIDAY',           -- e.g. Koningsdag / Tweede Paasdag
            'TEMPORARY_OVERRIDE'
        )
    ),
    title_nl                TEXT NOT NULL,              -- e.g. 'Regulier Rooster 2026', 'Herfstvakantierooster'
    valid_from              TEXT NOT NULL,              -- ISO 'YYYY-MM-DD'
    valid_to                TEXT NOT NULL,              -- ISO 'YYYY-MM-DD'
    priority                INTEGER NOT NULL DEFAULT 10, -- 100=Holiday, 80=Override, 50=Vacation, 10=Regular
    -- Schedule Verification FSM
    verification_state      TEXT NOT NULL DEFAULT 'UNCONFIRMED_FALLBACK' CHECK (
        verification_state IN (
            'VERIFIED_PUBLISHED',       -- Scraped & sanity-checked official roster for this period
            'CONFIRMED_REGULAR',        -- Pool explicitly confirmed regular hours apply
            'UNCONFIRMED_FALLBACK'      -- Holiday/vacation active, special roster not yet verified -> show warning banner
        )
    ),
    source_snapshot_hash    TEXT,
    verified_at             TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS idx_schedule_periods_active
    ON schedule_periods(venue_id, valid_from, valid_to, priority DESC);

-- Grain: 1 row per recurring daily time slot inside a schedule_period
CREATE TABLE IF NOT EXISTS schedule_slots (
    id                      TEXT PRIMARY KEY,
    schedule_period_id      TEXT NOT NULL REFERENCES schedule_periods(id) ON DELETE CASCADE,
    basin_id                TEXT REFERENCES basins(id) ON DELETE SET NULL,
    day_of_week             INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=Maandag .. 7=Zondag
    activity_type           TEXT NOT NULL CHECK (
        activity_type IN (
            'BANENZWEMMEN',
            'VRIJZWEMMEN_RECREATIEF',
            'ZWEMLES_ABC',
            'DOELGROEPEN_AQUASPORT',
            'OUDER_EN_KIND',
            'WARMWATERZWEMMEN',
            'LADIES_ONLY',
            'NATUURWATER_TOEGANG'
        )
    ),
    label_nl                TEXT NOT NULL,              -- e.g. 'Vroege Vogel Banen', 'Avond Banenzwemmen 50m'
    start_time              TEXT NOT NULL,              -- 'HH:MM' 24h Europe/Amsterdam (e.g. '07:00')
    end_time                TEXT NOT NULL,              -- 'HH:MM' 24h Europe/Amsterdam (e.g. '09:30')
    crowd_indication        TEXT CHECK (
        crowd_indication IS NULL OR crowd_indication IN ('QUIET', 'MODERATE', 'BUSY')
    ),
    notes_nl                TEXT                        -- e.g. 'Snelle & trage banen ingedeeld'
) STRICT;

CREATE INDEX IF NOT EXISTS idx_schedule_slots_period_day
    ON schedule_slots(schedule_period_id, day_of_week, start_time);

-- ----------------------------------------------------------------------------
-- 5. TARIFFS & ADMISSIONS (SCD Type 2 Versioned Pricing)
-- ----------------------------------------------------------------------------

-- Grain: 1 row per tariff item per venue per validity window (SCD Type 2)
CREATE TABLE IF NOT EXISTS tariffs (
    id                      TEXT PRIMARY KEY,
    venue_id                TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    tariff_category         TEXT NOT NULL CHECK (
        tariff_category IN (
            'SINGLE_ADULT',             -- Losse entree volwassene
            'SINGLE_CHILD',             -- Losse entree kind (t/m 12 jr)
            'MULTI_PASS_10',            -- 10-Badenkaart
            'MULTI_PASS_12',            -- 12-Badenkaart
            'MONTHLY_UNLIMITED_LANES',  -- Maandabonnement onbeperkt banenzwemmen
            'ZWEMLES_MONTHLY_PACKAGE',  -- Zwemlespakket per maand
            'ZWEMLES_ALL_IN_GUARANTEE', -- All-in diplomagarantie pakket
            'EQUIPMENT_RENTAL'          -- Huur wetsuit / accessoires
        )
    ),
    title_nl                TEXT NOT NULL,              -- e.g. '10-Badenkaart (6 maanden geldig)'
    subtitle_nl             TEXT,                       -- e.g. 'Voordelig zwemmen (€ 7,40 per bezoek)'
    price_cents             INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 250000),
    unit_label_nl           TEXT NOT NULL,              -- e.g. 'per sessie', 'per maand', '6 mnd geldig'
    visits_included         INTEGER,                    -- e.g. 10 for 10-badenkaart (used in break-even calculator)
    is_highlighted          INTEGER NOT NULL DEFAULT 0 CHECK (is_highlighted IN (0, 1)),
    badge_nl                TEXT,                       -- e.g. 'Meest gekozen', '10% besparing'
    -- SCD Type 2 Validity
    tariff_year             INTEGER NOT NULL,           -- e.g. 2025, 2026
    valid_from              TEXT NOT NULL,              -- ISO 'YYYY-MM-DD'
    valid_to                TEXT,                       -- NULL if currently active
    is_current              INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_tariffs_venue_current
    ON tariffs(venue_id, is_current);

-- ----------------------------------------------------------------------------
-- 6. CORE ENTITY 3: SWIM PROVIDERS, ZWEM-ABC OFFERINGS & WAITLISTS (SCD2)
-- ----------------------------------------------------------------------------

-- Grain: 1 row per Swim School Organization (Municipal or Commercial Private School)
CREATE TABLE IF NOT EXISTS swim_providers (
    id                      TEXT PRIMARY KEY,
    slug                    TEXT NOT NULL UNIQUE,       -- e.g. 'zwemschool-de-dolfijn'
    name                    TEXT NOT NULL,              -- e.g. 'Zwemschool De Dolfijn'
    provider_type           TEXT NOT NULL CHECK (
        provider_type IN ('MUNICIPAL_OPERATOR', 'COMMERCIAL_SWIM_SCHOOL', 'ASSOCIATION_VERENIGING')
    ),
    is_nrz_licensed         INTEGER NOT NULL DEFAULT 1 CHECK (is_nrz_licensed IN (0, 1)),
    methodology_nl          TEXT,                       -- e.g. 'NRZ Zwem-ABC', 'EasySwim', 'SuperSpetters'
    -- B2B Partnership Lifecycle FSM (Day 1 starts at UNCLAIMED)
    b2b_partner_state       TEXT NOT NULL DEFAULT 'UNCLAIMED' CHECK (
        b2b_partner_state IN ('UNCLAIMED', 'CLAIMED_FREE', 'PILOT_PARTNER', 'PAYING_PARTNER', 'PAUSED')
    ),
    official_registration_url TEXT,
    lead_webhook_url        TEXT,
    lead_notification_email TEXT,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

-- Grain: 1 row per Swim Provider teaching a specific Diploma Track at a specific Venue
CREATE TABLE IF NOT EXISTS venue_swim_offerings (
    id                      TEXT PRIMARY KEY,
    venue_id                TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    provider_id             TEXT NOT NULL REFERENCES swim_providers(id) ON DELETE CASCADE,
    diploma_track           TEXT NOT NULL CHECK (
        diploma_track IN (
            'WATERGEWENNING',
            'DIPLOMA_A',
            'DIPLOMA_B',
            'DIPLOMA_C',
            'ABC_COMPLETE_PACKAGE',
            'TURBO_SNELCURSUS',
            'PRIVATE_OR_LOW_STIMULUS'   -- Privéles / Prikkelarm / Kleine groepen
        )
    ),
    monthly_price_cents     INTEGER CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0),
    has_diploma_guarantee   INTEGER NOT NULL DEFAULT 0 CHECK (has_diploma_guarantee IN (0, 1)),
    group_max_size          INTEGER,                    -- e.g. 6, 8, 12
    lesson_duration_mins    INTEGER DEFAULT 45,
    current_waitlist_weeks_min INTEGER,                 -- e.g. 4
    current_waitlist_weeks_max INTEGER,                 -- e.g. 6 (0 = Direct plek!)
    direct_spots_note_nl    TEXT,                       -- e.g. 'Direct instromen: woensdagmiddag (Nog 3 plekken)'
    registration_url        TEXT,                       -- Direct link to school's registration portal
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (venue_id, provider_id, diploma_track)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_offerings_venue_waitlist
    ON venue_swim_offerings(venue_id, diploma_track, current_waitlist_weeks_min);

-- Grain: 1 row per historical waitlist measurement per offering (SCD Type 2)
CREATE TABLE IF NOT EXISTS waitlist_snapshots (
    id                      TEXT PRIMARY KEY,
    offering_id             TEXT NOT NULL REFERENCES venue_swim_offerings(id) ON DELETE CASCADE,
    waitlist_weeks_min      INTEGER NOT NULL CHECK (waitlist_weeks_min >= 0),
    waitlist_weeks_max      INTEGER NOT NULL CHECK (waitlist_weeks_max >= waitlist_weeks_min),
    available_spots_count   INTEGER,
    valid_from              TEXT NOT NULL,
    valid_to                TEXT,
    is_current              INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1))
) STRICT;

-- ----------------------------------------------------------------------------
-- 7. DAY-1 DEMAND CAPTURE: WAITLIST ALERTS, LEADS & OUTBOUND CLICK TELEMETRY
-- ----------------------------------------------------------------------------

-- Grain: 1 row per parent request for 'Kortste Wachttijd Vergelijker & Alert' (AVG-Minimal)
CREATE TABLE IF NOT EXISTS lead_requests (
    id                      TEXT PRIMARY KEY,
    idempotency_key         TEXT NOT NULL UNIQUE,       -- sha256(email + pc4 + diploma_track + date_bucket)
    source_venue_id         TEXT REFERENCES venues(id) ON DELETE SET NULL,
    parent_email            TEXT NOT NULL,
    parent_name             TEXT,
    postcode_pc4            TEXT NOT NULL,
    child_age_years         REAL NOT NULL CHECK (child_age_years >= 0.0 AND child_age_years <= 18.0),
    diploma_track           TEXT NOT NULL,
    preferred_days_json     TEXT NOT NULL DEFAULT '[]', -- e.g. '["woensdagmiddag","zaterdagochtend"]'
    prefers_salt_water      INTEGER NOT NULL DEFAULT 0 CHECK (prefers_salt_water IN (0, 1)),
    opt_in_nearby_schools   INTEGER NOT NULL DEFAULT 1 CHECK (opt_in_nearby_schools IN (0, 1)),
    -- Lead Lifecycle FSM
    lead_state              TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (
        lead_state IN (
            'SUBMITTED',
            'TURNSTILE_VERIFIED',
            'COMPARISON_SENT',          -- Day-1 automated Top-3 shortest waitlist email sent
            'ROUTED_TO_PARTNER',        -- Phase-2 when a partner school claims/receives the lead
            'UNSUBSCRIBED',
            'REJECTED_SPAM'
        )
    ),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_lead_requests_pc4_track
    ON lead_requests(postcode_pc4, diploma_track, created_at);

-- Grain: 1 row per daily aggregated outbound click per venue & action type (B2B Proof & DDoS-safe)
CREATE TABLE IF NOT EXISTS outbound_click_daily_counts (
    click_date              TEXT NOT NULL,              -- ISO 'YYYY-MM-DD'
    venue_id                TEXT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    click_target_type       TEXT NOT NULL CHECK (
        click_target_type IN (
            'OFFICIAL_TICKETS_CALCULATOR',
            'OFFICIAL_ZWEMLES_SIGNUP',
            'OFFICIAL_WEBSITE',
            'GOOGLE_MAPS_ROUTE',
            'AFFILIATE_STUB_PRODUCT'
        )
    ),
    clicks_count            INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (click_date, venue_id, click_target_type)
) STRICT;

-- ----------------------------------------------------------------------------
-- 8. SECURITY-HARDENED AFFILIATE GEAR STUB (Allowlist Only, Disabled by Default)
-- ----------------------------------------------------------------------------

-- Grain: 1 row per allowlisted affiliate product slug (Prevents Open-Redirect vulnerabilities)
CREATE TABLE IF NOT EXISTS affiliate_product_stubs (
    slug                    TEXT PRIMARY KEY,           -- e.g. 'neopreen-wetsuit-4mm', 'anti-chloor-shampoo'
    context_rule            TEXT NOT NULL CHECK (
        context_rule IN ('COLD_OPEN_WATER', 'CHLORINE_CARE', 'ZWEMLES_KIDS_GEAR')
    ),
    title_nl                TEXT NOT NULL,
    target_url              TEXT NOT NULL CHECK (target_url LIKE 'https://%'),
    is_enabled              INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)) -- Stub disabled at launch
) STRICT;

-- ----------------------------------------------------------------------------
-- 9. OBSERVABILITY: INGESTION RUNS, QUARANTINE GATE & ALERT COOLDOWN FSM
-- ----------------------------------------------------------------------------

-- Grain: 1 row per CLI / Cron ingestion execution
CREATE TABLE IF NOT EXISTS ingestion_runs (
    run_id                  TEXT PRIMARY KEY,           -- e.g. '20261021-pre-herfst-noord'
    runner_env              TEXT NOT NULL CHECK (
        runner_env IN ('CF_CRON_WORKER', 'GITHUB_ACTIONS', 'COOLIFY_DOCKER', 'LOCAL_MAC')
    ),
    job_type                TEXT NOT NULL,              -- e.g. 'POOL_SCRAPE', 'RWS_WATER_TEMP', 'KNMI_ALERTS'
    run_state               TEXT NOT NULL CHECK (
        run_state IN ('RUNNING', 'COMPLETED_CLEAN', 'COMPLETED_WITH_QUARANTINES', 'FAILED')
    ),
    venues_checked          INTEGER NOT NULL DEFAULT 0,
    venues_updated          INTEGER NOT NULL DEFAULT 0,
    venues_unchanged        INTEGER NOT NULL DEFAULT 0,
    venues_quarantined      INTEGER NOT NULL DEFAULT 0,
    log_file_path           TEXT,                       -- e.g. 'logs/runs/2026-10-21_sync.jsonl'
    started_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    finished_at             TEXT
) STRICT;

-- Grain: 1 row per quarantined scrape anomaly (with 24h Alert Cooldown FSM)
CREATE TABLE IF NOT EXISTS quarantined_anomalies (
    id                      TEXT PRIMARY KEY,
    run_id                  TEXT NOT NULL REFERENCES ingestion_runs(run_id),
    venue_slug              TEXT NOT NULL,
    failure_step            TEXT NOT NULL CHECK (
        failure_step IN ('HTTP_FETCH_STEP1', 'CDP_BROWSER_STEP2', 'ZOD_PARSE', 'SANITY_INVARIANT')
    ),
    error_code              TEXT NOT NULL,              -- e.g. 'HTTP_403_BLOCK', 'SANITY_PRICE_OUT_OF_RANGE'
    error_detail            TEXT NOT NULL,
    snapshot_file_path      TEXT,                       -- e.g. 'logs/anomalies/2026-10-21_de-mirandabad.html'
    local_fix_command       TEXT NOT NULL,              -- e.g. 'pnpm sync:venue --slug=de-mirandabad --inspect'
    -- Alert Cooldown & Resolution FSM
    alert_state             TEXT NOT NULL DEFAULT 'ANOMALY_DETECTED' CHECK (
        alert_state IN ('ANOMALY_DETECTED', 'WEBHOOK_ALERT_SENT', 'SUPPRESSED_COOLDOWN', 'RESOLVED_LOCALLY')
    ),
    last_alerted_at         TEXT,
    resolved_at             TEXT,
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_quarantined_cooldown
    ON quarantined_anomalies(venue_slug, error_code, alert_state);
