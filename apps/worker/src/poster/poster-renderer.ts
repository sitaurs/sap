import { fileURLToPath } from 'node:url';
import type { Sql } from 'postgres';
import sharp from 'sharp';
import type { AppConfig } from '@sap/config';
import { MapSnapshotService, xml, type MapMetadata, type MapData } from './map-snapshot.js';

export type PosterSource = {
  reportId: string; sourceRevision: number; scanId: string|null;
  status: 'verified'|'in_progress'|'resolved'; occurredAt: string;
  area: {cellId:string;label:string}; title:string;categoryName:string;
  mediaId:string;publicSummary:string;
};
export type PosterInput = {source:PosterSource;photo:Buffer;outcome:'initial'|'partial'|'complete';reportCode:string};
export type RenderedPoster = {bytes:Buffer;source:PosterSource;map:MapMetadata;mapData:MapData;templateVersion:'sap-feed-reference-v2'};
const WIDTH=1080, HEIGHT=1350, CREAM='#f8f4e7', GREEN='#115239';
const BLACK_FONT=fileURLToPath(new URL('../../assets/fonts/Roboto-Black.ttf',import.meta.url));
const BODY_FONT=fileURLToPath(new URL('../../assets/fonts/RobotoCondensed-Bold.ttf',import.meta.url));
type Layer={input:Buffer;left:number;top:number};

