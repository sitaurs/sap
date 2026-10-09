import type { Executor } from '../extensions/extension.store.js';

export type Locality = { cellId:string;kelurahan:string;kecamatan:string;city:string;label:string };
export async function localityFor(db:Executor, cellId:string):Promise<Locality> {
 const [row]=await db<{kelurahan:string;kecamatan:string;city:string}[]>`SELECT kelurahan,kecamatan,city FROM area_localities WHERE h3_cell=${cellId}`;
 return {cellId,kelurahan:row?.kelurahan??'',kecamatan:row?.kecamatan??'',city:row?.city??'',label:row?`${row.kelurahan}, ${row.kecamatan}`:'Area laporan'};
}
export async function areaRef(db:Executor,cellId:string):Promise<{cellId:string;label:string}> {
 const {label}=await localityFor(db,cellId);
 return {cellId,label};
}
