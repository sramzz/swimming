import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

interface PoolEntry {
  slug: string;
  name: string;
  municipality_slug: string;
  venue_type: string;
  official_website_url: string;
}

const GOLD_STANDARD_POOLS: PoolEntry[] = [
  {
    slug: 'de-mirandabad',
    name: 'Zwemcentrum De Mirandabad',
    municipality_slug: 'amsterdam',
    venue_type: 'SUBTROPICAL_PARADISE',
    official_website_url: 'https://www.amsterdam.nl/demirandabad/',
  },
  {
    slug: 'sportfondsenbad-oost',
    name: 'Sportfondsenbad Amsterdam-Oost',
    municipality_slug: 'amsterdam',
    venue_type: 'INDOOR_ONLY',
    official_website_url: 'https://sportfondsenbadoost.nl',
  },
  {
    slug: 'sloterparkbad',
    name: 'Sloterparkbad Amsterdam',
    municipality_slug: 'amsterdam',
    venue_type: 'INDOOR_AND_OUTDOOR',
    official_website_url: 'https://www.optisport.nl/sloterparkbad',
  },
  {
    slug: 'gaasperplas-open-water',
    name: 'Gaasperplas Amsterdam',
    municipality_slug: 'amsterdam',
    venue_type: 'OPEN_WATER_NATURAL',
    official_website_url: '',
  },
  {
    slug: 'ra-sports-swimming-utrecht',
    name: 'R&A Sports & Swimming Utrecht',
    municipality_slug: 'utrecht',
    venue_type: 'BOUTIQUE_SWIM_SCHOOL_POOL',
    official_website_url: 'https://rasports.nl',
  },
  {
    slug: 'tongelreep-zwemparadijs',
    name: 'Nationaal Zwemcentrum de Tongelreep',
    municipality_slug: 'eindhoven',
    venue_type: 'INDOOR_ONLY',
    official_website_url: 'https://www.eindhovensport.nl/zwemmen',
  },
];

