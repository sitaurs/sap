import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import type {AppConfig} from '@sap/config';

export type MetaCredentials={userToken:string;pageToken:string};
export function encryptCredentials(value:MetaCredentials,key:string):string{
 if(!/^[a-f0-9]{64}$/i.test(key))throw new Error('META_CREDENTIAL_KEY_INVALID');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function decryptCredentials(value:string,key:string):MetaCredentials{
 const [iv,tag,body]=value.split('.');if(!iv||!tag||!body||!/^[a-f0-9]{64}$/i.test(key))throw new Error('META_CREDENTIAL_INVALID');
 const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64url'));cipher.setAuthTag(Buffer.from(tag,'base64url'));
 const credentials=JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8')) as MetaCredentials;
 if(!credentials.userToken||!credentials.pageToken)throw new Error('META_CREDENTIAL_INVALID');return credentials;
}
export class MetaApiError extends Error{
 constructor(readonly code:string,readonly uncertain=false){super(code);}
}
/** Provider errors never contain token-bearing URLs, payloads, or raw Meta messages. */
export class MetaClient{
 constructor(private readonly config:AppConfig){}
 async request(path:string,token:string,params:Record<string,string>={},method:'GET'|'POST'|'DELETE'='GET'):Promise<Record<string,any>>{
  if(!this.config.META_GRAPH_VERSION||!/^v\d+\.\d+$/.test(this.config.META_GRAPH_VERSION))throw new MetaApiError('META_VERSION_INVALID');
  if(!/^[a-zA-Z0-9_/-]+$/.test(path))throw new MetaApiError('META_PATH_INVALID');
  const url=new URL(`https://graph.facebook.com/${this.config.META_GRAPH_VERSION}/${path}`);
  const form=new URLSearchParams(params);if(method==='GET')url.search=form.toString();
  try{
   const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,...(method==='GET'?{}:{'Content-Type':'application/x-www-form-urlencoded'})},...(method==='GET'?{}:{body:form.toString()}),signal:AbortSignal.timeout(20000),redirect:'error'});
   const payload=await response.json() as Record<string,any>;
   if(!response.ok||payload.error){const code=Number(payload.error?.code);throw new MetaApiError(code===190?'META_TOKEN_EXPIRED':code===10||code===200?'META_PERMISSION_REQUIRED':response.status===429||code===4||code===32?'META_RATE_LIMITED':'META_REQUEST_FAILED');}
   return payload;
  }catch(error){if(error instanceof MetaApiError)throw error;throw new MetaApiError('META_RESPONSE_UNCERTAIN',method!=='GET');}
 }
 async connect(code:string){
  const {META_APP_ID:appId,META_APP_SECRET:secret,META_REDIRECT_URI:redirect}=this.config;
  if(!appId||!secret||!redirect)throw new MetaApiError('META_CONFIGURATION_REQUIRED');
  const exchange=await this.request('oauth/access_token','',{client_id:appId,client_secret:secret,redirect_uri:redirect,code},'POST');
  if(typeof exchange.access_token!=='string')throw new MetaApiError('META_TOKEN_INVALID');
  const longLived=await this.request('oauth/access_token','',{grant_type:'fb_exchange_token',client_id:appId,client_secret:secret,fb_exchange_token:exchange.access_token},'POST');
  const token=longLived.access_token;if(typeof token!=='string')throw new MetaApiError('META_TOKEN_INVALID');
  const permissions=await this.request('me/permissions',token),scopes=(permissions.data??[]).filter((p:any)=>p.status==='granted').map((p:any)=>String(p.permission));
  const pages=await this.request('me/accounts',token,{fields:'id,access_token,instagram_business_account{id,username}',limit:'100'});
  const choices=(pages.data??[]).filter((p:any)=>p.instagram_business_account?.id&&p.access_token&&(!this.config.META_PAGE_ID||p.id===this.config.META_PAGE_ID));
  if(choices.length!==1)throw new MetaApiError(choices.length?'META_ACCOUNT_AMBIGUOUS':'META_PROFESSIONAL_ACCOUNT_REQUIRED');
  const page=choices[0];return {igUserId:String(page.instagram_business_account.id),pageId:String(page.id),username:String(page.instagram_business_account.username??''),scopes,credentials:{userToken:token,pageToken:String(page.access_token)},expiresAt:typeof longLived.expires_in==='number'?new Date(Date.now()+longLived.expires_in*1000):null};
 }
}
