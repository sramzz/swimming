import type { VenueRow } from '../db/queries';

export type SearchSuggestionKind = 'm' | 'w' | 'v';

export type CompactSearchTuple = [
  kind: SearchSuggestionKind,
  label: string,
  sublabel: string,
  url: string,
  meta?: string,
];

export interface PreparedSearchEntry {
  kind: SearchSuggestionKind;
  label: string;
  sublabel: string;
  url: string;
  normalizedLabel: string;
  haystack: string;
}

export interface SearchSuggestion {
  kind: SearchSuggestionKind;
  label: string;
  sublabel: string;
  url: string;
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

export interface GroupedSuggestionItem {
  index: number;
  suggestion: SearchSuggestion;
}

export interface SearchSuggestionGroup {
  title: string;
  items: GroupedSuggestionItem[];
}

const DUTCH_STOP_WORDS = new Set(['de', 'het', 'een']);

/**
 * Strips combining diacritics and lowercases text for fast, accent-insensitive matching.
 */
export function normalizeSuggestionText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tokenizeSuggestionQuery(rawQuery: string): {
  fullQuery: string;
  tokens: string[];
} {
  const normalized = normalizeSuggestionText(rawQuery).trim().replace(/\s+/g, ' ');
  if (normalized === '') {
    return { fullQuery: '', tokens: [] };
  }
  const rawTokens = normalized.split(' ').filter(Boolean);
  const meaningfulTokens = rawTokens.filter((token) => !DUTCH_STOP_WORDS.has(token));
  const tokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;
  return { fullQuery: tokens.join(' '), tokens };
}

/**
 * Pre-normalizes compact JSON index tuples once so per-keystroke filtering stays sub-millisecond.
 */
export function prepareSearchIndex(tuples: CompactSearchTuple[]): PreparedSearchEntry[] {
  return tuples.map(([kind, label, sublabel, url, meta]) => {
    const normalizedLabel = normalizeSuggestionText(label);
    const haystack = normalizeSuggestionText(
      meta ? `${label} ${sublabel} ${meta}` : `${label} ${sublabel}`
    );
    return {
      kind,
      label,
      sublabel,
      url,
      normalizedLabel,
      haystack,
    };
  });
}

function formatSlugDisplayName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part, idx) => {
      if (idx > 0 && (part === 'en' || part === 'aan' || part === 'de' || part === 'den' || part === 'op' || part === 'bij' || part === 'te' || part === 'ter')) {
        return part;
      }
      if (part === 's' && idx === 0) return "'s";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function formatCountNl(count: number): string {
  return count === 1 ? '1 locatie' : `${count} locaties`;
}

/**
 * Derives an in-memory search index directly from the homepage VenueRow[] dataset (0 network I/O).
 */
export function buildSearchEntriesFromVenues(venues: VenueRow[]): PreparedSearchEntry[] {
  const munCounts = new Map<string, number>();
  const wpInfo = new Map<string, { name: string; munName: string; count: number }>();

  for (const v of venues) {
    munCounts.set(v.municipality_slug, (munCounts.get(v.municipality_slug) ?? 0) + 1);
    if (
      v.woonplaats_slug &&
      v.woonplaats_name &&
      v.woonplaats_slug !== v.municipality_slug
    ) {
      const existing = wpInfo.get(v.woonplaats_slug);
      if (existing) {
        existing.count += 1;
      } else {
        wpInfo.set(v.woonplaats_slug, {
          name: v.woonplaats_name,
          munName: formatSlugDisplayName(v.municipality_slug),
          count: 1,
        });
      }
    }
  }

  const tuples: CompactSearchTuple[] = [];
  const seenPlaceSlugs = new Set<string>();

  for (const [munSlug, count] of munCounts.entries()) {
    seenPlaceSlugs.add(munSlug);
    const label = formatSlugDisplayName(munSlug);
    tuples.push([
      'm',
      label,
      `Gemeente · ${formatCountNl(count)}`,
      `/steden/${munSlug}`,
      munSlug.replace(/-/g, ' '),
    ]);
  }

  for (const [wpSlug, info] of wpInfo.entries()) {
    if (seenPlaceSlugs.has(wpSlug)) continue;
    seenPlaceSlugs.add(wpSlug);
    tuples.push([
      'w',
      info.name,
      `${info.munName} · ${formatCountNl(info.count)}`,
      `/steden/${wpSlug}`,
      `${wpSlug.replace(/-/g, ' ')} ${info.munName}`,
    ]);
  }

  for (const v of venues) {
    const place = v.woonplaats_name ?? formatSlugDisplayName(v.municipality_slug);
    const detail = v.street_address ?? (v.venue_type === 'OPEN_WATER_NATURAL' ? 'Natuurwater' : 'Zwembad');
    const pcCompact = v.postcode_pc6 ? v.postcode_pc6.replace(/\s+/g, '') : '';
    const meta = [
      v.municipality_slug.replace(/-/g, ' '),
      v.woonplaats_slug ? v.woonplaats_slug.replace(/-/g, ' ') : '',
      v.neighborhood_name ?? '',
      v.postcode_pc4 ?? '',
      v.postcode_pc6 ?? '',
      pcCompact,
      v.operator_name ?? '',
      v.official_website_url ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    tuples.push([
      'v',
      v.name,
      `${place} • ${detail}`,
      `/zwembad/${v.municipality_slug}/${v.slug}`,
      meta,
    ]);
  }

  return prepareSearchIndex(tuples);
}

function scoreEntry(
  entry: PreparedSearchEntry,
  fullQuery: string,
  tokens: string[]
): number {
  let score = 0;

  if (entry.normalizedLabel === fullQuery) {
    score += 120;
  } else if (entry.normalizedLabel.startsWith(fullQuery)) {
    score += 75;
  } else if (entry.normalizedLabel.startsWith(tokens[0])) {
    score += 55;
  } else if (tokens.every((token) => entry.normalizedLabel.includes(token))) {
    score += 40;
  }

  if (
    entry.normalizedLabel.includes(` ${tokens[0]}`) ||
    entry.normalizedLabel.includes(`-${tokens[0]}`)
  ) {
    score += 20;
  }

  if (entry.kind === 'm') score += 12;
  else if (entry.kind === 'w') score += 6;
  else score += 2;

  return score;
}

/**
 * Returns ranked, category-balanced search suggestions matching all meaningful query tokens.
 */
export function getSearchSuggestions(
  index: PreparedSearchEntry[],
  rawQuery: string,
  limit = 8
): SearchSuggestion[] {
  const { fullQuery, tokens } = tokenizeSuggestionQuery(rawQuery);
  if (tokens.length === 0 || limit <= 0) return [];

  const placeMatches: Array<{ entry: SearchSuggestion; score: number }> = [];
  const venueMatches: Array<{ entry: SearchSuggestion; score: number }> = [];

  for (let i = 0; i < index.length; i++) {
    const item = index[i];
    let matchesAll = true;
    for (let t = 0; t < tokens.length; t++) {
      if (!item.haystack.includes(tokens[t])) {
        matchesAll = false;
        break;
      }
    }
    if (!matchesAll) continue;

    const score = scoreEntry(item, fullQuery, tokens);
    const suggestion: SearchSuggestion = {
      kind: item.kind,
      label: item.label,
      sublabel: item.sublabel,
      url: item.url,
    };
    if (item.kind === 'v') {
      venueMatches.push({ entry: suggestion, score });
    } else {
      placeMatches.push({ entry: suggestion, score });
    }
  }

  const byScoreDesc = (
    a: { entry: SearchSuggestion; score: number },
    b: { entry: SearchSuggestion; score: number }
  ) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.label.localeCompare(b.entry.label, 'nl');
  };

  placeMatches.sort(byScoreDesc);
  venueMatches.sort(byScoreDesc);

  const selected: SearchSuggestion[] = [];
  const seenUrls = new Set<string>();

  function pushUnique(item: SearchSuggestion) {
    if (selected.length >= limit || seenUrls.has(item.url)) return;
    seenUrls.add(item.url);
    selected.push(item);
  }

  const maxInitialPlaces = venueMatches.length > 0 ? Math.min(3, limit) : limit;
  for (let i = 0; i < placeMatches.length && i < maxInitialPlaces; i++) {
    pushUnique(placeMatches[i].entry);
  }

  for (let i = 0; i < venueMatches.length && selected.length < limit; i++) {
    pushUnique(venueMatches[i].entry);
  }

  for (let i = maxInitialPlaces; i < placeMatches.length && selected.length < limit; i++) {
    pushUnique(placeMatches[i].entry);
  }

  return selected;
}

/**
 * Splits display text into matched / unmatched segments while preserving original casing and accents.
 */
export function splitHighlightSegments(text: string, rawQuery: string): HighlightSegment[] {
  const { tokens } = tokenizeSuggestionQuery(rawQuery);
  if (tokens.length === 0 || text.length === 0) {
    return [{ text, match: false }];
  }

  let normalized = '';
  const charStartOffsets: number[] = [];
  const charEndOffsets: number[] = [];

  for (let i = 0; i < text.length; ) {
    const codePoint = text.codePointAt(i)!;
    const rawChar = String.fromCodePoint(codePoint);
    const nextIdx = i + rawChar.length;
    const stripped = rawChar.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (let k = 0; k < stripped.length; k++) {
      normalized += stripped[k];
      charStartOffsets.push(i);
      charEndOffsets.push(nextIdx);
    }
    i = nextIdx;
  }

  const intervals: Array<[number, number]> = [];
  for (const token of tokens) {
    if (!token) continue;
    let searchFrom = 0;
    while (searchFrom < normalized.length) {
      const idx = normalized.indexOf(token, searchFrom);
      if (idx === -1) break;
      const origStart = charStartOffsets[idx];
      const origEnd = charEndOffsets[idx + token.length - 1];
      if (origStart !== undefined && origEnd !== undefined) {
        intervals.push([origStart, origEnd]);
      }
      searchFrom = idx + token.length;
    }
  }

  if (intervals.length === 0) {
    return [{ text, match: false }];
  }

  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of intervals) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), match: false });
    }
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }

  return segments;
}

/**
 * Groups flat ranked suggestions into Steden & Plaatsen and Zwembaden & Zwemwater sections
 * with stable flat indices for keyboard ArrowUp/ArrowDown navigation.
 */
export function groupSuggestionsForDisplay(
  suggestions: SearchSuggestion[]
): SearchSuggestionGroup[] {
  const groups: SearchSuggestionGroup[] = [];
  const places: GroupedSuggestionItem[] = [];
  const venues: GroupedSuggestionItem[] = [];
  let flatIdx = 0;

  for (const s of suggestions) {
    if (s.kind !== 'v') {
      places.push({ index: flatIdx++, suggestion: s });
    }
  }
  for (const s of suggestions) {
    if (s.kind === 'v') {
      venues.push({ index: flatIdx++, suggestion: s });
    }
  }

  if (places.length > 0) {
    groups.push({ title: 'Steden & Plaatsen', items: places });
  }
  if (venues.length > 0) {
    groups.push({ title: 'Zwembaden & Zwemwater', items: venues });
  }
  return groups;
}

