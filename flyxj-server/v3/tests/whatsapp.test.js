'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const wa=require('../whatsapp.js');
test('WhatsApp automatic forwarding is NOT enabled without verified Business API configuration',async()=>{
 const keys=['WHATSAPP_CLOUD_ACCESS_TOKEN','WHATSAPP_CLOUD_PHONE_NUMBER_ID','WHATSAPP_APPROVED_TEMPLATE','WHATSAPP_GRAPH_VERSION'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const key of keys)delete process.env[key];
  assert.equal(wa.whatsappConfigured(),false);
  assert.equal((await wa.notifyViaBusinessApi({id:4})).status,'not_connected');
 }finally{for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}
});
test('When Meta credentials and approved template are configured, order submission can automatically notify staff number',async()=>{
 const names=['WHATSAPP_CLOUD_ACCESS_TOKEN','WHATSAPP_CLOUD_PHONE_NUMBER_ID','WHATSAPP_APPROVED_TEMPLATE','WHATSAPP_GRAPH_VERSION'];
 const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 process.env.WHATSAPP_CLOUD_ACCESS_TOKEN='sample-private-token-only-in-test';
 process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID='123456789001';
 process.env.WHATSAPP_APPROVED_TEMPLATE='flyxj_new_order';
 process.env.WHATSAPP_GRAPH_VERSION='v23.0';
 try{
  assert.equal(wa.whatsappConfigured(),true);
  const example={id:42,reference:'FXJ-2026-000042',title:'Black leather suit',size:'L',colour:'Black',quantity:2,image_files:['photo.jpg'],pdf_file:'document.pdf'};
  let calls=0;
  const result=await wa.notifyViaBusinessApi(example,async(url,opts)=>{
   calls++;
   assert.match(url,/graph\.facebook\.com\/v23\.0\/123456789001\/messages$/);
   assert.equal(opts.headers.authorization,'Bearer sample-private-token-only-in-test');
   const body=JSON.parse(opts.body);
   assert.equal(body.to,'971567527192','only the requested staff mobile receives messages');
   assert.equal(body.type,'template');
   assert.equal(body.template.name,'flyxj_new_order');
   assert.equal(body.template.components[0].parameters[0].text,'FXJ-2026-000042');
   assert.match(body.template.components[0].parameters[4].text,/\/order\/42/);
   return {ok:true,json:async()=>({messages:[{id:'wamid.template-success-test'}]})};
  });
  assert.equal(calls,1);
  assert.equal(result.status,'accepted_by_provider');
 }finally{for(const key of names)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}
});