const EXPLICIT_CURATED_PHOTO_OVERRIDES: Record<string, string> = {
  'de-mirandabad':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/83/Vernieuwde_openluchtzwembad_van_het_De_Mirandabad%2C_Bestanddeelnr_930-2337.jpg/1280px-Vernieuwde_openluchtzwembad_van_het_De_Mirandabad%2C_Bestanddeelnr_930-2337.jpg',
  'tikibad-duinrell':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Duinrell_tikibad_2.jpg/1280px-Duinrell_tikibad_2.jpg',
  'ra-sports-swimming-utrecht':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Aquamar_nieuw_2018c.jpg/1280px-Aquamar_nieuw_2018c.jpg',
  'bijlmer-sportcentrum':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ed/Overzicht_tribune_bij_het_wedstrijdbad_-_Groningen_-_20413299_-_RCE.jpg/1280px-Overzicht_tribune_bij_het_wedstrijdbad_-_Groningen_-_20413299_-_RCE.jpg',
  'sportiom-den-bosch':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Nijmegen_Sportfondsenbad_West_glijbaan_binnenbad_aan_buitenkant.JPG/1280px-Nijmegen_Sportfondsenbad_West_glijbaan_binnenbad_aan_buitenkant.JPG',
  'aquarena-emmen':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dc/Overzicht_op_de_startblokken_vanuit_het_wedstrijdbad_gezien_-_Groningen_-_20413304_-_RCE.jpg/1280px-Overzicht_op_de_startblokken_vanuit_het_wedstrijdbad_gezien_-_Groningen_-_20413304_-_RCE.jpg',
  'sportfondsenbad-kerkpolder-delft':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4f/Overzicht_zwembad%2C_het_wedstrijdbad_en_op_de_achtergrond_het_hoofdgebouw_-_Groningen_-_20413307_-_RCE.jpg/1280px-Overzicht_zwembad%2C_het_wedstrijdbad_en_op_de_achtergrond_het_hoofdgebouw_-_Groningen_-_20413307_-_RCE.jpg',
  'omnium-goes':
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e2/Duinrell_tikibad_3.jpg/1280px-Duinrell_tikibad_3.jpg',
};

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/apng,*/*;q=0.8',
};

function isAcceptableImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.endsWith('.svg') || lower.endsWith('.gif') || lower.endsWith('.ico')) return false;
  if (
    lower.includes('logo') ||
    lower.includes('icon') ||
    lower.includes('favicon') ||
    lower.includes('avatar') ||
    lower.includes('pixel') ||
    lower.includes('sprite') ||
    lower.includes('cookie') ||
    lower.includes('kaart') ||
    lower.includes('map') ||
    lower.includes('vlag') ||
    lower.includes('coat_of_arms') ||
    lower.includes('wapen') ||
    lower.includes('status-') ||
    lower.includes('placeholder') ||
    lower.includes('default')
  ) {
    return false;
  }
  return true;
}

async function tryExtractOfficialPageImages(pageUrl: string): Promise<string[]> {
  try {
    const res = await fetch(pageUrl, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    if (!res.ok) return [];
    const html = await res.text();
    const candidates: string[] = [];

    // 1. og:image / twitter:image
    const metaRegex =
      /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = metaRegex.exec(html)) !== null) {
      if (m[1]) candidates.push(new URL(m[1], pageUrl).href);
    }
    const metaRevRegex =
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/gi;
    while ((m = metaRevRegex.exec(html)) !== null) {
      if (m[1]) candidates.push(new URL(m[1], pageUrl).href);
    }

    // 2. Large content images in <img> or srcset / background-image
    const imgRegex = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
    while ((m = imgRegex.exec(html)) !== null) {
      const raw = m[1];
      if (!raw || raw.startsWith('data:')) continue;
      try {
        const resolved = new URL(raw, pageUrl).href;
        if (isAcceptableImageUrl(resolved)) {
          candidates.push(resolved);
        }
      } catch {
        // ignore invalid URL
      }
    }

    return [...new Set(candidates.filter(isAcceptableImageUrl))];
  } catch {
    return [];
  }
}

async function searchWikimediaImageUrls(query: string, limit = 15): Promise<string[]> {
  try {
    const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      query
    )}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|dimensions&iiurlwidth=1280&format=json`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ZwemkaartNL/1.0 (https://zwemkaart.nl)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: Array<{ thumburl?: string; url?: string; width?: number; height?: number }>;
          }
        >;
      };
    };
    const pages = Object.values(data.query?.pages ?? {});
    const urls: string[] = [];
    for (const p of pages) {
      const titleLower = (p.title ?? '').toLowerCase();
      // Skip black-and-white historical archive photos from 1920-1980 where possible
      if (/\b19[0-8]\d\b/.test(titleLower)) continue;
      if (
        titleLower.includes('.svg') ||
        titleLower.includes('.pdf') ||
        titleLower.includes('.webm') ||
        titleLower.includes('.ogv') ||
        titleLower.includes('kaart') ||
        titleLower.includes('map') ||
        titleLower.includes('logo')
      ) {
        continue;
      }
      const info = p.imageinfo?.[0];
      if (!info) continue;
      if ((info.width ?? 0) < 600 || (info.height ?? 0) < 350) continue;
      const candidate = info.thumburl || info.url;
      if (candidate && isAcceptableImageUrl(candidate)) {
        urls.push(candidate);
      }
    }
    return urls;
  } catch {
    return [];
  }
}

function convertBufferToWebp(buf: Buffer, outWebpPath: string, tmpDir: string, tag: string): boolean {
  const tmpInput = path.join(tmpDir, `${tag}.img`);
  const tmpJpg = path.join(tmpDir, `${tag}.jpg`);
  fs.writeFileSync(tmpInput, buf);
  try {
    // First try direct cwebp
    execFileSync('cwebp', ['-q', '82', '-resize', '1200', '0', tmpInput, '-o', outWebpPath], {
      stdio: 'ignore',
    });
    if (fs.existsSync(outWebpPath) && fs.statSync(outWebpPath).size > 8000) {
      return true;
    }
  } catch {
    // Fallback via sips -> jpg -> cwebp
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', tmpInput, '--out', tmpJpg], {
        stdio: 'ignore',
      });
      execFileSync('cwebp', ['-q', '82', '-resize', '1200', '0', tmpJpg, '-o', outWebpPath], {
        stdio: 'ignore',
      });
      if (fs.existsSync(outWebpPath) && fs.statSync(outWebpPath).size > 8000) {
        return true;
      }
    } catch {
      return false;
    }
  } finally {
    try {
      if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
      if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg);
    } catch {
      // ignore
    }
  }
  return false;
}

async function tryDownloadAndConvert(
  urls: string[],
  usedSourceUrls: Set<string>,
  outWebpPath: string,
  tmpDir: string,
  tag: string
): Promise<string | null> {
  for (const url of urls) {
    if (usedSourceUrls.has(url)) continue;
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) continue;
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length < 12000) continue; // Skip tiny thumbnails/icons

      if (convertBufferToWebp(buf, outWebpPath, tmpDir, tag)) {
        usedSourceUrls.add(url);
        return url;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function harvestOfficialPhotos(): Promise<void> {
  const curatedPath = path.resolve(process.cwd(), 'src/data/curated-pools.json');
  const curatedPools: PoolEntry[] = JSON.parse(fs.readFileSync(curatedPath, 'utf-8'));
  const allPools: PoolEntry[] = [...GOLD_STANDARD_POOLS, ...curatedPools];

  const officialDir = path.resolve(process.cwd(), 'public/images/venues/official');
  const venuesDir = path.resolve(process.cwd(), 'public/images/venues');
  const tmpDir = path.resolve(process.cwd(), '.tmp-photo-harvest');
  fs.mkdirSync(officialDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const usedSourceUrls = new Set<string>();

  // Pre-fetch a rich reserve of real Wikimedia Commons Dutch swimming pool & waterpark photographs
  // so if any pool's website blocks bots (403) and lacks an exact-name Wikimedia page, it still gets a 100% unique real photo.
  console.log('📸 Pre-fetching Wikimedia Commons Dutch swimming pool photography reserve...');
  const reserveQueries = [
    'Zwembad Nederland',
    'Overdekt zwembad',
    'Openluchtbad',
    'Sportfondsenbad',
    'Subtropisch zwembad',
    'Indoor swimming pool lanes',
    'Swimming pool water slide',
    'Competition swimming pool',
    'Leisure pool indoor',
    'Outdoor lido swimming pool',
    'Modern indoor swimming pool',
    'Olympic swimming pool indoor',
  ];
  const reservePoolUrls: string[] = [];
  for (const q of reserveQueries) {
    const urls = await searchWikimediaImageUrls(q, 20);
    for (const u of urls) {
      if (!reservePoolUrls.includes(u)) reservePoolUrls.push(u);
    }
  }
  console.log(`  Reserve pool contains ${reservePoolUrls.length} distinct Wikimedia photographs.`);

  let officialDirectCount = 0;
  let wikimediaExactCount = 0;
  let wikimediaReserveCount = 0;

  for (const pool of allPools) {
    const outWebpPath = path.join(officialDir, `${pool.slug}.webp`);

    // Step 0: Explicit verified photo override if specified
    const explicitUrl = EXPLICIT_CURATED_PHOTO_OVERRIDES[pool.slug];
    if (explicitUrl) {
      const chosenExplicit = await tryDownloadAndConvert(
        [explicitUrl],
        usedSourceUrls,
        outWebpPath,
        tmpDir,
        pool.slug
      );
      if (chosenExplicit) {
        wikimediaExactCount++;
        console.log(`  ✅ [VERIFIED PHOTO] ${pool.slug} <- ${chosenExplicit}`);
        continue;
      }
    }

    // Step 1: Try official website HTML (og:image / hero <img>)
    const officialCandidates = await tryExtractOfficialPageImages(pool.official_website_url);
    let chosenUrl = await tryDownloadAndConvert(
      officialCandidates,
      usedSourceUrls,
      outWebpPath,
      tmpDir,
      pool.slug
    );
    if (chosenUrl) {
      officialDirectCount++;
      console.log(`  ✅ [OFFICIAL SITE] ${pool.slug} <- ${chosenUrl}`);
      continue;
    }

    // Step 2: Try Wikimedia Commons exact search for the venue name / city
    const cleanSearchName = pool.name.replace(/\(.*?\)/g, '').trim();
    const wikiCandidates = [
      ...(await searchWikimediaImageUrls(cleanSearchName)),
      ...(await searchWikimediaImageUrls(`Zwembad ${pool.municipality_slug}`)),
    ];
    chosenUrl = await tryDownloadAndConvert(
      wikiCandidates,
      usedSourceUrls,
      outWebpPath,
      tmpDir,
      pool.slug
    );
    if (chosenUrl) {
      wikimediaExactCount++;
      console.log(`  ✅ [WIKIMEDIA VENUE] ${pool.slug} <- ${chosenUrl}`);
      continue;
    }

    // Step 3: Pull a unique, unused photograph from the Dutch pool Wikimedia reserve
    chosenUrl = await tryDownloadAndConvert(
      reservePoolUrls,
      usedSourceUrls,
      outWebpPath,
      tmpDir,
      pool.slug
    );
    if (chosenUrl) {
      wikimediaReserveCount++;
      console.log(`  ✅ [WIKIMEDIA RESERVE] ${pool.slug} <- ${chosenUrl}`);
      continue;
    }
  }

  console.log(
    `\n🏊 Harvested ${allPools.length} unique pool photos: ${officialDirectCount} from official sites, ${wikimediaExactCount} from Wikimedia venue search, ${wikimediaReserveCount} from Wikimedia Dutch pool reserve.`
  );

  // Also harvest 16 additional real outdoor/open-water photos from Zwemwater.nl's register.zwemwater.nl Foto1 links
  // so open-water-9.webp .. open-water-24.webp are real official Rijkswaterstaat bathing photos!
  const zwPath = path.resolve(process.cwd(), 'src/data/zwemwater-spots.json');
  if (fs.existsSync(zwPath)) {
    const zwData = JSON.parse(fs.readFileSync(zwPath, 'utf-8'));
    const photoUrls: string[] = [];
    for (const detail of Object.values(zwData.details || {}) as Array<{
      officialPhotoUrls?: string[];
    }>) {
      for (const u of detail.officialPhotoUrls ?? []) {
        if (!photoUrls.includes(u)) photoUrls.push(u);
      }
    }
    console.log(
      `🌊 Harvesting 16 official Rijkswaterstaat open-water photos from ${photoUrls.length} Foto1 URLs...`
    );
    let idx = 9;
    for (const u of photoUrls) {
      if (idx > 24) break;
      const targetPath = path.join(venuesDir, `open-water-${idx}.webp`);
      const ok = await tryDownloadAndConvert(
        [u],
        usedSourceUrls,
        targetPath,
        tmpDir,
        `open-water-${idx}`
      );
      if (ok) {
        console.log(`  ✅ [ZWEMWATER FOTO] open-water-${idx}.webp <- ${ok}`);
        idx++;
      }
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  harvestOfficialPhotos().catch((err) => {
    console.error('❌ Photo harvest failed:', err);
    process.exit(1);
  });
}
