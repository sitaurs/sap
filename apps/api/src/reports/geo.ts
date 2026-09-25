import { latLngToCell } from 'h3-js';

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
