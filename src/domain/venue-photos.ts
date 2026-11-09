export interface VenueHeroPhoto {
  url: string;
  alt_nl: string;
  badge_nl?: string;
}

const OFFICIAL_PHOTO_SLUGS = new Set([
  'de-mirandabad',
  'sportfondsenbad-oost',
  'sloterparkbad',
  'gaasperplas-open-water',
  'ra-sports-swimming-utrecht',
  'tongelreep-zwemparadijs',
  'noorderparkbad',
  'zuiderbad-amsterdam',
  'het-marnix-amsterdam',
  'flevoparkbad-amsterdam',
  'bijlmer-sportcentrum',
  'zwemcentrum-rotterdam',
  'oostelijk-zwembad-rotterdam',
  'van-maanenbad-rotterdam',
  'hofbad-den-haag',
  'de-blinkerd-scheveningen',
  'tikibad-duinrell',
  'zwembad-den-hommel',
  'zwembad-de-kwakel-utrecht',
  'krommerijn-zwembad-utrecht',
  'amerena-amersfoort',
  'ottenbad-eindhoven',
  'recreatiebad-stappegoor',
  'zwembad-sonsbeeck-breda',
  'kardinge-sportcentrum-groningen',
  'zwembad-de-vrolijkheid-zwolle',
  'de-scheg-deventer',
  'sportiom-den-bosch',
  'geusseltbad-maastricht',
  'de-blauwe-golf-leeuwarden',
  'de-bonte-wever-assen',
  'optisport-het-mineraal-almere',
  'vrijburgbad-vlissingen',
  'boschbad-apeldoorn',
  'aquacentrum-malkander-apeldoorn',
  'boerhaavebad-haarlem',
  'skwa-hoofddorp',
  'de-hoornse-vaart-alkmaar',
  'sportboulevard-dordrecht',
  'groenhovenbad-gouda',
  'aquadrome-enschede',
  'twentebad-hengelo',
  'aquarena-emmen',
  'de-koploper-lelystad',
  'sportstad-heerenveen',
  'de-grote-koppel-arnhem',
  'erica-terpstra-nijmegen',
  'de-goffert-nijmegen',
  'sportfondsenbad-kerkpolder-delft',
  'zwembad-de-veur-zoetermeer',
  'zwembad-de-vallei-veenendaal',
  'zwembad-dijnselburg-zeist',
  'caribabad-gorinchem',
  'de-warande-oosterhout',
  'laco-glanerbrook-geleen',
  'de-ijzeren-man-weert',
  'omnium-goes',
]);

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

const OPEN_WATER_BASE_PHOTOS: VenueHeroPhoto[] = [
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

function getOpenWaterPool(): VenueHeroPhoto[] {
  const pool = [...OPEN_WATER_BASE_PHOTOS];
  for (let i = 9; i <= 24; i++) {
    pool.push({
      url: `/images/venues/open-water-${i}.webp`,
      alt_nl: `Officiële Rijkswaterstaat open-water zwemlocatie en natuurstrand (${i})`,
      badge_nl: 'Rijkswaterstaat Zwemplek',
    });
  }
  return pool;
}

function hasOfficialVenuePhotoOnDisk(slug: string): boolean {
  return OFFICIAL_PHOTO_SLUGS.has(slug);
}

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

function badgeForType(venueType: string): string {
  switch (venueType) {
    case 'SUBTROPICAL_PARADISE':
      return 'Subtropisch Zwemparadijs';
    case 'OUTDOOR_SEASONAL_POOL':
      return 'Openluchtbad & Ligweide';
    case 'INDOOR_AND_OUTDOOR':
      return 'Binnen- & Buitenbad';
    case 'BOUTIQUE_SWIM_SCHOOL_POOL':
      return 'Zwemschool & Doelgroepenbad';
    case 'OPEN_WATER_NATURAL':
      return 'Officiële Zwemwaterlocatie';
    default:
      return 'Officiële Locatiefoto';
  }
}

export function buildCuratedPhotosForVenue(params: {
  slug: string;
  name: string;
  venueType: string;
}): VenueHeroPhoto[] {
  const { slug, name, venueType } = params;
  const seed = hashSlug(slug);

  let gallery: VenueHeroPhoto[];

  if (venueType === 'SUBTROPICAL_PARADISE') {
    gallery = [
      pick(SUBTROPICAL_PHOTOS, seed, 0),
      pick(LANES_25M_PHOTOS, seed, 1),
      pick(TODDLER_PHOTOS, seed, 0),
      pick(ZWEMLES_PHOTOS, seed, 1),
      pick(OUTDOOR_POOL_PHOTOS, seed, 2),
    ];
  } else if (venueType === 'OPEN_WATER_NATURAL') {
    const openWaterPhotos = getOpenWaterPool();
    gallery = [
      pick(openWaterPhotos, seed, 0),
      pick(openWaterPhotos, seed, 1),
      pick(openWaterPhotos, seed, 2),
      pick(openWaterPhotos, seed, 3),
      pick(openWaterPhotos, seed, 4),
    ];
  } else if (venueType === 'OUTDOOR_SEASONAL_POOL') {
    gallery = [
      pick(OUTDOOR_POOL_PHOTOS, seed, 0),
      pick(OUTDOOR_POOL_PHOTOS, seed, 1),
      pick(LANES_50M_PHOTOS, seed, 0),
      pick(TODDLER_PHOTOS, seed, 1),
      pick(OUTDOOR_POOL_PHOTOS, seed, 2),
    ];
  } else if (venueType === 'INDOOR_AND_OUTDOOR') {
    gallery = [
      pick(LANES_25M_PHOTOS, seed, 0),
      pick(OUTDOOR_POOL_PHOTOS, seed, 1),
      pick(LANES_50M_PHOTOS, seed, 2),
      pick(ZWEMLES_PHOTOS, seed, 0),
      pick(TODDLER_PHOTOS, seed, 1),
    ];
  } else if (venueType === 'BOUTIQUE_SWIM_SCHOOL_POOL') {
    gallery = [
      pick(BOUTIQUE_PHOTOS, seed, 0),
      pick(ZWEMLES_PHOTOS, seed, 1),
      pick(ZWEMLES_PHOTOS, seed, 2),
      pick(BOUTIQUE_PHOTOS, seed, 1),
      pick(TODDLER_PHOTOS, seed, 0),
    ];
  } else {
    const indoorLeadPool = [...LANES_25M_PHOTOS, ...LANES_50M_PHOTOS];
    gallery = [
      pick(indoorLeadPool, seed, 0),
      pick(ZWEMLES_PHOTOS, seed, 1),
      pick(TODDLER_PHOTOS, seed, 0),
      pick(LANES_25M_PHOTOS, seed, 2),
      pick(BOUTIQUE_PHOTOS, seed, 1),
    ];
  }

  // If a dedicated official / Wikimedia venue photograph exists in public/images/venues/official/<slug>.webp,
  // make it the primary hero photo (photos[0]) and keep 4 distinct supporting basin/facility photos!
  if (hasOfficialVenuePhotoOnDisk(slug)) {
    const officialLead: VenueHeroPhoto = {
      url: `/images/venues/official/${slug}.webp`,
      alt_nl: `${name} – Officiële foto zwemaccommodatie`,
      badge_nl: badgeForType(venueType),
    };
    const supporting = gallery.filter((p) => p.url !== officialLead.url).slice(0, 4);
    return [officialLead, ...supporting];
  }

  return gallery;
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
