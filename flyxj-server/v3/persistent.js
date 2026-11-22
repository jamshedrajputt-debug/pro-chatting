'use strict';
const fs=require('node:fs');
const path=require('node:path');
const ENDPOINT=process.env.FLYXJ_STORAGE_BRIDGE_URL||'';
const SECRET=process.env.FLYXJ_STORAGE_TOKEN||'';
const ENABLED=!!ENDPOINT&&!!SECRET;
const headers=()=>({Authorization:'Bearer '+SECRET,'content-type':'application/json'});
const versions=new Map();
const queue=new Map();
function assertConfig(){
 if(!!ENDPOINT!==!!SECRET)throw Error('Incomplete FlyXJ Supabase configuration');
 if(ENABLED){
  const u=new URL(ENDPOINT);
  if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/functions/v1/flyxj-storage-bridge')throw Error('Invalid FlyXJ storage bridge URL');
 }
}
assertConfig();
async function call(route,method='GET',payload){
 if(!ENABLED)throw Error('Supabase storage not enabled');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),50000);
 try{
  const response=await fetch(ENDPOINT+route,{method,headers:headers(),...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:controller.signal});
  const parsed=await response.json().catch(()=>({}));
  if(!response.ok){const e=Error('Persistent storage request failed: '+(parsed.error||response.status));e.status=response.status;throw e}
  return parsed;
 }finally{clearTimeout(timer)}
}
async function health(){
 return ENABLED?call('/health'):({ok:false,disabled:true});
}
async function load(namespace){
 if(!ENABLED)return null;
 try{const r=await call('/state/'+namespace);versions.set(namespace,r.revision);return r.payload}
 catch(e){if(e.status===404){versions.set(namespace,0);return null}throw e}
}
async function save(namespace,list){
 if(!ENABLED)return;
 if(!Array.isArray(list))throw Error('Invalid persistent state type');
 const snapshot=JSON.parse(JSON.stringify(list));
 const previous=queue.get(namespace)||Promise.resolve();
 const pending=previous.catch(()=>{}).then(async()=>{
  let revision=versions.get(namespace);
  if(revision===undefined)throw Error('State must be loaded before saving');
  const result=await call('/state/'+namespace,'PUT',{revision,payload:snapshot});
  versions.set(namespace,result.revision);
  return result.revision;
 });
 queue.set(namespace,pending);
 return pending;
}
function pathFor(dir,name){
 if(!/^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/.test(name))throw Error('Invalid attachment name');
 const folder={'photos':'photos','pdfs':'pdfs','chat-images':'chat-images'}[dir];
 if(!folder)throw Error('Invalid attachment directory');
 return folder+'/'+name;
}
async function upload(dir,name,bytes){
 if(!ENABLED)return;
 const object=pathFor(dir,name),kind=name.slice(name.lastIndexOf('.')+1);
 if(!Buffer.isBuffer(bytes))throw Error('Upload must be binary');
 const {signedUrl}=await call('/sign-upload','POST',{path:object});
 if(!signedUrl)throw Error('Missing signed upload URL');
 const url=new URL(signedUrl,ENDPOINT);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co'))throw Error('Unexpected signed storage URL');
 const mime=kind==='pdf'?'application/pdf':'image/'+(kind==='jpg'?'jpeg':kind);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{
  const response=await fetch(url,{method:'PUT',headers:{'content-type':mime},body:bytes,signal:controller.signal});
  if(!response.ok)throw Error('Attachment upload failed ('+response.status+'): '+(await response.text()).slice(0,140));
 }finally{clearTimeout(timer)}
}
async function download(dir,name){
 if(!ENABLED)return null;
 const object=pathFor(dir,name);
 const {signedUrl}=await call('/sign-download','POST',{path:object});
 if(!signedUrl)return null;
 const url=new URL(signedUrl,ENDPOINT);
 if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co'))throw Error('Unexpected signed download URL');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{
  const res=await fetch(url,{signal:controller.signal});
  if(!res.ok)throw Error('Private attachment unavailable ('+res.status+')');
  const data=await res.arrayBuffer();
  if(data.byteLength>31*1024*1024)throw Error('Remote file larger than allowed');
  return Buffer.from(data);
 }finally{clearTimeout(timer)}
}
async function uploadLocalFile(folder,filename,dir){
 if(!ENABLED)return;
 const file=path.join(folder,filename);
 if(!fs.existsSync(file))throw Error('Expected attachment missing from filesystem');
 return upload(dir,filename,fs.readFileSync(file));
}
async function retrieveOrLocal(folder,name,dir){
 const local=path.join(folder,name);
 if(fs.existsSync(local))return fs.readFileSync(local);
 return download(dir,name);
}
module.exports={enabled:ENABLED,load,save,health,upload,download,uploadLocalFile,retrieveOrLocal,pathFor};
