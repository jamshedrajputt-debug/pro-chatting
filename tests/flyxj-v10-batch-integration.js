'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const sharp=require('sharp');
const root=path.join(__dirname,'../flyxj-server/v3');
for(const file of ['server.js','maker-compose.js','assets/v10-batch-share.js','assets/two-way-notifications.js','assets/app.js','assets/v8-experience.js']){
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file}),file+' syntax');
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(root,'assets/v13-command-center.js'),'utf8')));
assert.match(html,/Production Command Centre/);
assert.match(html,/v10-batch-share\.js/);assert.match(html,/v10-professional\.css/);
assert.match(html,/v11-orderwise-share\.js/, 'V11 order-wise script loads'); 
const orderwise=fs.readFileSync(path.join(root,'assets/v11-orderwise-share.js'),'utf8');
assert.match(html,/v15-exact-image/,'browser loads latest image sequence UI');
assert.match(html,/v14-open-alert/,'app-open notifications cache is refreshed');
const alerts=fs.readFileSync(path.join(root,'assets/two-way-notifications.js'),'utf8');
assert.match(alerts,/function launchSummary/,'Android opens with one non-spam catch-up alert');

assert.doesNotThrow(()=>new vm.Script(orderwise),'V11 order-wise JS parses');
assert.match(orderwise,/Share ALL · Exact Image/,'exact sequence image is primary');
assert.match(orderwise,/ordered-share-image/,'single JPEG endpoint is used');
assert.match(orderwise,/image\/jpeg/,'native Android shares JPEG MIME');

