import { describe, it, expect } from 'vitest';
import { computeBoundingBox, haversineDistanceKm } from '@/db/geo';

describe('Geospatial Bounding Box & Haversine Distance', () => {
  it('computes accurate distance in km between De Mirandabad (1079) and Sportfondsenbad Oost (1093)', () => {
    // De Mirandabad: 52.3387, 4.9021 | Sportfondsenbad Oost: 52.3564, 4.9275
    const distKm = haversineDistanceKm(52.3387, 4.9021, 52.3564, 4.9275);
    expect(distKm).toBeGreaterThan(2.4);
    expect(distKm).toBeLessThan(2.8);
  });

  it('computes a bounding box around a coordinate for SQLite index filtering', () => {
    const bbox = computeBoundingBox(52.3387, 4.9021, 10);
    expect(bbox.minLat).toBeLessThan(52.3387);
    expect(bbox.maxLat).toBeGreaterThan(52.3387);
    expect(bbox.minLng).toBeLessThan(4.9021);
    expect(bbox.maxLng).toBeGreaterThan(4.9021);
  });
});
