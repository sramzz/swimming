import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  deduplicatePhysicalPools,
  isPhysicalDuplicate,
  normalizeStreetAndNumber,
  type PhysicalPoolComparisonItem,
} from '../../src/cli/harvest-national-pools';
import curatedPoolsRaw from '../../src/data/curated-pools.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REMOVED_DUPLICATE_SLUGS = [
  // 5 gold standard dups
  'de-mirandabad-amsterdam',
  'de-mirandabad-amsterdam-amsterdam-duivendrecht',
  'het-sloterparkbad-amsterdam',
  'sportfondsenbad-amsterdam-oost-amsterdam',
  'nationaal-zwemcentrum-de-tongelreep-eindhoven',
  // 15 flagship dups
  'zwemcentrum-rotterdam-110',
  'zwembad-het-hofbad-den-haag',
  'zwembad-de-blinkerd-den-haag',
  'de-krommerijn-utrecht',
  'sportiom-aquafun-s-hertogenbosch',
  'feel-fit-center-middelburg-vlissingen',
  'openluchtbad-boschbad-apeldoorn',
  'sportcomplex-koning-willem-alexander-hoofddorp',
  'zwembad-hoornse-vaart-alkmaar',
  'het-groenhovenbad-gouda',
  'het-diekman-enschede',
  'goffertbad-nijmegen',
  'zwembad-kerkpolder-delft',
  'laco-geleen',
  'omnium-zwembad-goes',
  // Cross-municipality scraped duplicate of Bijlmer Sportcentrum
  'zwembad-bijlmer-amsterdam',
  // 2 border-village dups
  'zwembad-ruinen-ruinen-ruinen-dr-westerveld',
  'zwembad-de-bargn-s-kloosterhaar-kloosterhaar-ov-twenterand',
];

const GOLD_STANDARD_VENUES = [
  { slug: 'de-mirandabad', name: 'Zwemcentrum De Mirandabad', street_address: 'De Mirandalaan 9', postcode_pc4: '1079', lat: 52.3387, lng: 4.9021, municipality_slug: 'amsterdam' },
  { slug: 'sportfondsenbad-oost', name: 'Sportfondsenbad Amsterdam-Oost', street_address: 'Land van Cocagneplein 44', postcode_pc4: '1093', lat: 52.3564, lng: 4.9275, municipality_slug: 'amsterdam' },
  { slug: 'sloterparkbad', name: 'Sloterparkbad', street_address: 'President Allendelaan 3', postcode_pc4: '1064', lat: 52.3718, lng: 4.8054, municipality_slug: 'amsterdam' },
  { slug: 'tongelreep-zwemparadijs', name: 'Nationaal Zwemcentrum de Tongelreep', street_address: 'Antoon Coolenlaan 1', postcode_pc4: '5644', lat: 51.4162, lng: 5.4792, municipality_slug: 'eindhoven' },
  { slug: 'ra-sports-swimming-utrecht', name: 'R&A Sports & Swimming - Utrecht', street_address: 'Grebbeberglaan 15', postcode_pc4: '3544', lat: 52.0985, lng: 5.0542, municipality_slug: 'utrecht' },
  { slug: 'gaasperplas-open-water', name: 'Gaasperplas Open Water Spot', street_address: 'Langbroekdreef', postcode_pc4: '1108', lat: 52.3095, lng: 4.9912, municipality_slug: 'amsterdam' },
];

