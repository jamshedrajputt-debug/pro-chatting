'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-durable-'));
process.env.FLYXJ_STORAGE_BRIDGE_URL='https://testing.supabase.co/functions/v1/flyxj-storage-bridge';
process.env.FLYXJ_STORAGE_TOKEN='DurableTestTokenIsLongEnoughAndPrivateForUnitTests';
const token='Bearer '+process.env.FLYXJ_STORAGE_TOKEN;
const states=new Map();
const objects=new Map();
function reply(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})}
global.fetch=async function(url,options={}){
 const u=new URL(String(url));
 assert.equal(u.hostname,'testing.supabase.co');
 if(u.pathname.startsWith('/functions/v1/flyxj-storage-bridge/')){
  assert.equal(options.headers.Authorization,token,'only server-side bridge token used');
  const route=u.pathname.split('/flyxj-storage-bridge/')[1];
  if(route==='health')return reply({ok:true});
  if(route.startsWith('state/')){
   const namespace=route.slice(6),current=states.get(namespace);
   if(options.method==='GET')return current?reply(current):reply({missing:true},404);
   const request=JSON.parse(options.body);
   if(request.revision===0){
    if(current)return reply({error:'State already exists'},409);
    states.set(namespace,{payload:request.payload,revision:1});
    return reply({revision:1});
   }
   if(!current||current.revision!==request.revision)return reply({error:'State changed; reload before saving'},409);
   const revision=current.revision+1;
   states.set(namespace,{payload:request.payload,revision});
   return reply({revision});
  }
  const name=JSON.parse(options.body).path;
  if(route==='sign-upload')return reply({signedUrl:'https://testing.supabase.co/storage/v1/object/upload/sign/flyxj-private/'+name+'?token=one'});
  if(route==='sign-download')return objects.has(name)?reply({signedUrl:'https://testing.supabase.co/storage/v1/object/sign/flyxj-private/'+name+'?token=one'}):reply({error:'File not found'},404);
  return reply({error:'Missing'},404);
 }
 if(u.pathname.includes('/storage/v1/object/upload/sign/')){
  const filename=u.pathname.split('/flyxj-private/')[1];
  objects.set(filename,Buffer.from(options.body));
  return reply({Key:filename});
 }
 if(u.pathname.includes('/storage/v1/object/sign/')){
  const filename=u.pathname.split('/flyxj-private/')[1];
  return objects.has(filename)?new Response(objects.get(filename)):reply({error:'File not found'},404);
 }
 throw Error('Unexpected URL '+u);
};
const persistent=require('../persistent.js');
test('Persistent state: read, create, ordered writes, safe revision conflict',async()=>{
 assert.equal(persistent.enabled,true);
 assert.equal((await persistent.health()).ok,true);
 assert.equal(await persistent.load('orders'),null,'first-time remote missing');
 await persistent.save('orders',[{id:1,title:'Blue dress'}]);
 assert.equal(states.get('orders').revision,1);
 const first=persistent.save('orders',[{id:1,title:'Blue dress'},{id:2,title:'Leather jacket'}]);
 const second=persistent.save('orders',[{id:1,title:'Blue dress'},{id:2,title:'Leather jacket'},{id:3,title:'Red suit'}]);
 await Promise.all([first,second]);
 assert.equal(states.get('orders').revision,3);
 assert.equal(states.get('orders').payload.length,3);
 // Simulate another writer changing state. No silent overwrite.
 states.get('orders').revision=11;
 await assert.rejects(persistent.save('orders',[{id:55}]),/State changed/);
 assert.equal(states.get('orders').payload.length,3);
});
test('Persistent attachments: private signed upload, download, and local backup retrieval',async()=>{
 const id='fe1d7f19-70b1-485d-ac6d-0d0d8e5ae84a';
 const filename=id+'.pdf',bytes=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
 await persistent.upload('pdfs',filename,bytes);
 assert.ok(objects.has('pdfs/'+filename));
 assert.deepEqual(await persistent.download('pdfs',filename),bytes);
 const cached=path.join(tmp,filename);
 assert.deepEqual(await persistent.retrieveOrLocal(tmp,filename,'pdfs'),bytes,'cloud used when local absent');
 fs.writeFileSync(cached,bytes);
 assert.deepEqual(await persistent.retrieveOrLocal(tmp,filename,'pdfs'),bytes,'local copy preferred if available');
 await assert.rejects(persistent.upload('pdfs','../../bad.pdf',bytes),/Invalid attachment name/);
});
process.on('exit',()=>{try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}});
