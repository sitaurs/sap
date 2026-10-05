import { createHash } from 'node:crypto';
import { cellToBoundary, cellToLatLng, getResolution, isValidCell } from 'h3-js';
import type { Sql } from 'postgres';
import type { AppConfig } from '@sap/config';

type Point = { lat: number; lon: number };
type Element = { type: string; id: number; tags?: Record<string,string>; geometry?: Point[] };
export type MapData = { elements: Element[]; fetchedAt: string; osmTimestamp: string | null };
export type MapMetadata = { provider: 'openstreetmap'; cellId: string; styleVersion: string;
  sourceSha256: string; fetchedAt: string; osmTimestamp: string | null; attribution: string;
  areaLabel: string; locality: string; locationMode: 'public_area'; };
export type MapSnapshot = { svg: Buffer; metadata: MapMetadata; data: MapData };
const STYLE = 'sap-osm-area-v1';
const MAP_WIDTH = 480;
const MAP_HEIGHT = 288;
const MAP_HEADER = 64;
const MAP_VIEW_HEIGHT = MAP_HEIGHT - MAP_HEADER;
export const xml = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));

/** Only the already-public H3 area is sent to the geographic provider, never exact GPS. */
export class MapSnapshotService {
  constructor(private readonly sql: Sql, private readonly config: AppConfig) {}
  async get(cellId: string): Promise<MapSnapshot> {
    if (!isValidCell(cellId) || getResolution(cellId) !== 9) throw new Error('MAP_AREA_INVALID');
    const [lat, lon] = cellToLatLng(cellId);
    if (Math.abs(lat)>80 || Math.abs(lon)>179) throw new Error('MAP_AREA_UNSUPPORTED');
    const [cached] = await this.sql<{data_json:MapData;source_sha256:string}[]>`SELECT data_json,source_sha256
      FROM publication_map_snapshots WHERE cell_id=${cellId} AND style_version=${STYLE} AND expires_at>now()`;
    const data = cached?.data_json ?? await this.fetch(cellId, lat, lon);
    const sourceSha256 = cached?.source_sha256 ?? createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const areas = data.elements.filter(e => e.type==='area' && e.tags?.boundary==='administrative' && e.tags.name)
      .sort((a,b)=>Number(b.tags!.admin_level)-Number(a.tags!.admin_level)||a.id-b.id);
    const city = areas.find(e => e.tags!.admin_level==='5')?.tags?.name
      ?? areas.find(e => e.tags!.admin_level==='6')?.tags?.name;
    const locality = areas.find(e => ['7','8','9','10'].includes(e.tags!.admin_level!))?.tags?.name
      ?? areas.find(e => e.tags!.admin_level==='6')?.tags?.name ?? city;
    if (!locality || !city) throw new Error('MAP_LOCATION_UNAVAILABLE');
    const areaLabel = locality===city ? locality : `${locality}, ${city}`;
    if ([...areaLabel].length>120 || [...locality].length>80) throw new Error('MAP_LOCATION_INVALID');
    const geometry = cellToBoundary(cellId).map(([latitude,longitude])=>({lat:latitude,lon:longitude}));
    const cos = Math.cos(lat*Math.PI/180);
    const spanLon = .010/Math.max(cos,.2), spanLat = .010*MAP_VIEW_HEIGHT/MAP_WIDTH;
    const west=lon-spanLon/2, north=lat+spanLat/2;
    const project = (p:Point): [number,number] => [
      (p.lon-west)/spanLon*MAP_WIDTH,
      MAP_HEADER+(north-p.lat)/spanLat*MAP_VIEW_HEIGHT,
    ];
    const path = (points:Point[]): string => points.map((p,i)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join(' ');
    const roads = data.elements.filter(e => e.type==='way' && e.geometry && e.tags?.highway);
    if (!roads.length) throw new Error('MAP_GEOMETRY_UNAVAILABLE');
    const waters=data.elements.filter(e=>e.type==='way'&&e.geometry&&e.tags?.waterway);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
      <defs><clipPath id="viewport"><rect y="${MAP_HEADER}" width="${MAP_WIDTH}" height="${MAP_VIEW_HEIGHT}" rx="14"/></clipPath></defs>
      <rect width="${MAP_WIDTH}" height="${MAP_HEIGHT}" fill="#f7f3e6"/>
      <text x="10" y="18" font-family="sans-serif" font-size="14" font-weight="700" fill="#153c2c">Area laporan</text>
      <text x="10" y="39" font-family="sans-serif" font-size="13" fill="#153c2c">© OpenStreetMap contributors · ODbL</text>
      <text x="10" y="56" font-family="sans-serif" font-size="12" fill="#153c2c">openstreetmap.org/copyright</text>
      <g clip-path="url(#viewport)"><rect y="${MAP_HEADER}" width="${MAP_WIDTH}" height="${MAP_VIEW_HEIGHT}" fill="#247049"/>
      <path d="${path([...geometry,geometry[0]!])}Z" fill="#ffdb57" fill-opacity=".95" stroke="#fff9dd" stroke-width="3"/>
      ${waters.map(e=>`<path d="${path(e.geometry!)}" fill="none" stroke="#a4ded8" stroke-width="6"/>`).join('')}
      ${roads.map(e=>`<path d="${path(e.geometry!)}" fill="none" stroke="${['primary','secondary','tertiary'].includes(e.tags!.highway!)?'#fff8de':'#dae6d1'}" stroke-width="${['primary','secondary'].includes(e.tags!.highway!)?3.6:1.7}" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      <g transform="translate(240,176)"><path d="M0 49C-9 36-23 18-23 3a23 23 0 1 1 46 0C23 18 9 36 0 49Z" fill="#124f38" stroke="white" stroke-width="4"/><circle cy="3" r="7" fill="white"/></g></g>
      </svg>`;
    return {svg:Buffer.from(svg),data,metadata:{provider:'openstreetmap',cellId,styleVersion:STYLE,sourceSha256,
      fetchedAt:data.fetchedAt,osmTimestamp:data.osmTimestamp,attribution:'© OpenStreetMap contributors · openstreetmap.org/copyright',
      areaLabel,locality,locationMode:'public_area'}};
  }
  private async fetch(cellId:string,lat:number,lon:number): Promise<MapData> {
    const endpoint=this.config.POSTER_OVERPASS_URL;
    if (!endpoint) throw new Error('MAP_PROVIDER_UNCONFIGURED');
    await this.sql.begin(async tx=>{
      const date=await tx<{day:string}[]>`SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date::text AS day`;
      await tx`INSERT INTO publication_map_budgets(budget_date) VALUES(${date[0]!.day}) ON CONFLICT DO NOTHING`;
      const [budget]=await tx<{request_count:number}[]>`SELECT request_count FROM publication_map_budgets WHERE budget_date=${date[0]!.day} FOR UPDATE`;
      if (!budget || budget.request_count>=this.config.POSTER_MAP_DAILY_LIMIT) throw new Error('MAP_DAILY_BUDGET_EXHAUSTED');
      await tx`UPDATE publication_map_budgets SET request_count=request_count+1 WHERE budget_date=${date[0]!.day}`;
    });
    const dy=.018,dx=.023/Math.max(Math.cos(lat*Math.PI/180),.2);
    const bbox=[lat-dy,lon-dx,lat+dy,lon+dx].map(n=>n.toFixed(6)).join(',');
    const query=`[out:json][timeout:25][maxsize:16777216];is_in(${lat.toFixed(6)},${lon.toFixed(6)})->.a;
      area.a[boundary=administrative][admin_level~"^(5|6|7|8|9|10)$"][name];out tags;
      (way[highway](${bbox});way[waterway](${bbox}););out tags geom;`;
    let data: MapData;
    try {
      const response=await fetch(endpoint,{method:'POST',redirect:'error',
        headers:{'content-type':'application/x-www-form-urlencoded','user-agent':'SAP-PosterRenderer/2.0'},
        body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(35000)});
      if (!response.ok || !response.body) throw new Error();
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
      try {while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>8*1024*1024)throw new Error();chunks.push(part.value);}}
      finally{await reader.cancel();}
      const payload=JSON.parse(Buffer.concat(chunks).toString()) as {elements?:unknown;remark?:unknown;osm3s?:{timestamp_osm_base?:unknown}};
      if(payload.remark || !Array.isArray(payload.elements) || payload.elements.length>20000) throw new Error();
      const elements=payload.elements as Element[];
      if(elements.some(e=>!e||!['area','way'].includes(e.type)||!Number.isSafeInteger(e.id)||
        (e.tags!==undefined&&(typeof e.tags!=='object'||Object.values(e.tags).some(v=>typeof v!=='string'||v.length>1000)))||
        (e.geometry!==undefined&&(!Array.isArray(e.geometry)||e.geometry.length>10000||e.geometry.some(p=>!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)))))throw new Error();
      data={elements,fetchedAt:new Date().toISOString(),osmTimestamp:typeof payload.osm3s?.timestamp_osm_base==='string'?payload.osm3s.timestamp_osm_base:null};
    } catch {throw new Error('MAP_PROVIDER_UNAVAILABLE');}
    if(!data.elements.some(e=>e.type==='way'&&e.tags?.highway&&e.geometry?.length))throw new Error('MAP_GEOMETRY_UNAVAILABLE');
    const sha=createHash('sha256').update(JSON.stringify(data)).digest('hex');
    await this.sql`INSERT INTO publication_map_snapshots(cell_id,style_version,source_sha256,data_json,expires_at)
      VALUES(${cellId},${STYLE},${sha},${this.sql.json(data as never)},now()+${this.config.POSTER_MAP_CACHE_HOURS}*interval '1 hour')
      ON CONFLICT(cell_id,style_version) DO UPDATE SET source_sha256=EXCLUDED.source_sha256,data_json=EXCLUDED.data_json,
        generated_at=now(),expires_at=EXCLUDED.expires_at`;
    return data;
  }
}
