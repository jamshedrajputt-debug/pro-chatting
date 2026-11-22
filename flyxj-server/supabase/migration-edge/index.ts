import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket='flyxj-private',enc=new TextEncoder();
const validFile=/^(photos|pdfs|chat-images)\/[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/;
const json=(obj:unknown,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const fail=(detail:string,status=400)=>json({error:detail},status);
function constantEq(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
async function digest(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function gate(req:Request){
 const code=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[A-Za-z0-9_-]{32,90}$/.test(code))return null;
 const {data,error}=await client.from('flyxj_migration_gate').select('token_hash,expires_at,completed_at').eq('id',1).single();
 if(error||!data||Date.parse(data.expires_at)<Date.now())return null;
 return constantEq(await digest(code),data.token_hash)?data:null;
}
async function storedFiles(){
 const names=new Set<string>();
 for(const dir of ['photos','pdfs','chat-images']){
  for(let offset=0;offset<12000;offset+=1000){
   const {data,error}=await client.storage.from(bucket).list(dir,{limit:1000,offset});
   if(error)throw Error('Could not inspect private '+dir);
   for(const item of data||[])if(item.name)names.add(dir+'/'+item.name);
   if((data||[]).length<1000)break;
  }
 }
 return names;
}
function limitName(names:unknown){
 if(!Array.isArray(names)||names.length>12000||!names.every(name=>typeof name==='string'&&validFile.test(name)))return null;
 return new Set(names as string[]);
}
function requiredReferences(orders:any[],chats:any[]){
 const out=new Set<string>();
 for(const o of orders){
  for(const v of [...(Array.isArray(o.image_files)?o.image_files:[]),...(Array.isArray(o.finished_files)?o.finished_files:[])])
   if(typeof v==='string')out.add('photos/'+v);
  if(typeof o.pdf_file==='string')out.add('pdfs/'+o.pdf_file);
 }
 for(const m of chats)if(typeof m.photo_file==='string')out.add('chat-images/'+m.photo_file);
 return out;
}
async function getData(req:Request,max=12000000){
 const raw=await req.text();
 if(raw.length>max)throw Error('Request exceeds migration size limit');
 return JSON.parse(raw);
}
Deno.serve(async(req)=>{
 try{
  const pathname=new URL(req.url).pathname;
  const op=pathname.split('/').filter(Boolean).at(-1);
  if(req.method==='GET'&&(op==='flyxj-backup-import'||op==='page')){
   const html=await Deno.readTextFile(new URL('./portal.html',import.meta.url));
   return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' https://*.supabase.co; img-src data:; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"}});
  }
  if(req.method!=='POST')return fail('Unsupported request',405);
  const auth=await gate(req);
  if(!auth)return fail('Import code invalid or expired',401);
  if(op==='status'){
   const {data,error}=await client.from('flyxj_state').select('namespace,payload,revision');
   if(error)return fail('Could not inspect storage',503);
   return json({complete:!!auth.completed_at,counts:Object.fromEntries((data||[]).map(v=>[v.namespace,Array.isArray(v.payload)?v.payload.length:0]))});
  }
  if(auth.completed_at)return fail('Backup already imported; records cannot be overwritten',409);
  if(op==='existing'){
   const body=await getData(req,300000);
   const list=limitName(body.paths);
   if(!list)return fail('Invalid file manifest');
   const present=await storedFiles();
   return json({existing:[...list].filter(s=>present.has(s)),total:present.size});
  }
  if(op==='sign'){
   const body=await getData(req,5000);
   if(typeof body.path!=='string'||!validFile.test(body.path))return fail('Invalid private file path');
   const {data,error}=await client.storage.from(bucket).createSignedUploadUrl(body.path);
   if(error||!data?.signedUrl)return fail('Could not sign upload',503);
   return json({signedUrl:data.signedUrl});
  }
  if(op==='commit'){
   const body=await getData(req);
   if(!body||body.format!=='flyxj-backup-v3'||!Array.isArray(body.orders)||!Array.isArray(body.directChat)||!Array.isArray(body.additionalStaff))return fail('Not a valid FlyXJ private backup');
   if(body.orders.length>1500||body.directChat.length>3000||body.additionalStaff.length>15)return fail('Backup record count exceeds safe limits');
   if(body.orders.some((o:any)=>!o||!Number.isSafeInteger(o.id)||o.id<1||typeof o.title!=='string')||body.directChat.some((m:any)=>!m||typeof m.id!=='string'))return fail('Invalid order or chat data');
   const uploaded=limitName(body.uploaded),missing=limitName(body.missing);
   if(!uploaded||!missing)return fail('Invalid file manifest');
   const refs=requiredReferences(body.orders,body.directChat);
   for(const file of refs)if(!uploaded.has(file)&&!missing.has(file))return fail('Referenced backup file missing from manifest: '+file);
   for(const file of uploaded)if(missing.has(file))return fail('Conflicting file manifest');
   if(missing.size&&!body.confirmMissing)return fail('Some original files were missing. Confirm that they cannot be recovered.');
   const actual=await storedFiles();
   for(const file of uploaded)if(!actual.has(file))return fail('File was not uploaded: '+file);
   const {data:prior,error:priorError}=await client.from('flyxj_state').select('namespace').limit(4);
   if(priorError)return fail('Could not inspect database',503);
   if((prior||[]).length)return fail('Database already has FlyXJ records; this importer never overwrites them',409);
   const records=[{namespace:'orders',payload:body.orders,revision:1},{namespace:'direct_chat',payload:body.directChat,revision:1},{namespace:'staff_accounts',payload:body.additionalStaff,revision:1}];
   const {error}=await client.from('flyxj_state').insert(records);
   if(error)return fail('Database import failed: '+error.code,503);
   const {error:markError}=await client.from('flyxj_migration_gate').update({completed_at:new Date().toISOString()}).eq('id',1);
   if(markError)console.warn('Data imported but completed status flag was not updated');
   return json({complete:true,orders:body.orders.length,chat:body.directChat.length,staff:body.additionalStaff.length,files:uploaded.size,missing:missing.size});
  }
  return fail('Unknown action',404);
 }catch(e){
  console.error('FlyXJ import failure',String((e as Error)?.message||e).slice(0,150));
  return fail('Migration failed: '+String((e as Error)?.message||e).slice(0,140),503);
 }
});
