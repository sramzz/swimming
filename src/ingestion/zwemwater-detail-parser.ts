export interface ZwemwaterSpotDetail {
  spotid: number;
  statusTextNl: string | null;
  recentMeasurementStatusNl: string | null;
  entranceFeeCode: string | null;
  isPaidAccess: boolean;
  waterQuality4YearClassNl: 'uitstekend' | 'goed' | 'aanvaardbaar' | 'slecht' | null;
  locationOwnerNl: string | null;
  descriptionNl: string | null;
  seasonTextNl: string | null;
  waterProfileUrl: string | null;
  infoBoardUrl: string | null;
  officialPhotoUrls: string[];
  featuresNl: string[];
  restrictionsNl: string[];
  warnings: Array<{ titleNl: string; bodyNl: string }>;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirstMatch(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  if (!match || !match[1]) return null;
  const cleaned = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ''));
  return cleaned.length > 0 ? cleaned : null;
}

function stripLeadingLabel(str: string | null): string | null {
  if (!str) return null;
  return str
    .replace(/^(Actuele situatie|Toegang|Waterkwaliteit in de laatste vier jaar|Locatiebeheerder|Adres):\s*/i, '')
    .trim();
}

/**
 * Pure parser for Zwemwater.nl's per-spot detail HTML fragment
 * (`https://www.zwemwater.nl/wp-content/themes/stuurlui/blocks/map/map-content.php?spotid=<spotid>`).
 */
