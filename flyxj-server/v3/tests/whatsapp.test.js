'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const media=require('../whatsapp.js');
const composer=require('../maker-compose.js');
const ENV=['WHATSAPP_CLOUD_ACCESS_TOKEN','WHATSAPP_CLOUD_PHONE_NUMBER_ID',
 'WHATSAPP_MEDIA_IMAGE_TEMPLATE','WHATSAPP_MEDIA_DOCUMENT_TEMPLATE',
 'WHATSAPP_GRAPH_VERSION','WHATSAPP_TEMPLATE_LANGUAGE'];
function envReady(){
 const saved=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));
 process.env.WHATSAPP_CLOUD_ACCESS_TOKEN='fake-test-meta-token-which-never-leaves-our-test-suite';
 process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID='123456789001';
 process.env.WHATSAPP_MEDIA_IMAGE_TEMPLATE='flyxj_photo_media';
 process.env.WHATSAPP_MEDIA_DOCUMENT_TEMPLATE='flyxj_pdf_document';
 process.env.WHATSAPP_GRAPH_VERSION='v23.0';
 process.env.WHATSAPP_TEMPLATE_LANGUAGE='en';
 return ()=>{for(const key of ENV)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]};
}
async function pictures(){
 const colours=['#ee3344','#38b96b','#3378ee','#e5be46'];
 return Promise.all(colours.map(colour=>sharp({create:{width:240,height:180,channels:3,background:colour}}).png().toBuffer()));
}
test('WhatsApp is disconnected when approved media templates are missing; no link is sent',()=>{
 const saved=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));
 try{
  for(const key of ENV)delete process.env[key];
  assert.equal(media.whatsappConfigured(),false);
  assert.equal(typeof media.waLink,'undefined','old wa.me PDF/photo links have been removed');
  assert.equal(typeof media.orderMessage,'undefined','never render original PDF/photo URLs in WhatsApp');
 }finally{for(const key of ENV)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}
});
test('Four dress photos become one actual JPEG with Size and Color text in the pixels',async()=>{
 const photos=await pictures();
 const image=await composer.makerCollage(photos,{size:'XL',colour:'Dark Brown'});
 const meta=await sharp(image).metadata();
 assert.equal(meta.width,1200);assert.equal(meta.height,1400);assert.equal(meta.format,'jpeg');
 assert.match(composer.svgCaption('XL','Dark Brown').toString(),/SIZE/);
 assert.match(composer.svgCaption('XL','Dark Brown').toString(),/Dark Brown/);
 assert.match(composer.svgCaption('<danger>','Black').toString(),/&lt;danger&gt;/,'XML escapes untrusted sizes');
 const upper=await sharp(image).extract({left:3,top:8,width:200,height:200}).stats();
 const bottom=await sharp(image).extract({left:3,top:1205,width:200,height:100}).stats();
 assert.notDeepEqual(upper.channels.map(x=>Math.round(x.mean)),bottom.channels.map(x=>Math.round(x.mean)),
  'footer visually different from photo grid');
 for(const original of photos){
  const normalized=await composer.normalizePhoto(original);
  assert.equal((await sharp(normalized).metadata()).format,'jpeg');
  assert.ok(normalized.length<5*1024*1024);
 }
});
test('Meta receives 1 real PDF + 1 combined image + 4 individual photo uploads and six template messages; ZERO URL links',async()=>{
 const restore=envReady();
 try{
  const photos=await pictures(),pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const order={id:42,reference:'FXJ-2026-000042',title:'Brown leather dress',colour:'Brown',size:'M',quantity:1};
  const uploads=[],messages=[],receipts={};
  let index=0;
  const fetcher=async(url,opts)=>{
   assert.equal(opts.headers.Authorization||opts.headers.authorization,
    'Bearer fake-test-meta-token-which-never-leaves-our-test-suite');
   if(url.endsWith('/media')){
    assert.equal(opts.method,'POST');
    const kind=opts.body.get('type'),file=opts.body.get('file');
    assert.ok(file instanceof Blob);
    assert.ok(['image/jpeg','application/pdf'].includes(kind));
    assert.equal(file.type,kind);
    uploads.push({kind,name:file.name,size:file.size});
    return {ok:true,json:async()=>({id:String(1000000000000+(++index))})};
   }
   if(url.endsWith('/messages')){
    const body=JSON.parse(opts.body);
    assert.equal(body.to,'971567527192');
    assert.equal(body.type,'template');
    assert.equal(body.messaging_product,'whatsapp');
    const json=JSON.stringify(body);
    assert.doesNotMatch(json,/wa\.me|https?:\/\/|\/api\/orders\/|\/order\//,'no link paths or URLs');
    assert.equal(body.template.components.length,2);
    const header=body.template.components[0].parameters[0];
    if(header.type==='document')assert.equal(body.template.name,'flyxj_pdf_document');
    else{
      assert.equal(header.type,'image');
      assert.equal(body.template.name,'flyxj_photo_media');
    }
    assert.equal(body.template.components[1].parameters[2].text,'M');
    assert.equal(body.template.components[1].parameters[3].text,'Brown');
    messages.push(body);
    return {ok:true,json:async()=>({messages:[{id:'wamid.test-'+messages.length}]})};
   }
   throw Error('Unexpected network call');
  };
  const res=await media.sendOrderFiles(order,async()=>({pdf,photos}),{
   fetcher,onAccepted:async(key,id)=>{receipts[key]=id}
  });
  assert.equal(res.status,'accepted_by_provider');
  assert.equal(res.accepted,6);assert.equal(res.total,6);
  assert.equal(uploads.length,6);assert.equal(messages.length,6);
  assert.equal(uploads.filter(x=>x.kind==='application/pdf').length,1);
  assert.equal(uploads.filter(x=>x.kind==='image/jpeg').length,5);
  assert.ok(uploads.some(x=>x.name.endsWith('_4-PHOTOS_SIZE_COLOR.jpg')));
  assert.deepEqual(Object.keys(receipts),['pdf','collage','photo_1','photo_2','photo_3','photo_4']);
  // Replaying persisted Meta receipts must skip previously accepted messages.
  const repeated=await media.sendOrderFiles(order,async()=>({pdf,photos}),{
   fetcher,sent:receipts,onAccepted:()=>{throw Error('Should not retransmit')}
  });
  assert.equal(repeated.accepted,6);
  assert.equal(uploads.length,6,'no re-upload');
  assert.equal(messages.length,6,'no duplicate messages');
 }finally{restore()}
});
