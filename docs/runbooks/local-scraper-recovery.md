# Runbook: Local Scraper Quarantine Recovery (`pnpm sync:venue`)

> **When to use this runbook:** You received a **Webhook Push Alert** (or saw an entry in [`logs/anomalies/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/logs/)) indicating that one or more swimming pools failed scraping or were quarantined by the **Zod Sanity Gate**.

---

## What Already Happened Automatically (Don't Panic)

1. **Production D1 Data is Safe:** The Sanity Gate blocked the broken scrape from overwriting live prices or schedules in Cloudflare D1.
2. **Users Are Warned If Needed:** If a regional school vacation or public holiday is currently active for that pool, the website automatically displays the `UNCONFIRMED_FALLBACK` banner advising visitors to double-check the pool's official site.
3. **Alert Cooldown Active:** Duplicate alerts for the same `(venue_slug, error_code)` are suppressed for 24 hours while you fix it.

---

## Case 1: Datacenter IP Block (`HTTP_403_BLOCK` / `HTTP_429`)

**Symptom in Alert/Log:**
The pool's website blocked the GitHub Actions or Hetzner datacenter IP, but works fine in a normal home browser.

**Fix (30 seconds on your Mac):**
```bash
# 1. Pull latest logs & repo state
git pull

# 2. Run the portable CLI from your Mac's residential IP and push directly to D1
pnpm sync:venue --slug=<venue-slug> --push-d1
```
*If Step 1 (`fetch`) still gets challenged, run with Step 2 (`Lightpanda`/`Obscura` CDP) or Step 3 (local Chrome):*
```bash
pnpm sync:venue --slug=<venue-slug> --browser=local-chrome --push-d1
```

---

## Case 2: Pool Changed Its HTML Layout (`SANITY_PRICE_OUT_OF_RANGE` / `ZOD_PARSE`)

**Symptom in Alert/Log:**
The pool redesigned its webpage, so our selector extracted `€ 0,00` or `0` time slots. The raw HTML was saved to `logs/anomalies/<date>_<venue-slug>.html`.

**Fix (TDD against the saved snapshot):**
```bash
# 1. Inspect the quarantined HTML snapshot locally without making network requests
pnpm sync:venue --slug=<venue-slug> --from-snapshot=logs/anomalies/<date>_<venue-slug>.html --inspect

# 2. Update the venue's parser/selector and run Vitest unit tests against the snapshot
pnpm test src/ingestion/parsers/<parser-name>.test.ts

# 3. Re-run against live site & push verified data to Cloudflare D1
pnpm sync:venue --slug=<venue-slug> --push-d1
```

---

## Case 3: Pool Published a Non-Machine-Readable Image / Complex PDF Holiday Roster

**Symptom in Alert/Log:**
The pool posted its *Kerstvakantierooster* as a scanned image or graphic where automated extraction is impractical.

**Fix (Manual JSON Override with SCD2 Dates):**
1. Create or edit `database-context/manual-overrides/<venue-slug>.json` with the `valid_from` and `valid_to` dates of the holiday period.
2. Apply and validate the override through the exact same Zod Sanity Gate:
```bash
pnpm sync:overrides --slug=<venue-slug> --push-d1
```
3. Record any reusable parser lesson in [`docs/lessons/`](file:///Users/sramzzs4d/Projects-sramzz/swimming/docs/lessons/).
