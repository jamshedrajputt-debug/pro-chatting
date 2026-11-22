'use strict';
// WhatsApp Business API (Meta Cloud or official 360dialog channel).
// All attachments use private media IDs, never public PDF/photo URLs.
// Business-initiated media use pre-approved document/image media templates.
const RECIPIENT='971567527192';
const compose=require('./maker-compose.js');
const safe=v=>String(v??'').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,110);
const templatePattern=/^[a-z][a-z0-9_]{1,99}$/;
const VERSION_PATTERN=/^v\d{1,2}\.\d{1,2}$/;
function config(){
 // 360dialog's phone-specific D360 API key cannot be used as a Meta Graph
 // Bearer token; select separate official provider endpoints.
 const provider=process.env.WHATSAPP_PROVIDER==='360dialog'||
  (!process.env.WHATSAPP_PROVIDER&&!!process.env.D360_API_KEY)?'360dialog':'meta';
 const sender=process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID||'';
 const token=(provider==='360dialog'?process.env.D360_API_KEY:process.env.WHATSAPP_CLOUD_ACCESS_TOKEN)||'';
 const imageTemplate=process.env.WHATSAPP_MEDIA_IMAGE_TEMPLATE||'';
 const documentTemplate=process.env.WHATSAPP_MEDIA_DOCUMENT_TEMPLATE||'';
 const version=process.env.WHATSAPP_GRAPH_VERSION||'v23.0';
 const language=process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en';
 const authenticated=provider==='360dialog'?
    token.length>=16:
    /^\d{5,28}$/.test(sender)&&token.length>=25&&VERSION_PATTERN.test(version);
 const ready=authenticated&&templatePattern.test(imageTemplate)&&
    templatePattern.test(documentTemplate)&&/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language);
 return {ready,provider,sender,token,imageTemplate,documentTemplate,version,language};
}
const whatsappConfigured=()=>config().ready;
function apiConnection(c){
 if(c.provider==='360dialog')return {
  base:'https://waba-v2.360dialog.io',
  headers:{'D360-API-KEY':c.token}
 };
 return {
  base:'https://graph.facebook.com/'+c.version+'/'+c.sender,
  headers:{Authorization:'Bearer '+c.token}
 };
}
function templateBody(order){
 return [
  safe(order.reference||'FXJ-'+order.id),
  safe(order.title),
  safe(order.size),
  safe(order.colour)
 ];
}
function mediaTemplateMessage(order,kind,mediaId,filename,c=config()){
 if(kind!=='image'&&kind!=='document')throw Error('Only image/document media may be forwarded');
 if(!/^\d{5,35}$/.test(mediaId))throw Error('WhatsApp media upload returned invalid ID');
 const params=templateBody(order).map(value=>({type:'text',text:value||'Not provided'}));
 const attachment={id:mediaId};
 if(kind==='document')attachment.filename=filename;
 return {
  messaging_product:'whatsapp',to:RECIPIENT,type:'template',
  template:{
   name:kind==='document'?c.documentTemplate:c.imageTemplate,
   language:{code:c.language},
   components:[
    {type:'header',parameters:[{type:kind,[kind]:attachment}]},
    {type:'body',parameters:params}
   ]
  }
 };
}
async function metaCall(fetcher,url,options,endpoint){
 const resp=await fetcher(url,{...options,signal:AbortSignal.timeout(22000)});
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok){
  const code=typeof data.error?.code==='number'?data.error.code:resp.status;
  // Never include access tokens or customer data in logs.
  const error=new Error('WhatsApp '+endpoint+' failed (code '+code+')');
  error.code=code;throw error;
 }
 return data;
}
async function uploadMedia(bytes,filename,mime,{fetcher=global.fetch,c=config()}={}){
 if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>32*1024*1024)throw Error('Invalid WhatsApp attachment size');
 if(!['image/jpeg','application/pdf'].includes(mime))throw Error('Unapproved WhatsApp media format');
 if(mime==='image/jpeg'&&bytes.length>5*1024*1024)throw Error('WhatsApp image exceeds 5 MB');
 const form=new FormData();
 form.append('messaging_product','whatsapp');
 form.append('type',mime);
 form.append('file',new Blob([bytes],{type:mime}),filename);
 const api=apiConnection(c);
 const result=await metaCall(fetcher,api.base+'/media',{
  method:'POST',headers:api.headers,body:form
 },'media upload');
 if(!/^\d{5,35}$/.test(String(result.id||'')))throw Error('Meta did not return a media ID');
 return String(result.id);
}
async function sendMediaTemplate(order,kind,mediaId,filename,{fetcher=global.fetch,c=config()}={}){
 const body=mediaTemplateMessage(order,kind,mediaId,filename,c);
 const api=apiConnection(c);
 const result=await metaCall(fetcher,api.base+'/messages',{
  method:'POST',headers:{...api.headers,'content-type':'application/json'},
  body:JSON.stringify(body)
 },'media template');
 const id=result.messages?.[0]?.id;
 if(typeof id!=='string'||!/^wamid\./.test(id))throw Error('Meta did not confirm message acceptance');
 return id;
}
async function sendOrderFiles(order,loadAttachments,{
 fetcher=global.fetch,onAccepted=async()=>{},sent={},composer=compose
}={}){
 const c=config();
 if(!c.ready)return {status:'not_connected',accepted:0,total:0,detail:'Connect official WhatsApp API credentials (360dialog or Meta) and approved image/document templates'};
 if(typeof loadAttachments!=='function')throw Error('Private attachment loader required');
 const attachments=await loadAttachments(order);
 const photoBuffers=attachments?.photos;
 const pdf=attachments?.pdf;
 if(!Buffer.isBuffer(pdf)||pdf.length<20||!pdf.subarray(0,1024).includes(Buffer.from('%PDF-')))
  throw Error('Order PDF missing, cannot send complete WhatsApp media');
 if(!Array.isArray(photoBuffers)||!photoBuffers.length||photoBuffers.length>8||
    photoBuffers.some(x=>!Buffer.isBuffer(x)))throw Error('Order reference pictures missing');
 const firstFour=photoBuffers.slice(0,4);
 const individual=await Promise.all(firstFour.map(p=>composer.normalizePhoto(p)));
 const combined=await composer.makerCollage(firstFour,{size:order.size,colour:order.colour});
 const filename=safe(order.reference||'FXJ-'+order.id).replace(/[^A-Za-z0-9_.-]/g,'_');
 const parts=[
  {key:'pdf',kind:'document',bytes:pdf,mime:'application/pdf',name:filename+'_SPEC.pdf'},
  {key:'collage',kind:'image',bytes:combined,mime:'image/jpeg',name:filename+'_4-PHOTOS_SIZE_COLOR.jpg'},
  ...individual.map((bytes,i)=>({key:'photo_'+(i+1),kind:'image',bytes,mime:'image/jpeg',name:filename+'_PHOTO_'+(i+1)+'.jpg'}))
 ];
 let accepted=0;
 for(const part of parts){
  if(typeof sent?.[part.key]==='string'&&sent[part.key].startsWith('wamid.')){
   accepted++;continue; // Resume safely from previously persisted media receipts.
  }
  const mediaId=await uploadMedia(part.bytes,part.name,part.mime,{fetcher,c});
  const messageId=await sendMediaTemplate(order,part.kind,mediaId,part.name,{fetcher,c});
  await onAccepted(part.key,messageId);
  accepted++;
 }
 return {status:'accepted_by_provider',accepted,total:parts.length,recipient:RECIPIENT,delivery_confirmed:false};
}
module.exports={RECIPIENT,whatsappConfigured,config,templateBody,mediaTemplateMessage,uploadMedia,sendMediaTemplate,sendOrderFiles};
