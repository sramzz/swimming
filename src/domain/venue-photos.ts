export interface VenueHeroPhoto {
  url: string;
  alt_nl: string;
  badge_nl?: string;
}

const SUBTROPICAL_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/subtropical-dome-1.webp',
    alt_nl: 'Subtropisch zwemparadijs met glazen koepel, palmbomen en glijbaan',
    badge_nl: 'Subtropische Glazen Koepel',
  },
  {
    url: '/images/venues/subtropical-dome-2.webp',
    alt_nl: 'Tropisch golfslagbad met waterglijbanen en helderblauw zwemwater',
    badge_nl: 'Golfslagbad & Glijbanen',
  },
  {
    url: '/images/venues/subtropical-dome-3.webp',
    alt_nl: 'Hoog overzicht van subtropisch golfslagbad en recreatiebassin',
    badge_nl: 'Subtropisch Recreatiebad',
  },
  {
    url: '/images/venues/subtropical-dome-4.webp',
    alt_nl: 'Verwarmd subtropisch binnenbad met stroomversnelling en glijbaan',
    badge_nl: 'Verwarmd Golfslagbad',
  },
  {
    url: '/images/venues/subtropical-dome-5.webp',
    alt_nl: 'Lichte subtropische zwemhal met koepeldak en tropisch groen',
    badge_nl: 'Subtropisch Paradijs',
  },
];

const LANES_50M_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/lanes-50m-1.webp',
    alt_nl: '50-meter Olympisch wedstrijdbad met startblokken en banenlijnen',
    badge_nl: '50m Wedstrijdbad',
  },
  {
    url: '/images/venues/lanes-50m-2.webp',
    alt_nl: 'Ruim 50-meter sportzwembad voor banenzwemmen en KNZB-training',
    badge_nl: '50m Olympisch Bad',
  },
  {
    url: '/images/venues/lanes-50m-3.webp',
    alt_nl: 'Wedstrijdzwembad met strakke banenlijnen en helder sportwater',
    badge_nl: 'Banenzwemmen',
  },
  {
    url: '/images/venues/lanes-50m-4.webp',
    alt_nl: 'Sportief banenzwemmen in overdekt 50-meter bassin',
    badge_nl: 'Sportbassin',
  },
];

const LANES_25M_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/lanes-25m-1.webp',
    alt_nl: 'Modern overdekt 25-meter wedstrijdbad met hoge ramen en daglicht',
    badge_nl: '25m Wedstrijdbad',
  },
  {
    url: '/images/venues/lanes-25m-2.webp',
    alt_nl: '25-meter binnenbad met banenlijnen voor ochtend- en avondzwemmen',
    badge_nl: '25m Banenbad',
  },
  {
    url: '/images/venues/lanes-25m-3.webp',
    alt_nl: 'Helder overdekt zwembad met ingedeelde snelle en rustige banen',
    badge_nl: 'Binnenbad 25m',
  },
  {
    url: '/images/venues/lanes-25m-4.webp',
    alt_nl: 'Overdekt sportbassin voor conditiezwemmen en aquasport',
    badge_nl: 'Conditie & Banen',
  },
];

const ZWEMLES_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/zwemles-1.webp',
    alt_nl: 'Gecertificeerde zweminstructeur geeft Zwem-ABC les aan kinderen',
    badge_nl: 'Zwemles A/B/C',
  },
  {
    url: '/images/venues/zwemles-2.webp',
    alt_nl: 'Zwemles in kleine groepen in verwarmd instructiebad',
    badge_nl: 'NRZ Zwemles',
  },
  {
    url: '/images/venues/zwemles-3.webp',
    alt_nl: 'Kinderen oefenen voor hun zwemdiploma in het doelgroepenbad',
    badge_nl: 'Instructiebad',
  },
];

const TODDLER_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/toddler-pool-1.webp',
    alt_nl: 'Verwarmd peuter- en kleuterbad met speelfonteinen (32°C)',
    badge_nl: 'Verwarmd Peuterbad',
  },
  {
    url: '/images/venues/toddler-pool-2.webp',
    alt_nl: 'Ondiep recreatie- en familiebad voor ouder- en kindzwemmen',
    badge_nl: 'Gezins- & Peuterbad',
  },
];