describe('deduplicatePhysicalPools & Physical Duplicate Detection', () => {
  it('normalizes street name and house number correctly', () => {
    expect(normalizeStreetAndNumber('De Mirandalaan 9')).toEqual({
      normalizedStreet: 'demirandalaan',
      houseNumber: '9',
    });
    expect(normalizeStreetAndNumber('President Allendelaan 3')).toEqual({
      normalizedStreet: 'presidentallendelaan',
      houseNumber: '3',
    });
    expect(normalizeStreetAndNumber('Bennebroekerweg 800')).toEqual({
      normalizedStreet: 'bennebroekerweg',
      houseNumber: '800',
    });
    expect(normalizeStreetAndNumber('Dorpsstraat 35-A')).toEqual({
      normalizedStreet: 'dorpsstraat',
      houseNumber: '35',
    });
    expect(normalizeStreetAndNumber(null)).toBeNull();
    expect(normalizeStreetAndNumber('')).toBeNull();
  });

  it('detects duplicates matching normalized street_address within <= 2000m', () => {
    const venueA: PhysicalPoolComparisonItem = {
      name: 'Zwemcentrum De Mirandabad',
      street_address: 'De Mirandalaan 9',
      lat: 52.3387,
      lng: 4.9021,
    };
    const venueB: PhysicalPoolComparisonItem = {
      name: 'De Mirandabad Amsterdam',
      street_address: 'De Mirandalaan 9',
      lat: 52.3386,
      lng: 4.9022, // ~12m
    };
    expect(isPhysicalDuplicate(venueA, venueB)).toBe(true);
  });

  it('detects duplicates matching normalized street_address and matching PC4 even if distance exceeds 2000m', () => {
    const skwaFlagship: PhysicalPoolComparisonItem = {
      name: 'Sportcomplex Koning Willem-Alexander (SKWA)',
      street_address: 'Bennebroekerweg 800',
      postcode_pc4: '2134',
      lat: 52.2858,
      lng: 4.6754,
    };
    const skwaScraped: PhysicalPoolComparisonItem = {
      name: 'SKWA Hoofddorp',
      street_address: 'Bennebroekerweg 800',
      postcode_pc4: '2134',
      lat: 52.3019,
      lng: 4.6298, // ~3.5km away due to rural road centroid offset
    };
    expect(isPhysicalDuplicate(skwaFlagship, skwaScraped)).toBe(true);
  });

  it('detects duplicates within <= 120m with meaningful name token overlap', () => {
    const venueA: PhysicalPoolComparisonItem = {
      name: 'Het Groenhovenbad',
      street_address: 'Tobbepad 4',
      lat: 52.0289,
      lng: 4.6975,
    };
    const venueB: PhysicalPoolComparisonItem = {
      name: 'Groenhovenbad Gouda',
      street_address: 'Tobbepad',
      lat: 52.0294,
      lng: 4.6980, // ~60m away
    };
    expect(isPhysicalDuplicate(venueA, venueB)).toBe(true);
  });

  it('keeps genuinely distinct pools at nearby locations (<120m) with different names and addresses', () => {
    const venueA: PhysicalPoolComparisonItem = {
      name: 'Sporthal De Brug',
      street_address: 'Brugstraat 1',
      postcode_pc4: '1000',
      lat: 52.3500,
      lng: 4.9000,
    };
    const venueB: PhysicalPoolComparisonItem = {
      name: 'Zwemparadijs Waterlelie',
      street_address: 'Parklaan 10',
      postcode_pc4: '1000',
      lat: 52.3506,
      lng: 4.9008, // ~88m away, completely distinct names and addresses
    };
    expect(isPhysicalDuplicate(venueA, venueB)).toBe(false);
  });

  it('keeps distinct pools in different cities that share generic street names (e.g. Sportlaan 4)', () => {
    const poolBiddinghuizen: PhysicalPoolComparisonItem = {
      name: 'Zwembad De Alk',
      street_address: 'Sportlaan 4',
      postcode_pc4: '8256',
      lat: 52.4542,
      lng: 5.6921,
    };
    const poolTubbergen: PhysicalPoolComparisonItem = {
      name: 'Zwembad De Vlaskoel',
      street_address: 'Sportlaan 4',
      postcode_pc4: '7651',
      lat: 52.4087,
      lng: 6.7824, // ~74km away
    };
    expect(isPhysicalDuplicate(poolBiddinghuizen, poolTubbergen)).toBe(false);
  });

  it('filters out scraped duplicates against existing reference pools via deduplicatePhysicalPools', () => {
    const referencePools: PhysicalPoolComparisonItem[] = [
      {
        slug: 'de-mirandabad',
        name: 'Zwemcentrum De Mirandabad',
        street_address: 'De Mirandalaan 9',
        postcode_pc4: '1079',
        lat: 52.3387,
        lng: 4.9021,
      },
    ];

    const candidates: PhysicalPoolComparisonItem[] = [
      {
        slug: 'de-mirandabad-amsterdam',
        name: 'De Mirandabad',
        street_address: 'De Mirandalaan 9',
        postcode_pc4: '1079',
        lat: 52.3386,
        lng: 4.9022,
      },
      {
        slug: 'zwembad-het-y-amsterdam',
        name: 'Zwembad Het Y',
        street_address: 'Wielingenstraat 21',
        postcode_pc4: '1078',
        lat: 52.3456,
        lng: 4.8876,
      },
    ];

    const deduplicated = deduplicatePhysicalPools(candidates, referencePools);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].slug).toBe('zwembad-het-y-amsterdam');
  });
});

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