assert.match(orderwise,/Share ALL Orders Together/,'bulk share button exists');
assert.match(orderwise,/for\(const p of plans\)/,'order-wise bulk iterates in sequence');
assert.match(orderwise,/tickets\.push\(await issue\(p\.o,\{kind:'photo'/,'each original photo is included');
assert.match(orderwise,/tickets\.push\(await issue\(p\.o,\{kind:'batch-maker'/,'detail card follows each order photos');
for(const fragment of ["kind:'photo'","kind:'batch-maker'","cardLast:true","shareFiles","navigator.share","Photo ","Next Order"])
 assert.ok(orderwise.includes(fragment),'V11 contains '+fragment);

const client=fs.readFileSync(path.join(root,'assets/v10-batch-share.js'),'utf8');
assert.match(client,/SIZE:/);assert.match(client,/COLOUR:/);assert.match(client,/kind:'batch-maker'/);
assert.match(client,/function summary/);assert.match(client,/sequence:i\+1/);
assert.match(client,/selected\.keys\(\)\]\.map\(id=>state\.orders\.find/, 'selection always reads the newest order state');
assert.match(client,/key=JSON\.stringify\(items\)/,'prepared attachment cache includes live order details');
assert.match(client,/JSON\.stringify\(all\(\)\)!==key/,'refuse stale photo packs when orders change during preparation');
const {svgCaption}=require('../flyxj-server/v3/maker-compose.js');
const embedded=svgCaption('XL','Brown','FXJ-2026-123','02/03','QTY 4').toString();
for(const x of ['XL','Brown','FXJ-2026-123','02/03','QTY 4'])assert.ok(embedded.includes(x),'embedded production marker '+x);
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'flyxj-v10-test-'));
const order={id:1,reference:'FXJ-2026-000001',title:'Leather rider jacket',size:'XL',colour:'Brown',
 quantity:4,status:'pending',customer:'usera',ordered_by:'usera',created_at:'2026-11-28T01:00:00.000Z',
 updated_at:'2026-11-28T01:00:00.000Z',image_files:[],history:[],messages:[],
 finance:{making_pkr:null,shipping_pkr:null,fx_pkr_per_usd:null}};
let processServer=null;const port=19173,base='http://127.0.0.1:'+port;
async function boot(){
 const env={...process.env,PORT:String(port),FLYXJ_DATA_DIR:dataDir,
  FLYXJ_STORAGE_BRIDGE_URL:'',FLYXJ_STORAGE_TOKEN:'',FLYXJ_CUSTOMER_USERNAME:'usera',
  FLYXJ_CUSTOMER_PASSWORD:'customer-test-password-12345',FLYXJ_STAFF_USERNAME:'userb',
  FLYXJ_STAFF_PASSWORD:'staff-test-password-12345',WHATSAPP_ACCESS_TOKEN:''};
 processServer=spawn(process.execPath,['flyxj-server/v3/server.js'],{cwd:path.join(__dirname,'..'),env,
 stdio:['ignore','pipe','pipe']});
 for(let i=0;i<150;i++){
  if(processServer.exitCode!==null)throw Error('Test server exited '+processServer.exitCode);
  try{if((await fetch(base+'/api/health')).ok)return}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Server start timeout');
}
async function stop(){
 if(!processServer)return;
 const child=processServer;processServer=null;
 await new Promise(resolve=>{
  child.once('exit',resolve);child.kill('SIGTERM');
  setTimeout(resolve,2500);
 });
}
async function send(p,cookie,csrf,method='GET',body){
 const headers={};if(cookie)headers.cookie=cookie;
 if(body!==undefined)headers['content-type']='application/json';
 if(cookie&&method!=='GET')headers['x-csrf-token']=csrf;
 const r=await fetch(base+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {response:r,data:await r.json().catch(()=>({}))};
}
async function run(){
 const photo=await sharp({create:{width:120,height:120,channels:3,background:'#bb874c'}}).png().toBuffer();
 order.image='data:image/png;base64,'+photo.toString('base64');
 const pdfMaker=require('../flyxj-server/v3/ordered-share-pdf.js');
 const pack=await pdfMaker.make([{order,photos:[photo]},{order:{...order,id:2,reference:'FXJ-2'},photos:[photo]}]);
 assert.match(pack.subarray(0,8).toString('ascii'),/^%PDF-1.4/);
 assert.match(pack.toString('latin1'),/\/Count 2/,'two order pages retain order');
 assert.match(pack.toString('latin1'),/\/DCTDecode/,'original photo pixels embedded');
 const imagePack=await pdfMaker.makeImage([
  {order,photos:[photo]},{order:{...order,id:2,reference:'FXJ-2'},photos:[photo]}
 ]);
 const longMeta=await sharp(imagePack).metadata();
 assert.equal(longMeta.format,'jpeg','exact sequence is a WhatsApp photo, never a PDF');
 assert.equal(longMeta.width,1200);
 assert.equal(longMeta.height,3400,'two orders stacked, photos then each order info');


 fs.writeFileSync(path.join(dataDir,'orders.json'),JSON.stringify([order]));
 await boot();
 let r=await send('/api/login',null,null,'POST',{username:'userb',password:'staff-test-password-12345'});
 assert.equal(r.response.status,200);const cookie=r.response.headers.get('set-cookie').split(';')[0],csrf=r.data.csrf;
 assert.match(cookie,/flyxj_session=/);
 assert.equal((await send('/api/me',cookie)).response.status,200,'logged in');
 r=await send('/api/orders/1/mobile-file',cookie,csrf,'POST',{kind:'batch-maker',sequence:1,total:2});
 assert.equal(r.response.status,200,'staff can prepare numbered image');
 assert.match(r.data.filename,/01-OF-02/);
 const file=await fetch(base+r.data.url);
 assert.equal(file.status,200);assert.match(file.headers.get('content-type'),/image\/png/);
 const bytes=Buffer.from(await file.arrayBuffer());
 assert((await sharp(bytes).metadata()).width===1200);
 assert((await sharp(bytes).metadata()).height===1400);
 assert.equal((await send('/api/orders/1/mobile-file',cookie,csrf,'POST',{kind:'batch-maker',sequence:7,total:7})).response.status,400);
 r=await send('/api/orders/1/mobile-file',cookie,csrf,'POST',{kind:'photo',index:0,sequence:1,total:2});
 assert.equal(r.response.status,200,'numbered original photo is available');
 assert.match(r.data.filename,/^01-OF-02-01-/,'original photo keeps sequence');
 r=await send('/api/orders/1/mobile-file',cookie,csrf,'POST',{kind:'batch-maker',sequence:1,total:2,cardLast:true});
 assert.equal(r.response.status,200,'last info card available');
 assert.match(r.data.filename,/^01-OF-02-99-/,'details card follows original photos');
 const detailFile=await fetch(base+r.data.url);
 assert.equal(detailFile.status,200,'detail image ticket still works');
 const ticketUrls=[];
 for(let index=0;index<20;index++){
  const prepared=await send('/api/orders/1/mobile-file',cookie,csrf,'POST',{kind:'photo',index:0,sequence:1,total:2});
  assert.equal(prepared.response.status,200,'prepare bulk numbered photos');ticketUrls.push(prepared.data.url);
 }
 assert.equal((await fetch(base+ticketUrls[0])).status,200,'early image ticket remains valid during a bulk pack');

 r=await send('/api/orders/ordered-share-pdf',cookie,csrf,'POST',{
  orders:[{id:1,updatedAt:order.updated_at,photoIndexes:[0]}]
 });
 assert.equal(r.response.status,200,'staff generates one ordered PDF');
 assert.match(r.data.filename,/EXACT-SEQUENCE\.pdf$/);
 const exactPdf=await fetch(base+r.data.url);
 assert.equal(exactPdf.status,200,'temporary exact sequence PDF can be downloaded');
 assert.match(exactPdf.headers.get('content-type'),/application\/pdf/);
 assert.match(Buffer.from(await exactPdf.arrayBuffer()).subarray(0,8).toString('ascii'),/^%PDF-1.4/);

 r=await send('/api/orders/ordered-share-image',cookie,csrf,'POST',{
  orders:[{id:1,updatedAt:order.updated_at,photoIndexes:[0]}]
 });
 assert.equal(r.response.status,200,'staff can build exact sequence JPG');
 assert.match(r.data.filename,/EXACT-SEQUENCE\.jpg$/);
 assert.equal(r.data.mime,'image/jpeg');
 const exactImage=await fetch(base+r.data.url);
 assert.equal(exactImage.status,200);
 assert.match(exactImage.headers.get('content-type'),/image\/jpeg/);
 const exactMeta=await sharp(Buffer.from(await exactImage.arrayBuffer())).metadata();
 assert.equal(exactMeta.width,1200);assert.equal(exactMeta.height,1700);
 const duplicate=await send('/api/orders/ordered-share-pdf',cookie,csrf,'POST',{
  orders:[{id:1,photoIndexes:[0]},{id:1,photoIndexes:[0]}]
 });
 assert.equal(duplicate.response.status,400,'duplicate orders are rejected');
 const customer=await send('/api/login',null,null,'POST',{username:'usera',password:'customer-test-password-12345'});
 assert.equal(customer.response.status,200);
 const customerCookie=customer.response.headers.get('set-cookie').split(';')[0];
 assert.equal((await send('/api/orders/ordered-share-image',customerCookie,customer.data.csrf,'POST',{
 orders:[{id:1,photoIndexes:[0]}]})).response.status,403,'customer cannot export staff image packs');
 assert.equal((await send('/api/orders/ordered-share-pdf',customerCookie,customer.data.csrf,'POST',{
 orders:[{id:1,photoIndexes:[0]}]})).response.status,403,'customer cannot export internal packs');

 assert.equal((await send('/api/orders/1/mobile-file',customer.response.headers.get('set-cookie').split(';')[0],customer.data.csrf,'POST',{kind:'batch-maker',sequence:1,total:1})).response.status,403);
 await stop();
 await boot();
 assert.equal((await send('/api/me',cookie)).response.status,200,'session survives server restart (free hosting sleep)');
 const logout=await send('/api/logout',cookie,csrf,'POST');
 assert.equal(logout.response.status,200);
 assert.equal((await send('/api/me',cookie)).response.status,401,'logout rejects existing token');
 const feed=await send('/api/notifications',cookie);
 assert.equal(feed.response.status,401,'logout hides private notifications');
 console.log('PASS V10 numbered image pack, size/colour/sequence, role protection, signed login survives restart, logout and notifications permissions');
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await stop();fs.rmSync(dataDir,{recursive:true,force:true})});
