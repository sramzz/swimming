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
}

export interface VenueJsonLdOutput {
  [key: string]: unknown;
  '@context': string;
  '@type': string;
  name: string;
  url: string;
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

export function buildVenueJsonLd(input: VenueJsonLdInput): VenueJsonLdOutput {
  const output: VenueJsonLdOutput = {
    '@context': 'https://schema.org',
    '@type': 'PublicSwimmingPool',
    name: input.name,
    url: `https://allezwembaden.nl/zwembad/${input.citySlug}/${input.slug}`,
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
