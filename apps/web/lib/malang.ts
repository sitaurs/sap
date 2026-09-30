/**
 * Canonical default map viewport for SAP: Kota Malang, East Java.
 *
 * SAP is a Kota Malang civic product, so every map that opens without a chosen
 * point must start centered on Malang — not the previous placeholder in
 * Sumatra. Users can still pan and pick anywhere; this only sets the initial
 * view. Coordinates are the Alun-Alun / city-center area of Kota Malang (WGS84).
 */
export const MALANG_CENTER = { latitude: -7.9797, longitude: 112.6304 } as const;

/** Sensible initial zoom to frame Kota Malang's five kecamatan. */
export const MALANG_DEFAULT_ZOOM = 12;