describe('curated-pools.json & GOLD_STANDARD Data Integrity', () => {
  const pools = curatedPoolsRaw as Array<{
    slug: string;
    name: string;
    street_address: string;
    postcode_pc4: string | null;
    postcode_pc6: string | null;
    municipality_slug: string;
    woonplaats_slug?: string;
    woonplaats_id?: string;
    woonplaats_bag_id?: string;
    lat: number;
    lng: number;
  }>;

  it('does not contain any of the 22 removed duplicate slugs', () => {
    const poolSlugSet = new Set(pools.map((p) => p.slug));
    const foundDuplicates = REMOVED_DUPLICATE_SLUGS.filter((slug) => poolSlugSet.has(slug));
    expect(foundDuplicates).toEqual([]);
  });

  it('preserves every flagship pool that has an official .webp photo', () => {
    const officialDir = path.resolve(__dirname, '../../public/images/venues/official');
    const officialFiles = fs.readdirSync(officialDir).filter((f) => f.endsWith('.webp'));
    expect(officialFiles.length).toBeGreaterThanOrEqual(50);

    const allVenues = [...GOLD_STANDARD_VENUES, ...pools];
    const venueSlugSet = new Set(allVenues.map((v) => v.slug));

    for (const file of officialFiles) {
      const slug = file.replace('.webp', '');
      expect(venueSlugSet.has(slug)).toBe(true);
    }
  });

  it('updates zwembad-de-bargn-s-kloosterhaar to twenterand and kloosterhaar-ov-twenterand', () => {
    const bargn = pools.find((p) => p.slug === 'zwembad-de-bargn-s-kloosterhaar');
    expect(bargn).toBeDefined();
    expect(bargn?.municipality_slug).toBe('twenterand');
    expect(bargn?.woonplaats_slug).toBe('kloosterhaar-ov-twenterand');
    expect(bargn?.woonplaats_id).toBe('wpl-3323');
  });

  it('preserves zwembad-ruinen-ruinen in de-wolden', () => {
    const ruinen = pools.find((p) => p.slug === 'zwembad-ruinen-ruinen');
    expect(ruinen).toBeDefined();
    expect(ruinen?.municipality_slug).toBe('de-wolden');
  });

  it('contains 0 duplicate normalized street addresses within 500m across all pools regardless of municipality', () => {
    const allVenues = [...GOLD_STANDARD_VENUES, ...pools];
    expect(allVenues).toHaveLength(673);
    const duplicates: Array<{ a: string; b: string; addr: string; distM: number }> = [];

    for (let i = 0; i < allVenues.length; i++) {
      for (let j = i + 1; j < allVenues.length; j++) {
        const a = allVenues[i];
        const b = allVenues[j];

        const addrA = normalizeStreetAndNumber(a.street_address);
        const addrB = normalizeStreetAndNumber(b.street_address);
        if (!addrA || !addrB) continue;

        if (
          addrA.normalizedStreet === addrB.normalizedStreet &&
          addrA.houseNumber === addrB.houseNumber
        ) {
          const d = haversineMeters(a.lat, a.lng, b.lat, b.lng);
          if (d <= 500) {
            duplicates.push({ a: a.slug, b: b.slug, addr: a.street_address, distM: Math.round(d) });
          }
        }
      }
    }

    expect(duplicates).toHaveLength(0);
  });
});
