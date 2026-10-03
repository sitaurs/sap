import {createHash} from 'node:crypto';
import type {Sql} from 'postgres';
import sharp from 'sharp';
import type {AppConfig} from '@sap/config';
import type {ObjectStore} from './object-store.js';
type Event={topic:string;aggregate_id:string;payload_minimal:Record<string,unknown>};
/** Explicit normalized rectangles are masked deterministically, never synthesized. */
export class RenditionProcessor{
 constructor(private readonly sql:Sql,private readonly config:AppConfig,private readonly objects:ObjectStore){}
 async process(event:Event):Promise<void>{
  if(!this.config.SAP_EXTENSION_ENABLED)return;
  const id=event.aggregate_id,[rendition]=await this.sql`SELECT er.*,m.object_key AS source_key,m.state,m.deleted_at FROM evidence_renditions er JOIN media m ON m.id=er.media_id WHERE er.id=${id}`;
  if(!rendition||rendition.status==='ready')return;
  try{
   if(rendition.state!=='stored'||rendition.deleted_at)throw new Error('EVIDENCE_UNAVAILABLE');
   const media=await this.objects.getObject(rendition.source_key),image=sharp(media,{limitInputPixels:25000000}).rotate(),metadata=await image.metadata();
   if(!metadata.width||!metadata.height)throw new Error('IMAGE_INVALID');
   const normalized=await image.flatten({background:'#ffffff'}).toBuffer(),size=await sharp(normalized).metadata(),width=size.width!,height=size.height!;
   const redactions=rendition.redactions as {x:number;y:number;width:number;height:number}[];
   if(!Array.isArray(redactions)||redactions.length>20)throw new Error('REDACTION_INVALID');
   const overlays=redactions.map(r=>{
    if(!Object.values(r).every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1||r.y+r.height>1)throw new Error('REDACTION_INVALID');
    const left=Math.floor(r.x*width),top=Math.floor(r.y*height),w=Math.min(width-left,Math.ceil(r.width*width)),h=Math.min(height-top,Math.ceil(r.height*height));
    return {input:Buffer.from(`<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="#172b22"/></svg>`),left,top};
   });
   const bytes=await sharp(normalized).composite(overlays).jpeg({quality:90,mozjpeg:true}).toBuffer(),objectKey=`renditions/${id}/${rendition.revision}.jpg`,sha256=createHash('sha256').update(bytes).digest('hex');
   // Inventory the immutable key before upload so a crashed upload remains discoverable.
   const [reserved]=await this.sql`UPDATE evidence_renditions er SET object_key=${objectKey},updated_at=now() WHERE er.id=${id} AND er.revision=${rendition.revision} AND er.status<>'ready' AND EXISTS (SELECT 1 FROM media m WHERE m.id=er.media_id AND m.state='stored' AND m.deleted_at IS NULL) RETURNING er.id`;
   if(!reserved)return;
   await this.objects.putObject({key:objectKey,body:bytes,contentType:'image/jpeg',sha256});
   const [stored]=await this.sql`UPDATE evidence_renditions er SET status='ready',object_key=${objectKey},updated_at=now() WHERE er.id=${id} AND er.revision=${rendition.revision} AND er.status<>'ready' AND EXISTS (SELECT 1 FROM media m WHERE m.id=er.media_id AND m.state='stored' AND m.deleted_at IS NULL) RETURNING er.id`;
   if(!stored){const [current]=await this.sql`SELECT er.status,m.state,m.deleted_at FROM evidence_renditions er JOIN media m ON m.id=er.media_id WHERE er.id=${id}`;
    if(current?.status!=='ready'||current.state!=='stored'||current.deleted_at){
     const [cleanup]=await this.sql`INSERT INTO media_cleanup_tasks(object_key,media_id) VALUES(${objectKey},${rendition.media_id}) ON CONFLICT(object_key) DO UPDATE SET status='pending',completed_at=NULL,revision=media_cleanup_tasks.revision+1 RETURNING revision`;
     try{await this.objects.deleteObject(objectKey);if(cleanup)await this.sql`UPDATE media_cleanup_tasks SET status='completed',completed_at=now() WHERE object_key=${objectKey} AND revision=${cleanup.revision}`;}catch{}
    }
   }
  }catch{
   await this.sql`UPDATE evidence_renditions SET status='failed',updated_at=now() WHERE id=${id} AND status<>'ready'`;
  }
 }
 async reconcile():Promise<void>{
  if(!this.config.SAP_EXTENSION_ENABLED)return;
  const rows=await this.sql`SELECT id FROM evidence_renditions WHERE status='queued' ORDER BY created_at LIMIT 20`;
  for(const r of rows)await this.process({topic:'evidence.rendition.requested',aggregate_id:r.id,payload_minimal:{}});
 }
}
