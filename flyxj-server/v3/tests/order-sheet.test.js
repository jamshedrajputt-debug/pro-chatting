'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {deflateSync}=require('node:zlib');
const directory=path.join(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('Order PDF readable delivery address is extracted, scanned PDF remains unverified',()=>{
 const {extractDeliveryAddress}=require('../pdf-address');
 const plain=Buffer.from('%PDF-1.7\nstream\nBT (Delivery Address:) Tj ET\nBT (Jane Example) Tj ET\nBT (123 Park Street) Tj ET\nBT (London SW1A 1AA) Tj ET\nBT (UK) Tj ET\nBT (Phone: 000000) Tj ET\nendstream\n%%EOF','latin1');
 const found=extractDeliveryAddress(plain);
 assert.match(found.address,/Jane Example/);
 assert.match(found.address,/123 Park Street/);
 assert.match(found.address,/London SW1A 1AA/);
 assert.doesNotMatch(found.address,/Phone/);
 const compressed=deflateSync(Buffer.from('BT (Shipping Address:) Tj ET\nBT (Shop 44 High Street) Tj ET\nBT (Manchester M1 1AA) Tj ET\nBT (UK) Tj ET','latin1'));
 const z=Buffer.concat([Buffer.from('%PDF-1.7\n<< /Filter /FlateDecode >>\nstream\n','latin1'),compressed,Buffer.from('\nendstream\n%%EOF','latin1')]);
 const foundZ=extractDeliveryAddress(z);
 assert.match(foundZ.address,/Manchester/);
 assert.equal(extractDeliveryAddress(Buffer.from('%PDF-1.7\n% scanned image-only PDF\n%%EOF')).address,null);
});

test('Staff one-click order sheet shows four dress pictures, size, colour, PDF, and has in-app photo Back',async()=>{
 const html=fs.readFileSync(path.join(directory,'order-sheet.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://flyxj.test/order/42',runScripts:'outside-only',pretendToBeVisual:true});
 const window=dom.window,document=window.document;
 const urls=Array.from({length:6},(_,i)=>'/api/orders/42/photos/'+i);
 const requestLog=[];
 window.fetch=async (url,options={})=>{
  requestLog.push(String(url));
  if(url==='/api/orders/42')return {ok:true,status:200,json:async()=>({order:{
   id:42,title:'Made-to-order leather jacket',reference:'FXJ-2026-000042',created_at:'2026-11-22T11:00:00Z',
   customer:'usera',size:'M',colour:'Black',quantity:2,priority:'high',expected_date:'2026-12-10',
   status:'confirmed',pdf_url:'/api/orders/42/pdf',photos:urls,comments:'Custom jacket, short sleeves',
   measurements:{bust:'36 in'},shipping:{courier:'',tracking_id:''}
  }})};
  if(url==='/api/orders/42/address')return {ok:true,status:200,json:async()=>({address:'12 King Street\nLondon SW1A 1AA\nUK',source:'searchable_pdf',reliable:false})};
  if(url==='/api/orders/42/mobile-file'){
   const {kind}=JSON.parse(options.body);
   assert.equal(options.method,'POST','Mobile file ticket is authenticated POST');
   assert.equal(options.headers['x-csrf-token'],'test-csrf');
   assert.ok(['maker','pdf'].includes(kind));
   return {ok:true,status:200,json:async()=>({
    url:'/api/mobile-file/'+(kind==='maker'?'1':'2').repeat(64),
    preview_url:kind==='maker'?'/api/mobile-file/'+('1'.repeat(64))+'?preview=1':null,
    filename:'FXJ-2026-000042-'+(kind==='maker'?'MAKER-IMAGE.png':'SPEC.pdf'),kind,expires_in_seconds:600
   })};
  }
  if(url==='/api/me')return {ok:true,status:200,json:async()=>({role:'staff',username:'userb',csrf:'test-csrf'})};
  return {ok:false,status:404,json:async()=>({detail:'Unknown route'})};
 };
 window.FlyxjOrderActions={edit:()=>{},delete:()=>{},share:()=>{}};
 // Android WebView no longer needs the browser Canvas maker library at all.
 window.FlyxjMakerCollage={download:()=>{throw Error('Browser canvas must not be used')}};
 let copied='';
 Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async value=>{copied=value}},configurable:true});
 vm.runInContext(fs.readFileSync(path.join(directory,'assets/order-sheet.js'),'utf8'),dom.getInternalVMContext(),{filename:'order-sheet.js'});
 try{
  await delay(200);
  assert.match(document.getElementById('title').textContent,/leather jacket/);
  assert.match(document.getElementById('chips').textContent,/Black/);
  assert.match(document.getElementById('chips').textContent,/M/);
  assert.equal(document.querySelectorAll('#photoGrid img').length,4,'exactly four images in one screen');
  assert.match(document.getElementById('addressText').textContent,/King Street/);
  assert.match(document.getElementById('pdfLink').getAttribute('href'),/^\/api\/mobile-file\/2{64}$/);
  assert.match(document.getElementById('pdfLink').download,/SPEC\.pdf$/);
  assert.match(document.getElementById('makerDownload').getAttribute('href'),/^\/api\/mobile-file\/1{64}$/);
  assert.match(document.getElementById('makerDownload').download,/MAKER-IMAGE\.png$/);
  assert.equal(document.querySelectorAll('#makerDownload').length,1,'one maker image button');
  assert.match(document.getElementById('makerDownload').textContent,/Download Maker Image/);
  assert.equal(document.getElementById('sheetWhatsApp').classList.contains('hidden'),false,'User B sees WhatsApp forward');
  assert.equal(document.querySelector('#makerRows'),null,'complex PDF table removed');
  assert.equal(document.querySelector('#makerTextDownload'),null,'TXT and CSV links removed');
  assert.equal(document.getElementById('backOrders').getAttribute('href'),'/#orders');
  assert.equal(requestLog.filter(x=>x==='/api/orders/42/mobile-file').length,2,
   'Mobile file links are prepared for both PDF and one combined image');
  assert.match(document.getElementById('makerStatus').textContent,/ready/i);
  assert.equal(document.getElementById('makerBackup').classList.contains('hidden'),false);
  assert.match(document.getElementById('makerPreview').getAttribute('href'),/preview=1/);
  document.getElementById('makerCopy').click();
  await delay(10);
  assert.match(copied,/https:\/\/flyxj\.test\/api\/mobile-file\/1{64}/,'Chrome fallback copies secure URL');
  document.getElementById('pdfCopy').click();
  await delay(10);
  assert.match(copied,/https:\/\/flyxj\.test\/api\/mobile-file\/2{64}/,'PDF fallback copies secure URL');
  const first=document.querySelector('#photoGrid button');
  first.click();
  assert.equal(document.getElementById('viewer').classList.contains('hidden'),false);
  assert.match(document.getElementById('viewerImage').getAttribute('src'),/photos\/0/);
  document.getElementById('viewerNext').click();
  assert.match(document.getElementById('viewerImage').getAttribute('src'),/photos\/1/);
  document.getElementById('viewerClose').click();
  await delay(90);
  assert.equal(document.getElementById('viewer').classList.contains('hidden'),true,'close photo without leaving order sheet');
  document.getElementById('morePhotos').click();
  assert.equal(document.querySelectorAll('#photoGrid img').length,6,'remaining uploaded pictures are accessible');
 }finally{dom.window.close()}
});

