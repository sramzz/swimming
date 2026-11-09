import fs from 'node:fs';
import path from 'node:path';
import {
  parseZwemwaterSpotDetailHtml,
  type ZwemwaterSpotDetail,
} from '../ingestion/zwemwater-detail-parser';

interface ZwemwaterSpotsFile {
  spots: Array<{
    spotid: string | number;
    locationid: string | number;
    status: string;
    coordinates: [number, number];
    name: string;
  }>;
  addresses: Record<string, string>;
  details?: Record<string, ZwemwaterSpotDetail>;
}

export async function harvestZwemwaterDetails(): Promise<void> {
  const filePath = path.resolve(process.cwd(), 'src/data/zwemwater-spots.json');
  const data: ZwemwaterSpotsFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const details: Record<string, ZwemwaterSpotDetail> = data.details ?? {};

  const spots = data.spots;
  console.log(`🌊 Harvesting per-spot detail HTML from zwemwater.nl for ${spots.length} spots...`);

  const concurrency = 30;
  let completed = 0;
  let withInfoBoard = 0;
  let withPhotos = 0;
  let withPaidAccess = 0;
  let withWarnings = 0;

  for (let i = 0; i < spots.length; i += concurrency) {
    const batch = spots.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (spot) => {
        const spotIdNum = Number(spot.spotid);
        const spotIdKey = String(spot.spotid);
        try {
          const url = `https://www.zwemwater.nl/wp-content/themes/stuurlui/blocks/map/map-content.php?spotid=${spotIdNum}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (!res.ok) return;
          const html = await res.text();
          const parsed = parseZwemwaterSpotDetailHtml(spotIdNum, html);
          details[spotIdKey] = parsed;
          if (parsed.infoBoardUrl) withInfoBoard++;
          if (parsed.officialPhotoUrls.length > 0) withPhotos++;
          if (parsed.isPaidAccess) withPaidAccess++;
          if (parsed.warnings.length > 0) withWarnings++;
        } catch {
          // Keep existing or skip on individual timeout
        } finally {
          completed++;
        }
      })
    );
    if (completed % 150 === 0 || completed === spots.length) {
      console.log(
        `  Progress: ${completed}/${spots.length} (infoBoards: ${withInfoBoard}, photos: ${withPhotos}, paid: ${withPaidAccess}, warnings: ${withWarnings})`
      );
    }
  }

  data.details = details;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ Saved ${Object.keys(details).length} Zwemwater.nl spot details to ${filePath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  harvestZwemwaterDetails().catch((err) => {
    console.error('❌ Harvest failed:', err);
    process.exit(1);
  });
}
