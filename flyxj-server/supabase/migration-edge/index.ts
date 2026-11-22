import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket='flyxj-private',enc=new TextEncoder();
const PORTAL_HTML="<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<meta name=\"theme-color\" content=\"#172a50\"><title>FlyXJ — Private Backup Migration</title>\n<style>\n*{box-sizing:border-box}html{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#f3f6fa;color:#20304c}body{margin:0}header{background:#152849;color:#fff;padding:24px 22px}header div{max-width:810px;margin:auto}header h1{font-size:24px;margin:0 0 6px}header p{margin:0;color:#c1d0e6;font-size:13px}main{max-width:810px;margin:26px auto 60px;padding:0 16px}.card{background:#fff;border:1px solid #e1e8f2;padding:24px;border-radius:15px;box-shadow:0 7px 30px #23365f0d;margin:0 0 16px}.step{font-size:12px;font-weight:800;letter-spacing:.08em;color:#3d61ac;text-transform:uppercase}.card h2{font-size:19px;margin:9px 0}.muted{font-size:13px;line-height:1.7;color:#62718a}.field{margin:18px 0}.field label{display:block;font-weight:700;font-size:13px;margin:0 0 8px}.field input[type=password],.field input[type=file]{display:block;width:100%;border:1px solid #d7e0ed;border-radius:10px;padding:13px;background:#fbfcff;font:inherit;font-size:14px}.field input[type=file]{padding:10px}.row{display:flex;gap:12px;flex-wrap:wrap}.btn{border:none;border-radius:10px;background:#2c53a1;color:#fff;padding:12px 18px;font-weight:700;font-size:14px;min-height:44px;cursor:pointer}.btn:disabled{opacity:.5;cursor:not-allowed}.secondary{background:#e8effe;color:#2f55a1}.summary{background:#f7f9fd;border:1px solid #e7edf6;border-radius:12px;padding:12px 16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.metric{font-size:12px;color:#61708b}.metric b{display:block;font-size:22px;color:#1c355f}.warning{background:#fff7e5;border:1px solid #f4dfab;color:#815d16;padding:13px;border-radius:10px;font-size:12px;line-height:1.7;margin-top:14px}.error{background:#fff0f1;border:1px solid #eec6cd;color:#9a2239;padding:12px;border-radius:10px;font-size:13px;line-height:1.6;margin:10px 0}.success{background:#eaf8f0;border:1px solid #b9e2ca;color:#236546;padding:16px;border-radius:10px;font-size:14px;line-height:1.8}.hidden{display:none!important}.progress{height:11px;border-radius:999px;background:#e4eaf4;overflow:hidden;margin:12px 0 6px}.progress>div{height:100%;background:#31866b;width:0;transition:width .2s}.filename{font-weight:700;word-break:break-word}.safe{color:#46617d;font-size:12px}.checkbox{display:flex;gap:10px;align-items:flex-start;font-size:12px;color:#6b4f20;margin:12px 0}.checkbox input{margin-top:3px}a{color:#315cac}@media(max-width:540px){.card{padding:19px}.summary{grid-template-columns:repeat(2,1fr)}header h1{font-size:21px}}\n</style></head>\n<body><header><div><h1>FLYXJ · Secure Data Migration</h1><p>Move your saved order history, dress photos, PDFs and chat into permanent Supabase storage.</p></div></header>\n<main>\n<section class=\"card\"><div class=\"step\">Step 1 of 3</div><h2>Choose your private backup</h2>\n<p class=\"muted\">Select the <b>FLYXJ-PRIVATE-backup.json</b> file you downloaded from the User B dashboard. This file is handled locally first, then sent only to your Supabase project's private storage.</p>\n<div class=\"field\"><label for=\"backup\">Your private backup JSON</label><input id=\"backup\" type=\"file\" accept=\".json,application/json\"></div>\n<div class=\"hidden\" id=\"fileSummary\"><div class=\"filename\" id=\"filename\"></div><div class=\"summary\" style=\"margin-top:12px\">\n<div class=\"metric\">Orders<b id=\"ordersCount\">0</b></div><div class=\"metric\">Chat messages<b id=\"chatCount\">0</b></div><div class=\"metric\">Attachments<b id=\"filesCount\">0</b></div>\n</div><p id=\"missingNotice\" class=\"muted\"></p></div></section>\n<section class=\"card\"><div class=\"step\">Step 2 of 3</div><h2>Authorize your import</h2>\n<p class=\"muted\">Enter the one-time migration code provided in your ChatGPT conversation. It is not your staff password. The code expires, and after a successful import it cannot be reused.</p>\n<div class=\"field\"><label for=\"secret\">One-time migration code</label><input id=\"secret\" type=\"password\" placeholder=\"Enter migration code\" autocomplete=\"off\"></div>\n<div class=\"row\"><button class=\"btn secondary\" id=\"verify\" type=\"button\">Check destination</button></div><div id=\"destination\" class=\"muted\" style=\"margin-top:12px\"></div>\n<div class=\"warning\">Important: Stop creating or editing orders in the old live app while migrating. Keep your offline backup. The original Render app will not be deleted by this process.</div></section>\n<section class=\"card\"><div class=\"step\">Step 3 of 3</div><h2>Transfer and verify</h2><p class=\"muted\">The importer uploads existing photos/PDFs first, verifies their presence, then writes orders, chat and staff records together. Repeated attempts skip already-uploaded files.</p>\n<label class=\"checkbox hidden\" id=\"missingConsent\"><input type=\"checkbox\" id=\"allowMissing\">My backup already has missing photo/PDF data, and I understand those particular files cannot be restored automatically.</label>\n<div class=\"row\"><button class=\"btn\" id=\"start\" disabled>Import backup securely</button></div>\n<div class=\"progress hidden\" id=\"progress\"><div id=\"bar\"></div></div><p class=\"muted\" id=\"progressText\" role=\"status\"></p><div class=\"hidden\" id=\"finalResult\"></div>\n</section>\n<div id=\"error\" class=\"error hidden\" role=\"alert\"></div>\n<p class=\"safe\">Customer information remains private. This page does not request your User B password. For support, return to the ChatGPT conversation without sharing the backup's contents.</p>\n</main>\n<script>\n(function(){\n'use strict';\nconst el=id=>document.getElementById(id);\nlet backup=null,files=[],missing=[],busy=false;\nconst base=location.pathname.replace(/\\/$/,'');\nconst valid=/^(photos|pdfs|chat-images)\\/[a-f0-9-]{36}\\.(jpg|png|webp|pdf)$/;\nfunction showError(error){el('error').textContent=String(error&&error.message||error);el('error').classList.remove('hidden');el('progressText').textContent='Import stopped. No existing Supabase records were overwritten.'}\nfunction clearError(){el('error').classList.add('hidden');el('error').textContent=''}\nfunction getCode(){const c=el('secret').value.trim();if(c.length<32)throw Error('Enter your one-time migration code.');return c}\nasync function call(route,data){\n const resp=await fetch(base+'/'+route,{method:'POST',headers:{Authorization:'Bearer '+getCode(),'content-type':'application/json'},body:JSON.stringify(data||{})});\n const result=await resp.json().catch(()=>({}));\n if(!resp.ok)throw Error(result.error||'Import service returned '+resp.status);\n return result;\n}\nfunction references(b){\n const needed=new Set();\n for(const o of b.orders){\n  for(const n of [...(o.image_files||[]),...(o.finished_files||[])])if(typeof n==='string')needed.add('photos/'+n);\n  if(typeof o.pdf_file==='string')needed.add('pdfs/'+o.pdf_file);\n }\n for(const msg of b.directChat)if(msg.photo_file)needed.add('chat-images/'+msg.photo_file);\n return needed;\n}\nfunction parseFile(doc){\n if(doc.format!=='flyxj-backup-v3'||!Array.isArray(doc.orders)||!Array.isArray(doc.directChat)||!Array.isArray(doc.additionalStaff))throw Error('This is not a supported FlyXJ private backup file.');\n const all=[];\n for(const [key,prefix] of [['photos','photos'],['pdfs','pdfs'],['chat_photos','chat-images']]){\n  if(!Array.isArray(doc[key]))throw Error('Backup does not contain the '+key+' manifest.');\n  for(const item of doc[key]){\n   const object=prefix+'/'+item.name;\n   if(!valid.test(object))throw Error('Invalid backup attachment filename.');\n   all.push({path:object,data:item.data});\n  }\n }\n const refs=references(doc),given=new Set(all.map(x=>x.path));\n for(const x of refs)if(!given.has(x))all.push({path:x,data:null});\n if(new Set(all.map(x=>x.path)).size!==all.length)throw Error('This backup lists duplicate attachment filenames.');\n files=all.filter(x=>typeof x.data==='string'&&x.data.length>0);\n missing=all.filter(x=>!x.data).map(x=>x.path);\n return doc;\n}\nel('backup').addEventListener('change',async e=>{\n clearError();backup=null;el('fileSummary').classList.add('hidden');el('start').disabled=true;\n const file=e.target.files&&e.target.files[0];if(!file)return;\n try{\n  if(file.size>250*1024*1024)throw Error('Backup exceeds 250 MB; contact support for a staged import.');\n  backup=parseFile(JSON.parse(await file.text()));\n  el('filename').textContent=file.name;\n  el('ordersCount').textContent=backup.orders.length;\n  el('chatCount').textContent=backup.directChat.length;\n  el('filesCount').textContent=files.length;\n  el('missingNotice').textContent=missing.length?'Missing files already in this backup: '+missing.length+'. They cannot be recovered automatically.':'All '+files.length+' backup attachments include file data.';\n  el('missingConsent').classList.toggle('hidden',!missing.length);\n  el('fileSummary').classList.remove('hidden');el('start').disabled=false;\n }catch(err){showError(err)}\n});\nel('verify').addEventListener('click',async()=>{\n clearError();el('destination').textContent='Checking destination...';\n try{\n  const data=await call('status',{});\n  el('destination').textContent=data.complete?'This database was already migrated. Do not re-import.':Object.keys(data.counts||{}).length?'Database already contains records; import will refuse to overwrite them.':'Supabase destination is empty and ready for migration.';\n }catch(err){el('destination').textContent='';showError(err)}\n});\nfunction bytesOf(encoded){\n const raw=atob(encoded),buf=new Uint8Array(raw.length);\n for(let i=0;i<raw.length;i++)buf[i]=raw.charCodeAt(i);\n return buf;\n}\nasync function upload(item){\n const answer=await call('sign',{path:item.path});\n const signed=answer.signedUrl;\n const uri=new URL(signed,location.href);\n if(uri.protocol!=='https:'||!uri.hostname.endsWith('.supabase.co'))throw Error('Unexpected private upload destination');\n const ext=item.path.split('.').pop();\n const mime=ext==='pdf'?'application/pdf':ext==='jpg'?'image/jpeg':'image/'+ext;\n const res=await fetch(uri.toString(),{method:'PUT',headers:{'content-type':mime},body:bytesOf(item.data)});\n if(!res.ok)throw Error('Could not upload '+item.path+': '+res.status+' '+(await res.text()).slice(0,130));\n}\nel('start').addEventListener('click',async()=>{\n if(busy)return;clearError();\n try{\n  getCode();\n  if(!backup)throw Error('Choose your backup JSON file first.');\n  if(missing.length&&!el('allowMissing').checked)throw Error('Confirm that the already-missing attachments cannot be recovered.');\n  busy=true;el('start').disabled=true;el('verify').disabled=true;\n  el('progress').classList.remove('hidden');\n  const status=await call('status',{});\n  if(status.complete||Object.keys(status.counts||{}).length)throw Error('Destination contains records; refusing to overwrite them.');\n  const existing=(await call('existing',{paths:files.map(f=>f.path)})).existing;\n  const already=new Set(existing);\n  let done=0;\n  const total=files.filter(f=>!already.has(f.path)).length;\n  for(const item of files){\n   if(!already.has(item.path)){await upload(item);done++}\n   el('bar').style.width=(files.length?Math.round(100*(already.size+done)/files.length):100)+'%';\n   el('progressText').textContent='Private files: '+(already.size+done)+' / '+files.length+' uploaded. '+(total-done)+' remaining.';\n  }\n  const verified=(await call('existing',{paths:files.map(f=>f.path)})).existing;\n  if(verified.length!==files.length)throw Error('Not all attachments verified; please retry.');\n  el('progressText').textContent='All files verified. Committing database records...';\n  const result=await call('commit',{format:backup.format,orders:backup.orders,directChat:backup.directChat,additionalStaff:backup.additionalStaff,uploaded:files.map(f=>f.path),missing:missing,confirmMissing:missing.length===0||el('allowMissing').checked});\n  if(!result.complete)throw Error('Import did not complete.');\n  el('finalResult').className='success';\n  el('finalResult').textContent='Import COMPLETE: '+result.orders+' orders, '+result.chat+' chat messages, '+result.staff+' additional staff accounts and '+result.files+' private files. Keep your offline backup. Return to ChatGPT and say “Import complete” for the final safe live switch.';\n  el('progressText').textContent='Data successfully saved and verified in Supabase.';\n }catch(err){showError(err);el('start').disabled=false}\n finally{busy=false;el('verify').disabled=false}\n});\n})();\n</script></body></html>";
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
async function migrationHandler(req:Request):Promise<Response>{
 try{
  const pathname=new URL(req.url).pathname;
  const op=pathname.split('/').filter(Boolean).at(-1);
  if(req.method==='GET'&&(op==='flyxj-backup-import'||op==='page')){
   const html=PORTAL_HTML;
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
}

// Supabase Edge Functions disallow rendering HTML on the default .supabase.co URL.
// The upload form is served as static HTML on Render; allow that exact origin to call
// this authenticated JSON endpoint and support its browser preflight requests.
const MIGRATION_UI_ORIGIN='https://flyxj-secure-backup-import.onrender.com';
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');
 if(req.method==='OPTIONS'){
  if(origin!==MIGRATION_UI_ORIGIN)return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{
   'Access-Control-Allow-Origin':MIGRATION_UI_ORIGIN,
   'Access-Control-Allow-Methods':'POST, OPTIONS',
   'Access-Control-Allow-Headers':'authorization, content-type',
   'Access-Control-Max-Age':'3600',
   'Vary':'Origin'
  }});
 }
 const result=await migrationHandler(req);
 if(origin===MIGRATION_UI_ORIGIN){
  result.headers.set('Access-Control-Allow-Origin',MIGRATION_UI_ORIGIN);
  result.headers.set('Vary','Origin');
 }
 return result;
});