test('User A order page never exposes WhatsApp forward button',async()=>{
 const html=fs.readFileSync(path.join(directory,'order-sheet.html'),'utf8');
 const dom=new JSDOM(html,{url:'https://flyxj.test/order/42',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,d=w.document;
 w.FlyxjOrderActions={edit:()=>{},delete:()=>{},share:()=>{throw Error('Customer must not share')}};
 w.FlyxjMakerCollage={download:async()=>{}};
 w.fetch=async url=>{
  if(url==='/api/orders/42')return {ok:true,status:200,json:async()=>({order:{
   id:42,title:'Leather jacket',reference:'FXJ-42',created_at:'2026-11-22T11:00:00Z',
   customer:'usera',size:'M',colour:'Black',quantity:1,photos:[],shipping:{}
  }})};
  if(url==='/api/me')return {ok:true,status:200,json:async()=>({role:'customer',username:'usera',csrf:'test-csrf'})};
  if(url==='/api/orders/42/address')return {ok:true,status:200,json:async()=>({address:null})};
  return {ok:false,status:404,json:async()=>({detail:'Missing route'})};
 };
 vm.runInContext(fs.readFileSync(path.join(directory,'assets/order-sheet.js'),'utf8'),dom.getInternalVMContext(),{filename:'order-sheet.js'});
 try{
  await delay(160);
  const button=d.getElementById('sheetWhatsApp');
  assert.equal(button.classList.contains('hidden'),true,'customer WhatsApp button remains hidden');
  assert.equal(button.onclick,null,'customer WhatsApp click is disabled');
  assert.equal(d.getElementById('sheetEdit').onclick instanceof w.Function,true,'Edit still accessible');
 }finally{w.close()}
});
