import { cellToBoundary, getResolution, isValidCell, latLngToCell } from 'h3-js';

/** H3 resolution for hotspot cells (HOTSPOT_RULES / TECH_SPEC: resolution 9). */
export const H3_RESOLUTION = 9;

/**
 * Map a canonical report coordinate to its stable H3 res-9 cell id (15 hex
 * chars). Computed server-side from the canonical latitude/longitude; the
 * frontend only renders the returned GeoJSON.
 */
export function toH3Cell(latitude: number, longitude: number): string {
  return latLngToCell(latitude, longitude, H3_RESOLUTION);
}

/** Whether a string is a valid H3 res-9 cell id (validated with the library, not just a regex). */
export function isReportCell(cellId: string): boolean {
  return isValidCell(cellId) && getResolution(cellId) === H3_RESOLUTION;
}

/**
 * GeoJSON Polygon ring for an H3 cell: `cellToBoundary` returns [lat,lng] pairs,
 * which we flip to [lng,lat] for GeoJSON and close explicitly (first === last).
 */
export function cellToPolygon(cellId: string): { type: 'Polygon'; coordinates: number[][][] } {
  const boundary = cellToBoundary(cellId); // [[lat, lng], ...]
  const ring = boundary.map(([lat, lng]) => [lng, lat] as number[]);
  if (ring.length > 0) ring.push([...ring[0]!]);
  return { type: 'Polygon', coordinates: [ring] };
}