const OUTDOOR_POOL_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/outdoor-pool-1.webp',
    alt_nl: 'Verwarmd openluchtbad met groene ligweide en zonneterras',
    badge_nl: 'Buitenbad & Ligweide',
  },
  {
    url: '/images/venues/outdoor-pool-2.webp',
    alt_nl: 'Zonnig buitenbassin met helderblauw zwemwater en zwembanen',
    badge_nl: 'Openluchtbad',
  },
  {
    url: '/images/venues/outdoor-pool-3.webp',
    alt_nl: 'Openlucht zwembad omringd door groen in de zomerzon',
    badge_nl: 'Zomerbuitenbad',
  },
  {
    url: '/images/venues/outdoor-pool-4.webp',
    alt_nl: 'Sfeervol buitenbad met ontspanningsruimte en ligstoelen',
    badge_nl: 'Recreatie Buitenbad',
  },
];

const BOUTIQUE_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/boutique-pool-1.webp',
    alt_nl: 'Kleinschalig verwarmd zwembad (32°C) voor privéles en kleine groepen',
    badge_nl: 'Kleinschalig & Warm (32°C)',
  },
  {
    url: '/images/venues/boutique-pool-2.webp',
    alt_nl: 'Rustig doelgroepenbad met zoutelektrolyse en warme watertemperatuur',
    badge_nl: 'Doelgroepen & Wellness',
  },
];

const OPEN_WATER_PHOTOS: VenueHeroPhoto[] = [
  {
    url: '/images/venues/open-water-1.webp',
    alt_nl: 'Natuurwater zwemlocatie met houten zwemsteiger en open-water zwemmers',
    badge_nl: 'Officiële Zwemplek',
  },
  {
    url: '/images/venues/open-water-2.webp',
    alt_nl: 'Helder recreatiemeer en zandstrand gecontroleerd op zwemwaterkwaliteit',
    badge_nl: 'Natuurwater & Strand',
  },
  {
    url: '/images/venues/open-water-3.webp',
    alt_nl: 'Rustige Nederlandse zwemplas omringd door natuur en rietkragen',
    badge_nl: 'Recreatieplas',
  },
  {
    url: '/images/venues/open-water-4.webp',
    alt_nl: 'Uitgestrekte open-water zwemlocatie voor buitenzwemmen en triatlon',
    badge_nl: 'Open Water Spot',
  },
  {
    url: '/images/venues/open-water-5.webp',
    alt_nl: 'Natuurlijke zwemvijver met schoon zwemwater en groene oevers',
    badge_nl: 'Schoon Natuurwater',
  },
  {
    url: '/images/venues/open-water-6.webp',
    alt_nl: 'Zonnige zwemplas met gemarkeerde zwemzone en ligweide',
    badge_nl: 'Zwemzone & Ligweide',
  },
  {
    url: '/images/venues/open-water-7.webp',
    alt_nl: 'Fris open zwemwater geschikt voor baantjes trekken en koudwatertraining',
    badge_nl: 'Buitenwater',
  },
  {
    url: '/images/venues/open-water-8.webp',
    alt_nl: 'Schilderachtige zwemlocatie aan het water met Rijkswaterstaat controle',
    badge_nl: 'Rijkswaterstaat Zwemplek',
  },
];

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number, offset = 0): T {
  return arr[(seed + offset) % arr.length];
}

