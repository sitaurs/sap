import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { cellToLatLng, latLngToCell } from 'h3-js';
import { PosterRenderer, assertPosterFonts } from '../src/poster/poster-renderer.js';
import { MapSnapshotService } from '../src/poster/map-snapshot.js';
import type { MapData } from '../src/poster/map-snapshot.js';

const cellId = latLngToCell(-7.98, 112.63, 9);
const [lat, lon] = cellToLatLng(cellId);

const mapData: MapData = {
  elements: [
    { type: 'area', id: 1, tags: { boundary: 'administrative', admin_level: '5', name: 'Kota Malang' } },
    { type: 'area', id: 5, tags: { boundary: 'administrative', admin_level: '6', name: 'Kecamatan Klojen' } },
    { type: 'area', id: 2, tags: { boundary: 'administrative', admin_level: '7', name: 'Kauman' } },
    { type: 'way', id: 3, tags: { highway: 'primary' }, geometry: [
      { lat: lat - 0.002, lon: lon - 0.003 }, { lat, lon }, { lat: lat + 0.002, lon: lon + 0.003 },
    ] },
    { type: 'way', id: 4, tags: { waterway: 'stream' }, geometry: [
      { lat: lat - 0.003, lon: lon + 0.002 }, { lat, lon: lon + 0.001 }, { lat: lat + 0.003, lon: lon },
    ] },
  ],
  fetchedAt: '2026-10-05T00:00:00.000Z',
  osmTimestamp: '2026-10-04T20:00:00Z',
};

function dependencies() {
  const sql = Object.assign(async (parts: TemplateStringsArray) => {
    const statement = parts.join(' ').replace(/\s+/g, ' ');
    if (statement.includes('FROM publication_map_snapshots')) {
      return [{ data_json: mapData, source_sha256: 'a'.repeat(64) }];
    }
    return [];
  }, {
    json: (value: unknown) => value,
  });
  const config = {
    SAP_INSTAGRAM_RENDER_ENABLED: true,
    POSTER_OVERPASS_URL: 'https://maps.example.invalid/api/interpreter',
    POSTER_MAP_CACHE_HOURS: 24,
    POSTER_MAP_DAILY_LIMIT: 100,
  };
  return {sql:sql as never,config:config as never};
}

test('bundled fonts render distinct Latin glyphs rather than missing-font squares', assertPosterFonts);

test('map preserves OSM geometry, labels roads, and marks the public area without an exact GPS pin', async () => {
  const {sql,config}=dependencies();
  const [latitude,longitude]=cellToLatLng(cellId);
  const road={type:'way',id:6,tags:{highway:'residential',name:'Jalan Uji & Kota'},geometry:[
    {lat:latitude+0.0015,lon:longitude+0.001}, {lat:latitude+0.0015,lon:longitude+0.002},
  ]};
  mapData.elements.push(road);
  try {
    const result=await new MapSnapshotService(sql,config).get(cellId);
    assert.match(result.svg.toString(),/Jalan Uji &amp; Kota/);
    assert.match(result.svg.toString(),/Area kejadian/);
    assert.match(result.svg.toString(),/stroke-dasharray="6 3"/);
    assert.equal(result.metadata.styleVersion,'sap-osm-area-v2');
  } finally {mapData.elements.pop();}
});

test('renders a design-sized sRGB poster and uses local plus city names from OSM admin levels 7 and 5', async () => {
  const photo = await sharp({
    create: { width: 1400, height: 900, channels: 3, background: '#54825e' },
  }).png().toBuffer();
  const {sql,config}=dependencies();
  const rendered = await new PosterRenderer(sql,config).render({
    source: {
      reportId: '11111111-1111-4111-8111-111111111111',
      sourceRevision: 3,
      scanId: null,
      status: 'verified',
      occurredAt: '2026-10-04T02:15:00.000Z',
      area: { cellId, label: `Area ${cellId}` },
      title: 'Laporan uji',
      categoryName: 'Plastik',
      mediaId: '22222222-2222-4222-8222-222222222222',
      publicSummary: 'Fixture render internal.',
    },
    photo,
    outcome: 'initial',
    reportCode: 'SAP-123456',
  });

  const metadata = await sharp(rendered.bytes).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1350);
  assert.equal(metadata.space, 'srgb');
  assert.ok(rendered.bytes.length <= 7 * 1024 * 1024);
  assert.equal(rendered.templateVersion, 'sap-feed-reference-v3');
  assert.equal(rendered.map.areaLabel, 'Kauman, Kota Malang');
  assert.equal(rendered.map.locality, 'Kauman');
  assert.equal(rendered.map.locationMode, 'public_area');
  assert.match(rendered.map.attribution, /OpenStreetMap contributors/);
  assert.equal(rendered.source.area.label, 'Kauman, Kota Malang');
  assert.equal(rendered.source.title, 'Penumpukan sampah di kawasan Kauman');
});