/** The template uses real approved photo bytes and actual OSM geometry. No illustrative fallback. */
export class PosterRenderer {
  private readonly maps:MapSnapshotService;
  constructor(sql:Sql,private readonly config:AppConfig){this.maps=new MapSnapshotService(sql,config);}
  async render(input:PosterInput):Promise<RenderedPoster> {
    if(!this.config.SAP_INSTAGRAM_RENDER_ENABLED)throw new Error('RENDER_DISABLED');
    const original=input.source;
    if(!['verified','in_progress','resolved'].includes(original.status)||!Number.isFinite(Date.parse(original.occurredAt))||
      !/^SAP-\d{3,15}$/.test(input.reportCode)||!original.publicSummary.trim()||input.photo.length===0)throw new Error('POSTER_SOURCE_INVALID');
    const map=await this.maps.get(original.area.cellId);
    const headline=input.outcome==='initial'?'Penumpukan\nsampah di':input.outcome==='partial'?'Penanganan\nsebagian di':'Perkembangan\npenanganan di';
    const locality=`kawasan ${map.metadata.locality}`;
    const source:PosterSource={...original,area:{...original.area,label:map.metadata.areaLabel},
      title:`${headline.replace(/\n/g,' ')} ${locality}`};
    const date=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(source.occurredAt));
    const time=new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Jakarta'}).format(new Date(source.occurredAt)).replace(':','.');
    const stamp=input.outcome==='partial'?'Hasil sebagian SAP':input.outcome==='complete'?'Hasil ditinjau SAP':'Terverifikasi SAP';
    const layers:Layer[]=[];
    layers.push(await this.text('SAP',114,GREEN,55,30,207,82,true));
    layers.push(await this.text('Sustainable AI Platform',21,GREEN,58,108,312,25,false));
    layers.push(await this.text(headline,108,'#091c15',54,148,976,188,true));
    layers.push(await this.text(locality,101,GREEN,55,343,975,83,true));
    layers.push(await this.text(map.metadata.areaLabel,35,'#102c23',133,437,870,51,false));
    layers.push(await this.text(`${date} • ${time} WIB`,35,'#ffffff',173,910,375,62,false));
    layers.push(await this.text(source.categoryName,35,'#ffffff',169,1000,379,61,false));
    layers.push(await this.text(`Laporan ${input.reportCode}`,35,'#ffffff',169,1082,375,57,false));
    layers.push(await this.text('Pantau perkembangan di SAP',43,'#103c29',231,1222,635,65,true));
    const photo=await sharp(input.photo,{limitInputPixels:25000000,failOn:'warning'}).rotate().resize(WIDTH,490,{fit:'cover',position:'attention'}).flatten({background:CREAM}).jpeg({quality:94}).toBuffer();
    const mapPng=await sharp(map.svg,{limitInputPixels:25000000}).png().toBuffer();
    const flecks=Array.from({length:550},(_,i)=>`<circle cx="${(i*719)%WIDTH}" cy="${(i*487)%HEIGHT}" r="${i%3===0?1.1:.55}" fill="#cabf98" opacity=".12"/>`).join('');
    const base=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}">
      <defs><clipPath id="photo"><path d="M0 550L975 420L1080 486V845L0 906Z"/></clipPath></defs>
      <rect width="1080" height="1350" fill="${CREAM}"/>${flecks}
      <path d="M1040 134L1080 112V440L977 327L1017 233Z" fill="#227a49"/>
      <path d="M0 376L40 423L19 461L58 496L0 536Z" fill="#ffda50"/>
      <g transform="translate(274 36)" fill="${GREEN}"><path d="M2 5H16V1H0V17H4V5M62 5H49V1H66V17H62V5M4 58V46H0V62H16V58H4M62 58H49V62H66V46H62V58"/>
      <path d="M22 46C14 17 34 15 56 10C58 31 50 46 28 49L47 22C36 29 29 37 22 46Z"/></g>
      <g fill="#f9d74d"><path d="M894 228L911 231L900 274L892 274Z"/><path d="M943 211L963 224L920 268L912 261Z"/></g>
      <g transform="translate(94 456)" fill="${GREEN}"><path d="M0 36C-9 23-19 9-19-4A19 19 0 1 1 19-4C19 9 9 23 0 36Z"/><circle cy="-4" r="6" fill="${CREAM}"/></g>
      <image x="0" y="420" width="1080" height="490" xlink:href="data:image/jpeg;base64,${photo.toString('base64')}" clip-path="url(#photo)"/>
      <path d="M0 867L89 850L250 878L558 855L1080 818V1107L539 1137L141 1173L0 1118Z" fill="${GREEN}"/>
      <path d="M68 975H537M68 1062H537" stroke="#d5e5d5" stroke-width="2"/>
      ${this.icons()}
      <g transform="rotate(-7 805 936)"><rect x="570" y="792" width="470" height="288" rx="30" fill="${CREAM}"/>
      <image x="578" y="800" width="454" height="272" xlink:href="data:image/png;base64,${mapPng.toString('base64')}"/></g>
      <g transform="rotate(-9 813 1113)"><rect x="641" y="1064" width="365" height="99" rx="29" fill="${CREAM}" stroke="${GREEN}" stroke-width="5"/>
        <rect x="648" y="1071" width="351" height="85" rx="23" fill="none" stroke="${GREEN}" stroke-width="2" stroke-dasharray="3 4"/>
        <circle cx="689" cy="1112" r="29" fill="${GREEN}"/><path d="M674 1112l10 11 23-27" fill="none" stroke="white" stroke-width="7" stroke-linecap="round"/>
        <text x="730" y="1124" font-family="Roboto Condensed" font-weight="bold" font-size="29" fill="${GREEN}">${xml(stamp)}</text></g>
      <rect x="174" y="1194" width="816" height="103" rx="51" fill="#ffda53"/>
      <path d="M877 1245h46m-20-20 22 20-22 20" fill="none" stroke="${GREEN}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M0 1283C13 1223 31 1195 70 1211C100 1170 122 1184 123 1213C113 1254 86 1270 60 1277L49 1331C70 1289 112 1290 152 1308L207 1350H0Z" fill="#22764b"/>
      <path d="M1060 1140L1080 1148L1032 1203L1019 1197Z" fill="#ffda53"/>
    </svg>`;
    const bytes=await sharp(Buffer.from(base),{limitInputPixels:25000000}).composite(layers).flatten({background:CREAM}).toColourspace('srgb').jpeg({quality:93,mozjpeg:true}).toBuffer();
    if(bytes.length>7*1024*1024)throw new Error('POSTER_SIZE_EXCEEDED');
    return {bytes,source,map:map.metadata,mapData:map.data,templateVersion:'sap-feed-reference-v2'};
  }
  private async text(value:string,size:number,color:string,left:number,top:number,width:number,height:number,black:boolean):Promise<Layer> {
    if([...value].length>250)throw new Error('POSTER_TEXT_INVALID');
    for(let fontSize=size;fontSize>=16;fontSize-=2){
      const image=await sharp({text:{text:`<span foreground="${color}">${xml(value)}</span>`,
        font:`${black?'Roboto Black':'Roboto Condensed Bold'} ${fontSize}`,fontfile:black?BLACK_FONT:BODY_FONT,
        width,wrap:'word-char',dpi:72,rgba:true,spacing:-2}}).png().toBuffer({resolveWithObject:true});
      if(image.info.height<=height&&image.info.width<=width)return {input:image.data,left,top};
    }
    throw new Error('POSTER_TEXT_OVERFLOW');
  }
  private icons():string {
    return `<g stroke="${CREAM}" fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <rect x="73" y="913" width="49" height="45" rx="4"/><path d="M73 928h49m-38-24v17m27-17v17m-26 16h2m12 0h2m11 0h2m-27 11h2m12 0h2"/>
      <path d="M70 1029l24-26h21v21l-26 26Z" fill="${CREAM}"/><circle cx="107" cy="1013" r="4" fill="${GREEN}" stroke="none"/>
      <path d="M83 1086h30l10 10v42H82Zm30 0v12h10m-31 10h20m-20 12h20"/></g>`;
  }
}