export function parseZwemwaterSpotDetailHtml(spotid: number, html: string): ZwemwaterSpotDetail {
  const statusTextNl =
    extractFirstMatch(html, /<p class="spot-status">([\s\S]*?)<\/p>/i) ??
    extractFirstMatch(html, /<div class="status-text[^"]*">([\s\S]*?)<\/div>/i);

  const recentMeasurementStatusNl = stripLeadingLabel(
    extractFirstMatch(html, /<li class="spot-recent_measurement_status">([\s\S]*?)<\/li>/i) ??
      extractFirstMatch(html, /<div class="spot-recent_measurement">([\s\S]*?)<\/div>/i)
  );

  const entranceFeeCode = stripLeadingLabel(
    extractFirstMatch(html, /<li class="spot-entrance_fee">([\s\S]*?)<\/li>/i) ??
      extractFirstMatch(html, /<div class="spot-entrance_fee">([\s\S]*?)<\/div>/i)
  );

  const feeUpper = (entranceFeeCode ?? '').toUpperCase();
  const isPaidAccess = Boolean(
    entranceFeeCode &&
      !feeUpper.includes('ONBETAALD') &&
      !feeUpper.includes('GRATIS') &&
      (feeUpper.includes('BETAALD') ||
        feeUpper.includes('CAMPINGGASTEN') ||
        feeUpper.includes('GASTEN') ||
        feeUpper.includes('LEDEN') ||
        feeUpper.includes('ENTREE'))
  );

  const qualityRaw =
    extractFirstMatch(html, /<li class="spot-water_quality_last_4_year">([\s\S]*?)<\/li>/i) ??
    extractFirstMatch(html, /<div class="spot-water_quality_last_4_year">([\s\S]*?)<\/div>/i);
  let waterQuality4YearClassNl: ZwemwaterSpotDetail['waterQuality4YearClassNl'] = null;
  if (qualityRaw) {
    const lower = qualityRaw.toLowerCase();
    if (lower.includes('uitstekend')) waterQuality4YearClassNl = 'uitstekend';
    else if (lower.includes('goed')) waterQuality4YearClassNl = 'goed';
    else if (lower.includes('aanvaardbaar')) waterQuality4YearClassNl = 'aanvaardbaar';
    else if (lower.includes('slecht')) waterQuality4YearClassNl = 'slecht';
  }

  const locationOwnerNl = stripLeadingLabel(
    extractFirstMatch(html, /<li class="spot-location_owner_info">([\s\S]*?)<\/li>/i) ??
      extractFirstMatch(html, /<div class="spot-location_owner_info">([\s\S]*?)<\/div>/i)
  );

  const descriptionNl =
    extractFirstMatch(html, /<p class="spot-description">([\s\S]*?)<\/p>/i) ??
    extractFirstMatch(html, /<h3[^>]*>\s*Informatie\s*<\/h3>\s*<p>([\s\S]*?)<\/p>/i);

  const seasonTextNl =
    extractFirstMatch(html, /<p class="spot-location_owner_info">([\s\S]*?)<\/p>/i) ??
    extractFirstMatch(html, /<p>\s*(Het seizoen bij deze zwemplek[\s\S]*?)(?:<br|<\/p>)/i);

  // Links to register.zwemwater.nl/zwr/api/files/...
  let waterProfileUrl: string | null = null;
  let infoBoardUrl: string | null = null;
  const officialPhotoUrls: string[] = [];

  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const href = (linkMatch[1] ?? '').trim();
    const label = decodeHtmlEntities((linkMatch[2] ?? '').replace(/<[^>]+>/g, '')).toLowerCase();
    if (!href.includes('register.zwemwater.nl')) continue;
    if (label.includes('informatiebord')) {
      infoBoardUrl = href;
    } else if (label.startsWith('foto')) {
      officialPhotoUrls.push(href);
    } else if (!waterProfileUrl) {
      waterProfileUrl = href;
    }
  }

  // Features & Restrictions
  const featuresNl: string[] = [];
  const restrictionsNl: string[] = [];
  const featureRegex = /<li class="spot-feature[^"]*">([\s\S]*?)<\/li>/gi;
  let featMatch: RegExpExecArray | null;
  while ((featMatch = featureRegex.exec(html)) !== null) {
    const inner = featMatch[1] ?? '';
    const tooltipMatch = inner.match(/<span[^>]*class="tooltip-span"[^>]*>([\s\S]*?)<\/span>/i);
    const featText = tooltipMatch?.[1]
      ? decodeHtmlEntities(tooltipMatch[1].replace(/<[^>]+>/g, ''))
      : decodeHtmlEntities(inner.replace(/<[^>]+>/g, ''));
    if (!featText) continue;
    featuresNl.push(featText);
    const lower = featText.toLowerCase();
    if (
      lower.includes('niet toegestaan') ||
      lower.includes('verbod') ||
      lower.includes('afgebakend') ||
      lower.includes('toezicht')
    ) {
      restrictionsNl.push(featText);
    }
  }

  // Warnings (handles both <li class="spot-warning"> and <ul class="warning-list"><li>)
  const warnings: Array<{ titleNl: string; bodyNl: string }> = [];
  const warningBlockMatch = html.match(/<ul class="warning-list">([\s\S]*?)<\/ul>/i);
  if (warningBlockMatch && warningBlockMatch[1]) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRegex.exec(warningBlockMatch[1])) !== null) {
      const inner = liMatch[1] ?? '';
      const titleNl =
        extractFirstMatch(inner, /<h5[^>]*>([\s\S]*?)<\/h5>/i) ??
        extractFirstMatch(inner, /<span class="bold">([\s\S]*?)<\/span>/i) ??
        'Officiële melding';
      const bodyNl =
        extractFirstMatch(inner, /<p[^>]*>([\s\S]*?)<\/p>/i) ??
        extractFirstMatch(inner, /<small[^>]*>([\s\S]*?)<\/small>/i) ??
        '';
      if (titleNl || bodyNl) {
        warnings.push({ titleNl, bodyNl });
      }
    }
  }

  return {
    spotid,
    statusTextNl,
    recentMeasurementStatusNl,
    entranceFeeCode,
    isPaidAccess,
    waterQuality4YearClassNl,
    locationOwnerNl,
    descriptionNl,
    seasonTextNl,
    waterProfileUrl,
    infoBoardUrl,
    officialPhotoUrls,
    featuresNl,
    restrictionsNl,
    warnings,
  };
}
