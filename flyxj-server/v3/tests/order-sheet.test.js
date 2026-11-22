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
 window.fetch=async url=>{
  requestLog.push(String(url));
  if(url==='/api/orders/42')return {ok:true,status:200,json:async()=>({order:{
   id:42,title:'Made-to-order leather jacket',reference:'FXJ-2026-000042',created_at:'2026-11-22T11:00:00Z',
   customer:'usera',size:'M',colour:'Black',quantity:2,priority:'high',expected_date:'2026-12-10',
   status:'confirmed',pdf_url:'/api/orders/42/pdf',photos:urls,comments:'Custom jacket, short sleeves',
   measurements:{bust:'36 in'},shipping:{courier:'',tracking_id:''}
  }})};
  if(url==='/api/orders/42/address')return {ok:true,status:200,json:async()=>({address:'12 King Street\nLondon SW1A 1AA\nUK',source:'searchable_pdf',reliable:false})};
  return {ok:false,status:404,json:async()=>({detail:'Unknown route'})};
 };
 vm.runInContext(fs.readFileSync(path.join(directory,'assets/order-sheet.js'),'utf8'),dom.getInternalVMContext(),{filename:'order-sheet.js'});
 try{
  await delay(130);
  assert.match(document.getElementById('title').textContent,/leather jacket/);
  assert.match(document.getElementById('chips').textContent,/Black/);
  assert.match(document.getElementById('chips').textContent,/M/);
  assert.equal(document.querySelectorAll('#photoGrid img').length,4,'exactly four images in one screen');
  assert.match(document.getElementById('addressText').textContent,/King Street/);
  assert.equal(document.getElementById('pdfLink').getAttribute('href'),'/api/orders/42/pdf');
  assert.equal(document.getElementById('backOrders').getAttribute('href'),'/#orders');
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
