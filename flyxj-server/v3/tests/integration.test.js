'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function randomPort(){
 return new Promise((resolve,reject)=>{
  const s=net.createServer();
  s.on('error',reject);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))});
 });
}
const picture='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlZJ2cAAAAASUVORK5CYII=';
const pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64');
test('FLYXJ V3: authenticated PDF orders, approval, shipment, profit, chat, backups',async()=>{
 const port=await randomPort(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-v3-'));
 const env={...process.env,PORT:String(port),FLYXJ_DATA_DIR:directory,
  FLYXJ_CUSTOMER_USERNAME:'usera',FLYXJ_CUSTOMER_PASSWORD:'TestingCustomerPass!123',
  FLYXJ_STAFF_USERNAME:'userb',FLYXJ_STAFF_PASSWORD:'TestingStaffPass!123'};
 const processServer=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env,stdio:['ignore','pipe','pipe']});
 let logs='';
 processServer.stdout.on('data',b=>logs+=String(b));
 processServer.stderr.on('data',b=>logs+=String(b));
 const base='http://127.0.0.1:'+port;
 async function api(route,session,method='GET',payload=null,extraHeaders={}){
  const headers={...extraHeaders};
  if(session){headers.cookie=session.cookie;if(!Object.prototype.hasOwnProperty.call(headers,'x-csrf-token'))headers['x-csrf-token']=session.csrf}
  if(payload!==null)headers['Content-Type']='application/json';
  return fetch(base+route,{method,headers,...(payload!==null?{body:JSON.stringify(payload)}:{})});
 }
 async function login(name,password){
  const response=await api('/api/login',null,'POST',{username:name,password});
  assert.equal(response.status,200,'login '+name+': '+await response.clone().text());
  const body=await response.json();
  return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:body.csrf};
 }
 try{
  let ready=false;
  for(let i=0;i<120;i++){
   if(processServer.exitCode!==null)throw Error('Server crash: '+logs);
   try{const response=await api('/api/health');if(response.ok){ready=true;break}}catch{}
   await delay(150);
  }
  assert.ok(ready,'server started: '+logs);
  const health=await (await api('/api/health')).json();
  assert.equal(health.version,'4.1');
  assert.equal((await api('/api/orders')).status,401,'require login');
  const page=await api('/chat');
  assert.equal(page.status,200,'Mobile chat route is accessible');
  assert.match(await page.text(),/FLYXJ.*Direct Live Chat/);
  const script=await api('/assets/mobile-chat.js');
  assert.equal(script.status,200,'Mobile chat script served');
  assert.match(await script.text(),/function initialize/);
  const a=await login('usera','TestingCustomerPass!123');
  const b=await login('userb','TestingStaffPass!123');
  const baseOrder={title:'Custom leather dress',size:'M',colour:'Black',quantity:1,comments:'Made to size',
   images:[picture],measurements:{bust:'36 in',waist:'28 in'},expected_date:'2026-12-30',priority:'high'};
  assert.equal((await api('/api/orders',a,'POST',baseOrder)).status,400,'PDF required');
  assert.equal((await api('/api/orders',b,'POST',{...baseOrder,pdf})).status,403,'staff cannot submit');
  const newResponse=await api('/api/orders',a,'POST',{...baseOrder,pdf});
  assert.equal(newResponse.status,201,'create order: '+await newResponse.clone().text());
  const order=(await newResponse.json()).order;
  assert.equal(order.measurements.bust,'36 in');
  assert.ok(order.pdf_url);
  // One PNG image only: ZIP/CSV/TXT endpoints were intentionally removed.
  assert.equal((await api('/api/orders/'+order.id+'/maker.zip',b)).status,404);
  assert.equal((await api('/api/orders/'+order.id+'/maker.txt',b)).status,404);
  const makerPath='/api/orders/'+order.id+'/maker-image';
  const empty=await api(makerPath,b,'POST',{png:'abc'});
  assert.equal(empty.status,400,'reject arbitrary non-PNG upload');
  const fakePng=Buffer.alloc(74);
  Buffer.from('89504e470d0a1a0a','hex').copy(fakePng,0);
  fakePng.write('IHDR',12,'ascii');
  fakePng.writeUInt32BE(1200,16);fakePng.writeUInt32BE(1400,20);
  fakePng.writeUInt32BE(0x49454e44,fakePng.length-8);
  const collagePayload={png:'data:image/png;base64,'+fakePng.toString('base64')};
  assert.equal((await api(makerPath,a,'POST',collagePayload)).status,403,'User A cannot generate maker download');
  const savedImage=await api(makerPath,b,'POST',collagePayload);
  assert.equal(savedImage.status,200,'staff creates one PNG download ticket');
  const imageUrl=(await savedImage.json()).url;
  assert.match(imageUrl,/maker-image\/[a-f0-9-]{36}$/);
  assert.equal((await api(imageUrl,a)).status,403,'User A cannot download staff maker PNG');
  const imageResponse=await api(imageUrl,b);
  assert.equal(imageResponse.status,200,'User B downloads one maker PNG');
  assert.match(imageResponse.headers.get('content-type'),/image\/png/);
  assert.match(imageResponse.headers.get('content-disposition'),/MAKER-IMAGE.png/);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),fakePng,'download preserves generated PNG exactly');
  assert.equal((await api(order.pdf_url,a)).status,200,'customer can open own PDF');
  assert.equal((await api(order.pdf_url,b)).status,200,'staff can open PDF');
  assert.equal((await api(order.photos[0],a)).status,200,'customer photo');
  const whats=(await (await api('/api/orders/'+order.id+'/whatsapp',a)).json());
  assert.equal(whats.recipient,'971567527192');
  assert.match(whats.url,/^https:\/\/wa.me\/971567527192\?text=/);
  const decoded=decodeURIComponent(whats.url.split('?text=')[1]);
  assert.match(decoded,/api\/orders\/1\/pdf/);
  assert.match(decoded,/api\/orders\/1\/photos\/0/);
  assert.equal(whats.automatic_enabled,false,'WhatsApp cannot auto-send without configured Business API');
  assert.equal((await api('/api/orders/deleted',a)).status,200);
  const changed=await api('/api/orders/'+order.id+'/edit',a,'PATCH',{
   updated_at:order.updated_at,title:'Custom revised leather dress',colour:'Dark brown',size:'L',
   quantity:2,comments:'New production note',images:[picture,picture],
   pdf:'data:application/pdf;base64,'+Buffer.from('%PDF-1.7\n2 0 obj\n<< /Updated true >>\nendobj\n%%EOF').toString('base64')
  });
  assert.equal(changed.status,200,'User A can edit and replace PDF/photos');
  const edited=(await changed.json()).order;
  assert.equal(edited.title,'Custom revised leather dress');
  assert.equal(edited.size,'L');
  assert.equal(edited.photos.length,2,'replacement photos are saved');
  assert.equal((await api(edited.pdf_url,b)).status,200,'replaced PDF remains accessible');
  assert.equal((await api(edited.photos[1],b)).status,200,'replaced photo accessible');
  assert.equal((await api('/api/orders/'+order.id+'/edit',a,'PATCH',{updated_at:order.updated_at,title:'Stale edit'})).status,409,'stale edits rejected');
  const staffEdit=await api('/api/orders/'+order.id+'/edit',b,'PATCH',{updated_at:edited.updated_at,colour:'Walnut brown',priority:'urgent'});
  assert.equal(staffEdit.status,200,'User B can edit same order');
  assert.equal((await staffEdit.json()).order.colour,'Walnut brown');

  assert.equal((await api('/api/orders/'+order.id+'/status',a,'PATCH',{status:'shipped'})).status,403);
  assert.equal((await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'shipped'})).status,400,'shipping needs prices and tracking');
  assert.equal((await api('/api/orders/'+order.id+'/finance',a,'PATCH',{sale_pkr:40000})).status,403);
  const approveRequest=await api('/api/orders/'+order.id+'/request-approval',b,'POST',{note:'Please approve design'});
  assert.equal(approveRequest.status,200);
  assert.equal((await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'cutting'})).status,400,'approval required');
  assert.equal((await api('/api/orders/'+order.id+'/approve',a,'POST',{decision:'approved'})).status,200);
  assert.equal((await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'cutting'})).status,200);
  const finance={sale_pkr:40000,making_pkr:22000,shipping_pkr:3000,fx_pkr_per_usd:300};
  const shipment=await api('/api/orders/'+order.id+'/status',b,'PATCH',{status:'shipped',
   shipping:{courier:'DHL',tracking_id:'AB12345678',tracking_url:'https://www.dhl.com/'},finance});
  assert.equal(shipment.status,200,'ship with full details: '+await shipment.clone().text());
  const customerOrder=(await (await api('/api/orders/'+order.id,a)).json()).order;
  assert.equal(customerOrder.shipping.tracking_id,'AB12345678');
  assert.equal(customerOrder.shipping.courier,'DHL');
  assert.equal(customerOrder.finance.sale_pkr,40000);
  const report=(await (await api('/api/finance',a)).json());
  assert.equal(report.count,1);
  assert.equal(report.totals.sale_pkr,40000);
  assert.equal(report.totals.making_pkr,22000);
  assert.equal(report.totals.shipping_pkr,3000);
  assert.equal(report.totals.cost_pkr,25000);
  assert.equal(report.totals.profit_pkr,15000);
  assert.equal(report.rows[0].profit_usd,50);
  assert.ok(report.weekly.length===10&&report.monthly.length===12);
  assert.equal((await api('/api/finance.csv',a)).status,200);
  const summary=await api('/api/orders/'+order.id+'/summary.pdf',a);
  assert.equal(summary.status,200,'summary pdf');
  assert.match((await summary.text()).slice(0,10),/^%PDF/);
  const c1=await api('/api/chat',a,'POST',{message:'Is the parcel on its way?'});
  assert.equal(c1.status,201);
  const c2=await api('/api/chat',b,'POST',{message:'Yes, DHL tracking is on your order'});
  assert.equal(c2.status,201);
  const chat=(await (await api('/api/chat',a)).json()).messages;
  assert.equal(chat.length,2);
  assert.equal((await api('/api/chat/read',a,'POST',{})).status,200);
  assert.equal((await api('/api/chat',null)).status,401);
  const finished=await api('/api/orders/'+order.id+'/finished',b,'POST',{photo:picture});
  assert.equal(finished.status,200);
  assert.equal((await api('/api/orders/'+order.id+'/finished/0',a)).status,200);
  assert.equal((await api('/api/backup.json',a)).status,403,'only staff can export all data');
  const backup=(await (await api('/api/backup.json',b)).json());
  assert.equal(backup.format,'flyxj-backup-v3');
  assert.equal(backup.orders.length,1);
  const addedStaff=await api('/api/staff',b,'POST',{username:'cuttingteam',password:'NewStaffStrongPassword!223'});
  assert.equal(addedStaff.status,201);
  const third=await login('cuttingteam','NewStaffStrongPassword!223');
  assert.equal((await api('/api/finance',third)).status,200);
  assert.equal((await api('/api/orders',third)).status,200);
  assert.equal((await api('/api/orders',a,'POST',{...baseOrder,pdf},{'x-csrf-token':'wrong'})).status,403);

  // The previous 6MB limit was rejecting valid dress specification documents.
  const largePdf=Buffer.alloc(7*1024*1024,65);
  Buffer.from('%PDF-1.7\n').copy(largePdf,0);
  const bigRaw='data:application/pdf;base64,'+largePdf.toString('base64');
  const largeResponse=await api('/api/orders',a,'POST',{...baseOrder,title:'Large PDF dress',pdf:bigRaw});
  assert.equal(largeResponse.status,201,'PDF larger than old 6MB limit accepted: '+await largeResponse.clone().text().then(t=>t.slice(0,300)));
  const largeOrder=(await largeResponse.json()).order;
  const returnedLarge=await api(largeOrder.pdf_url,a);
  assert.equal(returnedLarge.status,200);
  assert.equal((await returnedLarge.arrayBuffer()).byteLength,largePdf.length,'PDF bytes preserved after upload');
  const zippedPdf=require('node:zlib').gzipSync(largePdf);
  const compressedData='data:application/x-flyxj-pdf+gzip;base64,'+zippedPdf.toString('base64');
  const zippedResponse=await api('/api/orders',a,'POST',{...baseOrder,title:'Compressed PDF dress',pdf:compressedData});
  assert.equal(zippedResponse.status,201,'gzip PDF upload accepted: '+await zippedResponse.clone().text().then(t=>t.slice(0,300)));
  const compressedOrder=(await zippedResponse.json()).order;
  const returnedZipped=Buffer.from(await (await api(compressedOrder.pdf_url,a)).arrayBuffer());
  assert.ok(returnedZipped.equals(largePdf),'Gzip upload returns original valid PDF without quality loss');
  const bomPdf=Buffer.concat([Buffer.from([239,187,191,10]),Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF')]);
  const bomResponse=await api('/api/orders',a,'POST',{...baseOrder,title:'Preamble PDF dress',pdf:'data:application/pdf;base64,'+bomPdf.toString('base64')});
  assert.equal(bomResponse.status,201,'PDF with BOM/preamble accepted');
  const invalidGzip=await api('/api/orders',a,'POST',{...baseOrder,pdf:'data:application/x-flyxj-pdf+gzip;base64,'+Buffer.from('not a gzip file').toString('base64')});
  assert.equal(invalidGzip.status,400,'invalid gzip payload rejected');
  const zippedBomb=Buffer.alloc(30*1024*1024+1,65);
  Buffer.from('%PDF-1.7\n').copy(zippedBomb,0);
  const bombResponse=await api('/api/orders',a,'POST',{...baseOrder,pdf:'data:application/x-flyxj-pdf+gzip;base64,'+require('node:zlib').gzipSync(zippedBomb).toString('base64')});
  assert.equal(bombResponse.status,400,'PDF gzip output above 30MB rejected safely');
  const beforeDelete=(await (await api('/api/orders/'+compressedOrder.id,a)).json()).order;
  const del=await api('/api/orders/'+compressedOrder.id,a,'DELETE',{updated_at:beforeDelete.updated_at});
  assert.equal(del.status,200,'User A can soft-delete order');
  assert.equal((await api('/api/orders/'+compressedOrder.id,b)).status,404,'deleted order is hidden from User B');
  const deleted=(await (await api('/api/orders/deleted',a)).json()).orders;
  assert.ok(deleted.some(x=>x.id===compressedOrder.id),'User A sees recoverable deleted orders');
  assert.ok((await (await api('/api/orders/deleted',b)).json()).orders.some(x=>x.id===compressedOrder.id),'User B sees deleted orders');
  const restore=await api('/api/orders/'+compressedOrder.id+'/restore',b,'POST',{});
  assert.equal(restore.status,200,'User B can restore order deleted by User A');
  assert.equal((await api('/api/orders/'+compressedOrder.id,a)).status,200,'restored order visible to User A');
  const newer=(await (await api('/api/orders/'+compressedOrder.id,b)).json()).order;
  assert.equal((await api('/api/orders/'+compressedOrder.id,b,'DELETE',{updated_at:newer.updated_at})).status,200,'User B can delete order too');
  assert.equal((await api('/api/orders/'+compressedOrder.id+'/restore',a,'POST',{})).status,200,'User A can restore staff-deleted order');


 }finally{
  processServer.kill('SIGTERM');
  await delay(200);
  fs.rmSync(directory,{recursive:true,force:true});
 }
});