export function buildCuratedPhotosForVenue(params: {
  slug: string;
  name: string;
  venueType: string;
}): VenueHeroPhoto[] {
  const { slug, name, venueType } = params;

  // Explicit flagship overrides matching the DesignMockups 1:1
  if (slug === 'de-mirandabad') {
    return [
      {
        url: '/images/venues/subtropical-dome-1.webp',
        alt_nl: `${name} - Subtropische Glazen Koepel met palmbomen en golfslagbad`,
        badge_nl: 'Subtropische Glazen Koepel',
      },
      {
        url: '/images/venues/lanes-50m-1.webp',
        alt_nl: `${name} - 50m Olympisch Wedstrijdbad`,
        badge_nl: '50m Wedstrijdbad',
      },
      {
        url: '/images/venues/toddler-pool-1.webp',
        alt_nl: `${name} - Verwarmd Peuterbad (32.5°C)`,
        badge_nl: 'Verwarmd Peuterbad',
      },
      {
        url: '/images/venues/zwemles-1.webp',
        alt_nl: `${name} - Officiële NRZ Zwemles A/B/C`,
        badge_nl: 'Zwemles A/B/C',
      },
      {
        url: '/images/venues/outdoor-pool-1.webp',
        alt_nl: `${name} - Buitenbad & Zonneweide`,
        badge_nl: 'Buitenbad & Ligweide',
      },
    ];
  }

  if (slug === 'sportfondsenbad-oost') {
    return [
      {
        url: '/images/venues/lanes-25m-1.webp',
        alt_nl: `${name} - 25m Wedstrijdbad met daglicht`,
        badge_nl: '25m Wedstrijdbad',
      },
      {
        url: '/images/venues/zwemles-2.webp',
        alt_nl: `${name} - Doelgroepenbad & Zwemles A/B/C`,
        badge_nl: 'Zwemles A/B/C',
      },
      {
        url: '/images/venues/toddler-pool-1.webp',
        alt_nl: `${name} - Verwarmd Peuter- en Kleuterbad`,
        badge_nl: 'Verwarmd Peuterbad',
      },
      {
        url: '/images/venues/lanes-25m-2.webp',
        alt_nl: `${name} - Banenzwemmen in Amsterdam-Oost`,
        badge_nl: 'Banenzwemmen',
      },
      {
        url: '/images/venues/boutique-pool-1.webp',
        alt_nl: `${name} - Warmwater en instructiebassin`,
        badge_nl: 'Instructiebad',
      },
    ];
  }

  if (slug === 'sloterparkbad') {
    return [
      {
        url: '/images/venues/zwemles-2.webp',
        alt_nl: `${name} - NRZ Licentiehouder Zwemles A/B/C`,
        badge_nl: 'NRZ Licentiehouder',
      },
      {
        url: '/images/venues/lanes-50m-2.webp',
        alt_nl: `${name} - 50m Olympisch Binnenbad`,
        badge_nl: '50m Wedstrijdbad',
      },
      {
        url: '/images/venues/outdoor-pool-1.webp',
        alt_nl: `${name} - Buitenbad & Ligweide`,
        badge_nl: 'Buitenbad',
      },
      {
        url: '/images/venues/toddler-pool-1.webp',
        alt_nl: `${name} - Peuter- & Recreatiebad`,
        badge_nl: 'Recreatiebad',
      },
      {
        url: '/images/venues/zwemles-1.webp',
        alt_nl: `${name} - Zwemles in kleine groepen`,
        badge_nl: 'Zwemles Kleine Groepen',
      },
    ];
  }

  if (slug === 'gaasperplas-open-water') {
    return [
      {
        url: '/images/venues/open-water-1.webp',
        alt_nl: `${name} - Open water zwemlocatie met zwemsteiger`,
        badge_nl: 'Natuurwater',
      },
      {
        url: '/images/venues/open-water-4.webp',
        alt_nl: `${name} - Zwemzone gecontroleerd door Rijkswaterstaat`,
        badge_nl: 'Rijkswaterstaat Keurmerk',
      },
      {
        url: '/images/venues/open-water-6.webp',
        alt_nl: `${name} - Kleedsteigers en ligweide`,
        badge_nl: 'Kleedsteigers',
      },
      {
        url: '/images/venues/open-water-2.webp',
        alt_nl: `${name} - Recreatiestrand Amsterdam Zuidoost`,
        badge_nl: 'Zandstrand & Steigers',
      },
      {
        url: '/images/venues/open-water-7.webp',
        alt_nl: `${name} - Triatlon en koudwatertraining`,
        badge_nl: 'Open Water Training',
      },
    ];
  }

  if (slug === 'tongelreep-zwemparadijs') {
    return [
      {
        url: '/images/venues/lanes-50m-2.webp',
        alt_nl: `${name} - 50m Olympisch Topsportbad Eindhoven`,
        badge_nl: '50m Olympisch Bad',
      },
      {
        url: '/images/venues/lanes-50m-1.webp',
        alt_nl: `${name} - KNZB Trainings- en Wedstrijdbassin`,
        badge_nl: 'Wedstrijdbassin',
      },
      {
        url: '/images/venues/zwemles-3.webp',
        alt_nl: `${name} - Instructiebad voor Zwemles A/B/C`,
        badge_nl: 'Zwemles A/B/C',
      },
      {
        url: '/images/venues/toddler-pool-2.webp',
        alt_nl: `${name} - Doelgroepen- en Recreatiebad`,
        badge_nl: 'Recreatiebad',
      },
      {
        url: '/images/venues/lanes-25m-2.webp',
        alt_nl: `${name} - 25m Inzwembad`,
        badge_nl: '25m Bassin',
      },
    ];
  }

  if (slug === 'ra-sports-swimming-utrecht') {
    return [
      {
        url: '/images/venues/boutique-pool-1.webp',
        alt_nl: `${name} - Verwarmd 32°C zoutwater instructiebad in Utrecht`,
        badge_nl: 'Direct Beschikbaar',
      },
      {
        url: '/images/venues/zwemles-1.webp',
        alt_nl: `${name} - Zwemles in kleine groepen (max 6 kinderen)`,
        badge_nl: 'Kleine Groepen',
      },
      {
        url: '/images/venues/zwemles-2.webp',
        alt_nl: `${name} - Privéles & Zwem-ABC met diplomagarantie`,
        badge_nl: 'Zwem-ABC Specialist',
      },
      {
        url: '/images/venues/boutique-pool-2.webp',
        alt_nl: `${name} - Zoutelektrolyse zwembad zonder chloorlucht`,
        badge_nl: 'Zoutelektrolyse',
      },
      {
        url: '/images/venues/toddler-pool-1.webp',
        alt_nl: `${name} - Baby-, Peuter- en Kleuterzwemmen`,
        badge_nl: 'Ouder & Kind',
      },
    ];
  }

  const seed = hashSlug(slug);

  if (venueType === 'SUBTROPICAL_PARADISE') {
    return [
      pick(SUBTROPICAL_PHOTOS, seed, 0),
      pick(LANES_25M_PHOTOS, seed, 1),
      pick(TODDLER_PHOTOS, seed, 0),
      pick(ZWEMLES_PHOTOS, seed, 1),
      pick(OUTDOOR_POOL_PHOTOS, seed, 2),
    ];
  }

  if (venueType === 'OPEN_WATER_NATURAL') {
    return [
      pick(OPEN_WATER_PHOTOS, seed, 0),
      pick(OPEN_WATER_PHOTOS, seed, 1),
      pick(OPEN_WATER_PHOTOS, seed, 2),
      pick(OPEN_WATER_PHOTOS, seed, 3),
      pick(OPEN_WATER_PHOTOS, seed, 4),
    ];
  }

  if (venueType === 'OUTDOOR_SEASONAL_POOL') {
    return [
      pick(OUTDOOR_POOL_PHOTOS, seed, 0),
      pick(OUTDOOR_POOL_PHOTOS, seed, 1),
      pick(LANES_50M_PHOTOS, seed, 0),
      pick(TODDLER_PHOTOS, seed, 1),
      pick(OUTDOOR_POOL_PHOTOS, seed, 2),
    ];
  }

  if (venueType === 'INDOOR_AND_OUTDOOR') {
    return [
      pick(LANES_25M_PHOTOS, seed, 0),
      pick(OUTDOOR_POOL_PHOTOS, seed, 1),
      pick(LANES_50M_PHOTOS, seed, 2),
      pick(ZWEMLES_PHOTOS, seed, 0),
      pick(TODDLER_PHOTOS, seed, 1),
    ];
  }

  if (venueType === 'BOUTIQUE_SWIM_SCHOOL_POOL') {
    return [
      pick(BOUTIQUE_PHOTOS, seed, 0),
      pick(ZWEMLES_PHOTOS, seed, 1),
      pick(ZWEMLES_PHOTOS, seed, 2),
      pick(BOUTIQUE_PHOTOS, seed, 1),
      pick(TODDLER_PHOTOS, seed, 0),
    ];
  }

  // Default: INDOOR_ONLY
  const indoorLeadPool = [...LANES_25M_PHOTOS, ...LANES_50M_PHOTOS];
  return [
    pick(indoorLeadPool, seed, 0),
    pick(ZWEMLES_PHOTOS, seed, 1),
    pick(TODDLER_PHOTOS, seed, 0),
    pick(LANES_25M_PHOTOS, seed, 2),
    pick(BOUTIQUE_PHOTOS, seed, 1),
  ];
}

export function parseVenuePhotos(venue: {
  slug: string;
  name: string;
  venue_type: string;
  hero_photos_json?: string | null;
}): VenueHeroPhoto[] {
  if (venue.hero_photos_json && venue.hero_photos_json !== '[]') {
    try {
      const parsed = JSON.parse(venue.hero_photos_json) as VenueHeroPhoto[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      // Fallback to deterministic generator
    }
  }
  return buildCuratedPhotosForVenue({
    slug: venue.slug,
    name: venue.name,
    venueType: venue.venue_type,
  });
}
