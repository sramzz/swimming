export function shouldGenerateIndexableFacetPage(matchingVenuesCount: number): boolean {
  return matchingVenuesCount >= 1;
}

export function formatEuroCentsNl(cents: number): string {
  return `€ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

export interface CitySeoSummaryInput {
  cityName: string;
  totalVenues: number;
  saltWaterCount: number;
  cheapestSinglePriceCents: number | null;
  cheapestVenueName: string | null;
  shortestWaitlistWeeks: number | null;
}

export function buildCitySeoSummaryNl(input: CitySeoSummaryInput): string {
  const parts: string[] = [
    `In ${input.cityName} zijn er ${input.totalVenues} zwemlocaties (waaronder ${input.saltWaterCount} zwembaden met huidvriendelijke zoutelektrolyse).`,
  ];

  if (input.cheapestSinglePriceCents !== null && input.cheapestVenueName) {
    parts.push(
      `Een los entreekaartje begint vanaf ${formatEuroCentsNl(input.cheapestSinglePriceCents)} bij ${input.cheapestVenueName}.`
    );
  }

  if (input.shortestWaitlistWeeks !== null) {
    parts.push(
      `De kortste wachttijd voor Zwemdiploma A in ${input.cityName} bedraagt momenteel circa ${input.shortestWaitlistWeeks} weken.`
    );
  }

  return parts.join(' ');
}

export interface VenueJsonLdInput {
  name: string;
  slug: string;
  citySlug: string;
  cityName: string;
  streetAddress: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
  ratingScore: number | null;
  ratingCount: number;
  minPriceCents: number | null;
  waterTreatment: string;
  images?: string[];
  description?: string | null;
  officialWebsiteUrl?: string | null;
}

export interface VenueJsonLdOutput {
  [key: string]: unknown;
  '@context': string;
  '@type': string;
  name: string;
  url: string;
  image?: string[];
  description?: string;
  sameAs?: string;
  isAccessibleForFree?: boolean;
  address: {
    '@type': string;
    streetAddress?: string;
    postalCode?: string;
    addressLocality: string;
    addressCountry: string;
  };
  geo: {
    '@type': string;
    latitude: number;
    longitude: number;
  };
  amenityFeature: Array<{
    '@type': string;
    name: string;
    value: string;
  }>;
  aggregateRating?: {
    '@type': string;
    ratingValue: number;
    reviewCount: number;
    bestRating: number;
  };
  offers?: {
    '@type': string;
    priceCurrency: string;
    price: string;
  };
}

function toAbsoluteZwemkaartUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return urlOrPath;
  }
  return new URL(urlOrPath, 'https://zwemkaart.nl').toString();
}

export function buildVenueJsonLd(input: VenueJsonLdInput): VenueJsonLdOutput {
  const output: VenueJsonLdOutput = {
    '@context': 'https://schema.org',
    '@type': 'PublicSwimmingPool',
    name: input.name,
    url: `https://zwemkaart.nl/zwembad/${input.citySlug}/${input.slug}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: input.cityName,
      addressCountry: 'NL',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: input.lat,
      longitude: input.lng,
    },
    amenityFeature: [
      {
        '@type': 'LocationFeatureSpecification',
        name: 'Waterbehandeling',
        value: input.waterTreatment === 'SALT_ELECTROLYSIS' ? 'Zoutelektrolyse' : 'Chloor / Natuurwater',
      },
    ],
  };

  if (input.images && input.images.length > 0) {
    output.image = input.images.map(toAbsoluteZwemkaartUrl);
  }
  if (input.description) {
    output.description = input.description;
  }
  if (input.officialWebsiteUrl) {
    output.sameAs = input.officialWebsiteUrl;
  }
  if (input.minPriceCents !== null) {
    output.isAccessibleForFree = input.minPriceCents === 0;
  }

  if (input.streetAddress) {
    output.address.streetAddress = input.streetAddress;
  }
  if (input.postcode) {
    output.address.postalCode = input.postcode;
  }

  if (input.ratingScore !== null && input.ratingCount > 0) {
    output.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.ratingScore,
      reviewCount: input.ratingCount,
      bestRating: 5,
    };
  }

  if (input.minPriceCents !== null) {
    output.offers = {
      '@type': 'Offer',
      priceCurrency: 'EUR',
      price: (input.minPriceCents / 100).toFixed(2),
    };
  }

  return output;
}

export interface ItemListJsonLdInput {
  name: string;
  url: string;
  items: Array<{ name: string; url: string; image?: string }>;
}

export function buildItemListJsonLd(input: ItemListJsonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    url: toAbsoluteZwemkaartUrl(input.url),
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      url: toAbsoluteZwemkaartUrl(item.url),
      ...(item.image ? { image: toAbsoluteZwemkaartUrl(item.image) } : {}),
    })),
  };
}

export interface CityIntentSeoMeta {
  title: string;
  h1: string;
  description: string;
}

export function buildCityIntentSeoMeta(
  cityName: string,
  intent: string,
  venueCount: number
): CityIntentSeoMeta {
  if (intent === 'banenzwemmen') {
    return {
      title: `Banenzwemmen in ${cityName} (${venueCount} baden & tijden) | Zwemkaart.nl`,
      h1: `Banenzwemmen in ${cityName}`,
      description: `Bekijk alle ${venueCount} zwembaden voor banenzwemmen in ${cityName}. Vergelijk vroege ochtendbanen, watertemperatuur, zoutelektrolyse en losse entreeprijzen.`,
    };
  }
  if (intent === 'zwemles') {
    return {
      title: `Zwemles A/B/C in ${cityName} (${venueCount} aanbieders & wachttijden) | Zwemkaart.nl`,
      h1: `Zwemles A/B/C in ${cityName}`,
      description: `Vergelijk ${venueCount} erkende zwemscholen en gemeentebaden voor Zwem-ABC in ${cityName}. Bekijk actuele wachtlijsten in weken en maandtarieven.`,
    };
  }
  if (intent === 'buitenwater') {
    return {
      title: `Buitenzwemmen & Natuurwater in ${cityName} (${venueCount} locaties) | Zwemkaart.nl`,
      h1: `Buitenzwemmen & Natuurwater in ${cityName}`,
      description: `Ontdek ${venueCount} officiële Rijkswaterstaat zwemwaterlocaties en buitenbaden in ${cityName}. Bekijk actuele waarschuwingen, blauwalg-controles en informatieborden.`,
    };
  }
  return {
    title: `${intent} in ${cityName} | Zwemkaart.nl`,
    h1: `${intent} in ${cityName}`,
    description: `Overzicht van ${venueCount} zwemlocaties voor ${intent} in ${cityName}.`,
  };
}
