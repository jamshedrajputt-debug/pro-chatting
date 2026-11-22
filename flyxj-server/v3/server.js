'use strict';
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const persistent = require('./persistent.js');

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'90mb'}));
app.use((req,res,next)=>{
  res.set('X-Content-Type-Options','nosniff');
  res.set('X-Frame-Options','DENY');
  res.set('Referrer-Policy','no-referrer');
  if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');
  next();
});

const DATA_DIR = process.env.FLYXJ_DATA_DIR || path.join(__dirname,'data');
const PHOTO_DIR = path.join(DATA_DIR,'photos');
fs.mkdirSync(PHOTO_DIR,{recursive:true});
const PDF_DIR=path.join(DATA_DIR,'pdfs');
const CHAT_PHOTO_DIR=path.join(DATA_DIR,'chat-images');
for(const dir of [PDF_DIR,CHAT_PHOTO_DIR])fs.mkdirSync(dir,{recursive:true});
const STAFF_FILE=path.join(DATA_DIR,'staff-accounts.json'),CHAT_FILE=path.join(DATA_DIR,'direct-chat.json');
function readArray(file){try{const data=JSON.parse(fs.readFileSync(file,'utf8'));return Array.isArray(data)?data:[]}catch{return []}}
let additionalStaff=readArray(STAFF_FILE),directChat=readArray(CHAT_FILE);
function writeLocalAtomic(file,data){fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file)}
async function saveAtomic(file,data){
 const namespace=file===CHAT_FILE?'direct_chat':file===STAFF_FILE?'staff_accounts':null;
 if(!namespace)throw Error('Unsupported FlyXJ state file');
 if(persistent.enabled)await persistent.save(namespace,data);
 writeLocalAtomic(file,data);
}

const FILE = path.join(DATA_DIR,'orders.json');
let orders = [];
let reservedOrderId=0;
try {
  const raw=JSON.parse(fs.readFileSync(FILE,'utf8'));
  if(Array.isArray(raw))orders=raw;
} catch(err) {
  if(err.code!=='ENOENT')console.error('Order data load error:',err.message);
}
const users = [
  {name:process.env.FLYXJ_CUSTOMER_USERNAME||'usera',password:process.env.FLYXJ_CUSTOMER_PASSWORD||'',role:'customer'},
  {name:process.env.FLYXJ_STAFF_USERNAME||'userb',password:process.env.FLYXJ_STAFF_PASSWORD||'',role:'staff'}
];
if(users.some(u=>u.password.length<12)||users[0].name.toLowerCase()===users[1].name.toLowerCase()){
  console.error('Set separate secure FLYXJ_CUSTOMER_PASSWORD and FLYXJ_STAFF_PASSWORD (12+ characters).');
  process.exit(1);
}
const sessions=new Map();
const loginTries=new Map();
// Live tracking events are visible only to the order's authenticated customer.
const trackingClients=new Set();
function pushEvent(name,body,allow) {
 const message='event: '+name+'\ndata: '+JSON.stringify(body)+'\n\n';
 for(const c of trackingClients)if(allow(c)){try{c.response.write(message)}catch{trackingClients.delete(c)}}
}
function pushOrder(o,event,description){
 pushEvent(event,{order_id:o.id,reference:ref(o),description,updated_at:o.updated_at},
 c=>c.role==='staff'||c.username===(o.customer||o.ordered_by));
}
function pushPresence(){
 pushEvent('presence',{staff_online:[...trackingClients].some(c=>c.role==='staff'),
 customer_online:[...trackingClients].some(c=>c.role==='customer')},()=>true);
}

function notifyCustomerTracking(order){
  const body='event: tracking\ndata: '+JSON.stringify({
    order_id:order.id,reference:ref(order),
    courier:order.shipping.courier,tracking_id:order.shipping.tracking_id,
    updated_at:order.shipping.updated_at
  })+'\n\n';
  for(const client of trackingClients){
    if(client.username!==(order.customer||order.ordered_by))continue;
    try{client.response.write(body)}catch{trackingClients.delete(client)}
  }
}
const STATUSES=['pending','awaiting_approval','confirmed','cutting','stitching','in_progress','quality_check','shipped','delivered','completed','cancelled'];
const SIZES=['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','CUSTOM'];
const MAX_IMAGES=8,MAX_IMAGE_BYTES=2500000,MAX_TOTAL_BYTES=16000000;
const now=()=>new Date().toISOString();
const err=(res,code,detail)=>res.status(code).json({detail});
const text=(s,max=200)=>typeof s==='string'?s.trim().slice(0,max):'';
const ref=o=>o.reference || ('FXJ-'+String(o.id).padStart(6,'0'));
const canView=(u,o)=>u.role==='staff'||(o.customer||o.ordered_by)===u.username;
const shipDefault=()=>({courier:'',tracking_id:'',tracking_url:'',updated_at:null});
const financeDefault=()=>({sale_pkr:null,making_pkr:null,shipping_pkr:null,fx_pkr_per_usd:null,updated_at:null,recognized_at:null});
const isShipped=o=>['shipped','delivered','completed'].includes(o.status);
function validFinance(f) {
 return !!f&&['sale_pkr','making_pkr','shipping_pkr','fx_pkr_per_usd'].every(k=>f[k]!=null&&String(f[k]).trim()!==''&&Number.isFinite(Number(f[k]))&&Number(f[k])>=0&&Number(f[k])<=1e9)&&Number(f.sale_pkr)>0&&Number(f.fx_pkr_per_usd)>0;
}
function normalizeFinance(body,old){
 if(!validFinance(body))return null;
 const f={updated_at:now(),recognized_at:old?.recognized_at||null};
 for(const k of ['sale_pkr','making_pkr','shipping_pkr','fx_pkr_per_usd'])f[k]=Math.round(Number(body[k])*100)/100;
 return f;
}
function financeRow(o){
 const f=o.finance;if(!validFinance(f))return null;
 const round=n=>Math.round(n*100)/100, fx=Number(f.fx_pkr_per_usd);
 const sale=Number(f.sale_pkr),making=Number(f.making_pkr),shipping=Number(f.shipping_pkr);
 const cost=round(making+shipping),profit=round(sale-cost);
 const usd=n=>round(n/fx);
 return {id:o.id,reference:ref(o),title:o.title,quantity:o.quantity||1,status:o.status,
 date:f.recognized_at||o.shipped_at||o.updated_at||o.created_at,courier:o.shipping?.courier||'',
 tracking_id:o.shipping?.tracking_id||'',sale_pkr:sale,making_pkr:making,shipping_pkr:shipping,
 cost_pkr:cost,profit_pkr:profit,sale_usd:usd(sale),making_usd:usd(making),shipping_usd:usd(shipping),
 cost_usd:usd(cost),profit_usd:usd(profit),fx_pkr_per_usd:fx};
}
const MAX_PDF_BYTES=30*1024*1024;
function parsePdf(raw){
 // Plain PDFs and losslessly gzip-compressed PDFs are both supported.
 // Gzip is decompressed with an output cap to prevent zip bombs.
 if(typeof raw!=='string'||raw.length>Math.ceil(MAX_PDF_BYTES*4/3)+1024)return null;
 const m=/^data:application\/(pdf|x-flyxj-pdf\+gzip);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
 if(!m)return null;
 let bytes=Buffer.from(m[2],'base64');
 if(bytes.length>MAX_PDF_BYTES)return null;
 if(m[1]==='x-flyxj-pdf+gzip'){
  if(bytes.length<10||bytes[0]!==0x1f||bytes[1]!==0x8b)return null;
  try{bytes=zlib.gunzipSync(bytes,{maxOutputLength:MAX_PDF_BYTES})}catch{return null}
 }
 if(bytes.length<20||bytes.length>MAX_PDF_BYTES)return null;
 // Allow headers after whitespace, BOM or benign preamble (per PDF-reader tolerances).
 const offset=bytes.indexOf('%PDF-');
 if(offset<0||offset>1024)return null;
 return bytes;
}
async function storedAttachment(req,res,folder,filename,mime,download=false){
 if(!filename||!/^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/.test(filename))return err(res,404,'Attachment missing');
 const absolute=path.join(folder,filename);
 res.set('Content-Type',mime);res.set('Cache-Control','private, no-store');
 if(download)res.set('Content-Disposition','attachment; filename="FLYXJ-'+req.params.id+'-spec.pdf"');
 if(fs.existsSync(absolute))return res.sendFile(absolute);
 if(persistent.enabled){
  try{
   const category=folder===PDF_DIR?'pdfs':folder===CHAT_PHOTO_DIR?'chat-images':'photos';
   const bytes=await persistent.download(category,filename);
   if(bytes)return res.send(bytes);
  }catch(e){console.error('Attachment read error:',e.message);return err(res,503,'Private file storage temporarily unavailable')}
 }
 return err(res,404,'Attachment unavailable');
}

const safeUrl=url=>{const v=text(url,600);if(!v)return '';try{const u=new URL(v);return u.protocol==='https:'?u.toString():null;}catch{return null;}};
async function save(){
 if(persistent.enabled)await persistent.save('orders',orders);
 writeLocalAtomic(FILE,orders);
}
function imageData(raw) {
  if(typeof raw!=='string'||raw.length>Math.ceil(MAX_IMAGE_BYTES*4/3)+256)return null;
  const m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if(!m)return null;
  let bytes;
  try{bytes=Buffer.from(m[2],'base64')}catch{return null}
  if(bytes.length<20||bytes.length>MAX_IMAGE_BYTES)return null;
  const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  const kind=jpg?'jpeg':png?'png':webp?'webp':null;
  return kind?{bytes,mime:'image/'+kind,ext:kind==='jpeg'?'jpg':kind}:null;
}
function publicOrder(o) {
  const {image,image_files,images,photos,pdf_file,finished_files,...rest}=o;
  let count=Array.isArray(image_files)?image_files.length:0;
  if(!count&&typeof image==='string')count=1;
  return {
    ...rest,reference:ref(o),
    customer:o.customer||o.ordered_by||'',
    shipping:o.shipping||shipDefault(),
    finance:o.finance||financeDefault(),
    measurements:o.measurements||{},expected_date:o.expected_date||'',priority:o.priority||'normal',
    approval:o.approval||{status:'not_requested',note:'',updated_at:null},
    pdf_url:o.pdf_file?'/api/orders/'+o.id+'/pdf':null,
    finished_photos:(o.finished_files||[]).map((_,i)=>'/api/orders/'+o.id+'/finished/'+i),
    return_shipping:o.return_shipping||shipDefault(),
    messages:Array.isArray(o.messages)?o.messages:[],
    history:Array.isArray(o.history)?o.history:[],
    photos:Array.from({length:count},(_,i)=>'/api/orders/'+o.id+'/photos/'+i)
  };
}
function cookieToken(req){const m=/(?:^|;\s*)flyxj_session=([^;]+)/.exec(req.headers.cookie||'');return m?m[1]:null}
function auth(req,res,next){
  const token=cookieToken(req),session=token&&sessions.get(token);
  if(!session||session.expires<Date.now()){if(token)sessions.delete(token);return err(res,401,'Login required');}
  req.user=session;req.token=token;next();
}
function csrf(req,res,next){if(req.get('x-csrf-token')!==req.user.csrf)return err(res,403,'Security token invalid; log in again');next();}
function loadOrder(req,res){
  const id=Number(req.params.id);
  const o=Number.isInteger(id)&&orders.find(x=>x.id===id);
  if(!o||!canView(req.user,o)){err(res,404,'Order not found');return null;}
  return o;
}
function history(o,actor,label,kind='updated'){
  o.updated_at=now();
  if(!Array.isArray(o.history))o.history=[];
  o.history.push({id:crypto.randomUUID(),at:o.updated_at,by:actor,kind,label});
}
function slimStats(list) {
  const by_status=Object.fromEntries(STATUSES.map(s=>[s,0]));
  for(const o of list)if(by_status[o.status]!==undefined)by_status[o.status]++;
  const active=list.filter(o=>!['completed','cancelled','delivered'].includes(o.status)).length;
  const shipped=list.filter(o=>['shipped','delivered'].includes(o.status)).length;
  const this_week=list.filter(o=>Date.now()-new Date(o.created_at).getTime()<7*86400000).length;
  return {total:list.length,active,shipped,completed:by_status.completed+by_status.delivered,this_week,by_status};
}

app.get('/api/health',(req,res)=>res.json({ok:true,version:'4.0',storage:persistent.enabled?'supabase-private':'ephemeral',orders:orders.length}));
app.post('/api/login',(req,res)=>{
  const username=text(req.body&&req.body.username,100);
  const password=req.body&&req.body.password;
  if(!username||typeof password!=='string'||password.length>300)return err(res,400,'Enter username and password');
  const key=req.ip||'unknown',recent=loginTries.get(key)||{count:0,since:Date.now()};
  if(Date.now()-recent.since>900000){recent.count=0;recent.since=Date.now();}
  if(recent.count>=20)return err(res,429,'Too many attempts. Try again later.');
  const found=users.find(u=>u.name.toLowerCase()===username.toLowerCase());
  const extra=additionalStaff.find(u=>u.name.toLowerCase()===username.toLowerCase()&&u.active!==false);
  const account=found||extra;
  const salt=extra?extra.salt:'flyxj-login-check';
  const a=crypto.scryptSync(password,salt,32);
  const b=extra?Buffer.from(extra.hash,'hex'):crypto.scryptSync(found?found.password:'unknown-invalid-password',salt,32);
  if(!account||!crypto.timingSafeEqual(a,b)){
    recent.count++;loginTries.set(key,recent);
    return err(res,401,'Incorrect username or password');
  }
  loginTries.delete(key);
  const token=crypto.randomBytes(32).toString('hex');
  const session={username:account.name,role:account.role,csrf:crypto.randomBytes(24).toString('hex'),expires:Date.now()+30*86400000};
  sessions.set(token,session);
  res.set('Set-Cookie','flyxj_session='+token+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
  res.json({username:session.username,role:session.role,csrf:session.csrf});
});
app.get('/api/me',auth,(req,res)=>res.json({username:req.user.username,role:req.user.role,csrf:req.user.csrf}));
app.post('/api/logout',auth,csrf,(req,res)=>{
  sessions.delete(req.token);
  res.set('Set-Cookie','flyxj_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.json({ok:true});
});
app.get('/api/events',auth,(req,res)=>{
  // Session-authenticated, per-user server-sent events; no public order data.
  res.status(200);
  res.set('Content-Type','text/event-stream; charset=utf-8');
  res.set('Cache-Control','no-cache, no-transform');
  res.set('X-Accel-Buffering','no');
  res.set('Connection','keep-alive');
  res.flushHeaders();
  const client={username:req.user.username,role:req.user.role,response:res};
  trackingClients.add(client);pushPresence();
  res.write('event: connected\ndata: {"ok":true}\n\n');
  const heartbeat=setInterval(()=>{
    try{res.write(': keep-alive\n\n')}catch{clearInterval(heartbeat);trackingClients.delete(client)}
  },25000);
  res.on('close',()=>{clearInterval(heartbeat);trackingClients.delete(client);pushPresence()});
});
app.get('/api/dashboard',auth,(req,res)=>{
  const allowed=orders.filter(o=>canView(req.user,o));
  res.json({stats:slimStats(allowed),recent:allowed.slice(-5).reverse().map(publicOrder),statuses:STATUSES});
});
app.get('/api/orders',auth,(req,res)=>{
  const allowed=orders.filter(o=>canView(req.user,o));
  res.json({orders:allowed.slice().reverse().map(publicOrder)});
});
app.get('/api/orders/:id',auth,(req,res)=>{
  const o=loadOrder(req,res);if(o)res.json({order:publicOrder(o)});
});
app.get('/api/orders/:id/photos/:index',auth,async(req,res)=>{
  const o=loadOrder(req,res);if(!o)return;
  const ix=Number(req.params.index);
  if(!Number.isInteger(ix)||ix<0)return err(res,404,'Photo not found');
  const files=Array.isArray(o.image_files)?o.image_files:[];
  if(files[ix]){
    const filename=files[ix];
    if(!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename))return err(res,404,'Photo not found');
    const abs=path.join(PHOTO_DIR,filename);
    if(fs.existsSync(abs))return res.sendFile(abs);
    if(persistent.enabled){
     try{
      const bytes=await persistent.download('photos',filename);
      if(bytes){res.set('Content-Type','image/'+(filename.endsWith('.jpg')?'jpeg':filename.split('.').pop()));return res.send(bytes)}
     }catch(e){return err(res,503,'Private photo storage unavailable')}
    }
    return err(res,404,'Photo unavailable');
  }
  if(ix===0&&typeof o.image==='string'){
    const parsed=imageData(o.image);
    if(!parsed)return err(res,404,'Photo unavailable');
    res.set('Content-Type',parsed.mime);
    return res.send(parsed.bytes);
  }
  return err(res,404,'Photo not found');
});
app.post('/api/orders',auth,csrf,async(req,res)=>{
  if(req.user.role!=='customer')return err(res,403,'Only customers can submit orders');
  const v=req.body||{};
  const title=text(v.title,120),colour=text(v.colour,80),size=text(v.size,80);
  const comments=text(v.comments,2500),qty=Number(v.quantity);
  const list=v.images|| (v.photo?[v.photo]:[]);
  if(title.length<2||!colour||!SIZES.includes(size)&&!(size.startsWith('CUSTOM:')&&size.length<=80))return err(res,400,'Enter dress title, valid size and colour');
  if(!Number.isInteger(qty)||qty<1||qty>1000)return err(res,400,'Quantity must be 1–1000');
  if(!Array.isArray(list)||list.length<1||list.length>MAX_IMAGES)return err(res,400,'Attach 1–8 dress pictures');
  let total=0;const parsed=[];
  for(const raw of list){const p=imageData(raw);if(!p)return err(res,400,'Each picture must be JPG, PNG or WebP under 2.5 MB');total+=p.bytes.length;parsed.push(p);}
  if(total>MAX_TOTAL_BYTES)return err(res,400,'Combined photos must be under 16 MB');
  if(orders.length>=1500)return err(res,507,'Order storage limit reached; contact staff');
  const id=Math.max(reservedOrderId,orders.reduce((n,o)=>Math.max(n,Number(o.id)||0),0))+1;
   reservedOrderId=id;
  const created_at=now(),reference='FXJ-'+new Date().getUTCFullYear()+'-'+String(id).padStart(6,'0');
  const pdfBytes=parsePdf(v.pdf);
  if(!pdfBytes)return err(res,400,'Attach a valid PDF under 30 MB. Auto-compressed upload is supported.');
  const keys=['bust','waist','hips','shoulder','sleeve','length','inseam','neck','other'];
  const measurements={};
  if(v.measurements&&typeof v.measurements==='object'&&!Array.isArray(v.measurements))
    for(const k of keys)if(v.measurements[k]!=null)measurements[k]=text(String(v.measurements[k]),90);
  const pdfName=crypto.randomUUID()+'.pdf',image_files=[];
  try {
    fs.writeFileSync(path.join(PDF_DIR,pdfName),pdfBytes,{flag:'wx'});
    for(const p of parsed){
      const filename=crypto.randomUUID()+'.'+p.ext;
      fs.writeFileSync(path.join(PHOTO_DIR,filename),p.bytes,{flag:'wx'});
      image_files.push(filename);
    }
    const o={id,reference,title,colour,size,quantity:qty,comments,status:'pending',
      pdf_file:pdfName,measurements,finished_files:[],finance:financeDefault(),
      approval:{status:'not_requested',note:'',updated_at:null},
      expected_date:/^\d{4}-\d{2}-\d{2}$/.test(v.expected_date||'')?v.expected_date:'',
      priority:['normal','high','urgent'].includes(v.priority)?v.priority:'normal',
      customer:req.user.username,ordered_by:req.user.username,created_at,updated_at:created_at,
      image_files,shipping:shipDefault(),return_shipping:shipDefault(),messages:[],
      history:[{id:crypto.randomUUID(),at:created_at,by:req.user.username,kind:'created',label:'Order submitted'}]};
    if(persistent.enabled){
     await persistent.uploadLocalFile(PDF_DIR,pdfName,'pdfs');
     for(const filename of image_files)await persistent.uploadLocalFile(PHOTO_DIR,filename,'photos');
    }
    orders.push(o);
    try{await save()}catch(ex){orders.pop();throw ex;}
    pushOrder(o,'order','New dress order submitted');
    res.status(201).json({order:publicOrder(o)});
  }catch(ex){
    image_files.forEach(f=>{try{fs.unlinkSync(path.join(PHOTO_DIR,f))}catch{}});
    try{fs.unlinkSync(path.join(PDF_DIR,pdfName))}catch{}
    console.error('Order create failed:',ex.message);
    err(res,500,'Could not save order. Please try again');
  }
});
app.post('/api/orders/:id/messages',auth,csrf,async(req,res)=>{
  const o=loadOrder(req,res);if(!o)return;
  const message=text(req.body&&req.body.message,1000);
  if(!message)return err(res,400,'Write a message');
  if(!Array.isArray(o.messages))o.messages=[];
  o.messages.push({id:crypto.randomUUID(),at:now(),by:req.user.username,role:req.user.role,text:message});
  history(o,req.user.username,'New message added','message');
  try{await save();pushOrder(o,'message','New order conversation message');res.json({order:publicOrder(o)})}catch{err(res,500,'Message could not be saved')}
});
app.patch('/api/orders/:id/status',auth,csrf,async(req,res)=>{
  if(req.user.role!=='staff')return err(res,403,'Staff only');
  const o=loadOrder(req,res);if(!o)return;
  const status=text(req.body&&req.body.status,40),note=text(req.body&&req.body.staff_note,1000);
  if(!STATUSES.includes(status))return err(res,400,'Choose a valid status');
  // Validate the whole change before changing an order in memory or on disk.
  let nextShipping=o.shipping||shipDefault(),nextFinance=o.finance||financeDefault();
  if(req.body?.shipping){
    const sh=req.body.shipping;
    const courier=text(sh.courier,100),tracking_id=text(sh.tracking_id,120),tracking_url=safeUrl(sh.tracking_url);
    if(tracking_url===null)return err(res,400,'Courier tracking link must be HTTPS');
    nextShipping={courier,tracking_id,tracking_url,updated_at:now()};
  }
  if(req.body?.finance){
    const f=normalizeFinance(req.body.finance,o.finance);
    if(!f)return err(res,400,'Enter selling price, making cost, shipping cost in PKR, and PKR/USD rate');
    nextFinance=f;
  }
  if(['shipped','delivered','completed'].includes(status)&&(!validFinance(nextFinance)||!nextShipping?.courier||!nextShipping?.tracking_id))
    return err(res,400,'Shipping requires courier, tracking ID, selling price, making cost, shipping cost and PKR per USD rate');
  if(['cutting','stitching'].includes(status)&&o.pdf_file&&o.approval?.status!=='approved')
    return err(res,400,'Customer approval required before cutting or stitching');
  o.shipping=nextShipping;o.finance=nextFinance;
  o.status=status;o.staff_note=note;
  if(isShipped(o)&&!o.finance.recognized_at)o.finance.recognized_at=now();
  if(status==='shipped'&&!o.shipped_at)o.shipped_at=now();
  o.completed_at=['delivered','completed'].includes(status)?now():null;
  history(o,req.user.username,'Status changed to '+status.replaceAll('_',' ')+(note?' · '+note:''),'status');
  try{await save();pushOrder(o,'status','Order stage updated');if(isShipped(o))notifyCustomerTracking(o);res.json({order:publicOrder(o)})}catch{err(res,500,'Status could not be saved')}
});
app.patch('/api/orders/:id/shipping',auth,csrf,async(req,res)=>{
  if(req.user.role!=='staff')return err(res,403,'Staff only');
  const o=loadOrder(req,res);if(!o)return;
  const courier=text(req.body&&req.body.courier,100);
  const tracking_id=text(req.body&&req.body.tracking_id,120);
  const tracking_url=safeUrl(req.body&&req.body.tracking_url);
  if(tracking_url===null)return err(res,400,'Tracking URL must start with https://');
  if(!courier&&!tracking_id)return err(res,400,'Enter courier or tracking ID');
  o.shipping={courier,tracking_id,tracking_url,updated_at:now()};
  history(o,req.user.username,'Shipping tracking updated','shipping');
  try{await save();notifyCustomerTracking(o);pushOrder(o,'shipping','Courier tracking updated');res.json({order:publicOrder(o)})}catch{err(res,500,'Shipping details could not be saved')}
});
app.post('/api/orders/:id/return',auth,csrf,async(req,res)=>{
  if(req.user.role!=='customer')return err(res,403,'Customer only');
  const o=loadOrder(req,res);if(!o)return;
  const courier=text(req.body&&req.body.courier,100);
  const tracking_id=text(req.body&&req.body.tracking_id,120);
  const note=text(req.body&&req.body.note,1000);
  if(!tracking_id||!courier)return err(res,400,'Enter return courier and tracking ID');
  o.return_shipping={courier,tracking_id,tracking_url:'',note,updated_at:now()};
  history(o,req.user.username,'Return tracking submitted','return');
  try{await save();pushOrder(o,'return','Return tracking received');res.json({order:publicOrder(o)})}catch{err(res,500,'Return tracking could not be saved')}
});

// Temporary maker image is not business data: never changes orders or Supabase.
// Browser combines photos into one PNG; this route supports Android downloads.
const makerImageTickets=new Map();
function purgeMakerTickets(){
 const time=Date.now();
 for(const [key,entry] of makerImageTickets)if(entry.expires<time)makerImageTickets.delete(key);
 while(makerImageTickets.size>=5)makerImageTickets.delete(makerImageTickets.keys().next().value);
}
app.post('/api/orders/:id/maker-image',auth,csrf,(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 const o=loadOrder(req,res);if(!o)return;
 const raw=req.body?.png;
 if(typeof raw!=='string'||raw.length>14*1024*1024)return err(res,400,'Invalid combined image');
 const match=/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
 if(!match)return err(res,400,'Upload a PNG image');
 const buffer=Buffer.from(match[1],'base64');
 const pngSignature=Buffer.from('89504e470d0a1a0a','hex');
 if(buffer.length<70||buffer.length>10*1024*1024||
    !buffer.subarray(0,8).equals(pngSignature)||
    buffer.toString('ascii',12,16)!=='IHDR'||
    buffer.readUInt32BE(16)!==1200||buffer.readUInt32BE(20)!==1400||
    buffer.readUInt32BE(buffer.length-8)!==0x49454e44)
    return err(res,400,'Invalid collage PNG dimensions or structure');
 purgeMakerTickets();
 const ticket=crypto.randomUUID();
 makerImageTickets.set(ticket,{orderId:o.id,username:req.user.username,bytes:buffer,expires:Date.now()+3*60*1000});
 return res.json({url:'/api/orders/'+o.id+'/maker-image/'+ticket});
});
app.get('/api/orders/:id/maker-image/:ticket',auth,(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 const o=loadOrder(req,res);if(!o)return;
 const ticket=req.params.ticket;
 if(!/^[a-f0-9-]{36}$/.test(ticket))return err(res,404,'Maker image not found');
 const found=makerImageTickets.get(ticket);
 if(!found||found.expires<Date.now()||found.orderId!==o.id||found.username!==req.user.username)
   return err(res,404,'Maker image expired. Tap Download Maker Image again.');
 res.set('Cache-Control','private,no-store');
 res.set('Content-Type','image/png');
 res.set('Content-Disposition','attachment; filename="'+ref(o)+'-MAKER-IMAGE.png"');
 return res.send(found.bytes);
});
app.get('/api/orders/:id/address',auth,async(req,res)=>{
 const order=loadOrder(req,res);if(!order)return;
 // Prefer a customer-confirmed address, otherwise use a best-effort searchable PDF extraction.
 if(typeof order.delivery_address==='string'&&order.delivery_address.trim())
   return res.json({address:order.delivery_address.trim(),source:'confirmed_address',reliable:true});
 if(!order.pdf_file||!/^[a-f0-9-]{36}\.pdf$/.test(order.pdf_file))
   return res.json({address:null,source:'no_pdf',reliable:false});
 const fullPath=path.join(PDF_DIR,order.pdf_file);
 if(!fs.existsSync(fullPath)&&!persistent.enabled)return res.json({address:null,source:'pdf_missing',reliable:false});
 try{
  const pdf=await persistent.retrieveOrLocal(PDF_DIR,order.pdf_file,'pdfs');
  if(!pdf)return res.json({address:null,source:'pdf_missing',reliable:false});
  const parsed=require('./pdf-address.js').extractDeliveryAddress(pdf);
  return res.json(parsed);
 }catch(e){
  console.warn('PDF address extraction unavailable:',e.message);
  return res.json({address:null,source:'unavailable',reliable:false});
 }
});
app.get('/api/orders/:id/pdf',auth,(req,res)=>{
 const o=loadOrder(req,res);if(!o)return;
 return storedAttachment(req,res,PDF_DIR,o.pdf_file,'application/pdf',true);
});
app.get('/api/orders/:id/finished/:index',auth,(req,res)=>{
 const o=loadOrder(req,res);if(!o)return;
 const ix=Number(req.params.index);
 if(!Number.isInteger(ix)||ix<0||ix>9)return err(res,404,'Photo not found');
 const file=o.finished_files?.[ix];
 return storedAttachment(req,res,PHOTO_DIR,file,'image/'+(file?.endsWith('.jpg')?'jpeg':file?.split('.').pop()));
});
app.post('/api/orders/:id/finished',auth,csrf,async(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 const o=loadOrder(req,res);if(!o)return;
 const p=imageData(req.body?.photo);
 if(!p)return err(res,400,'Upload JPG, PNG or WebP under 2.5MB');
 if((o.finished_files||[]).length>=10)return err(res,400,'Maximum 10 finished photos');
 const name=crypto.randomUUID()+'.'+p.ext;
 try {
  fs.writeFileSync(path.join(PHOTO_DIR,name),p.bytes,{flag:'wx'});
  if(persistent.enabled)await persistent.uploadLocalFile(PHOTO_DIR,name,'photos');
  o.finished_files=[...(o.finished_files||[]),name];
  history(o,req.user.username,'Finished-product photo uploaded','photo');
  await save();pushOrder(o,'photo','Finished photo uploaded');
  res.json({order:publicOrder(o)});
 } catch(e) {try{fs.unlinkSync(path.join(PHOTO_DIR,name))}catch{};err(res,500,'Photo save failed')}
});
app.post('/api/orders/:id/request-approval',auth,csrf,async(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 const o=loadOrder(req,res);if(!o)return;
 if(isShipped(o)||o.status==='cancelled')return err(res,400,'Order already closed');
 o.approval={status:'requested',note:text(req.body?.note,1000),updated_at:now(),by:req.user.username};
 o.status='awaiting_approval';
 history(o,req.user.username,'Design approval requested','approval');
 try{await save();pushOrder(o,'approval','Design approval needed');res.json({order:publicOrder(o)})}catch{err(res,500,'Approval save failed')}
});
app.post('/api/orders/:id/approve',auth,csrf,async(req,res)=>{
 if(req.user.role!=='customer')return err(res,403,'Customer only');
 const o=loadOrder(req,res);if(!o)return;
 if(o.approval?.status!=='requested')return err(res,400,'No approval requested');
 const decision=req.body?.decision;
 if(!['approved','changes_requested'].includes(decision))return err(res,400,'Invalid approval decision');
 o.approval={status:decision,note:text(req.body?.note,1000),updated_at:now(),by:req.user.username};
 o.status=decision==='approved'?'confirmed':'pending';
 history(o,req.user.username,decision==='approved'?'Design approved':'Customer requested changes','approval');
 try{await save();pushOrder(o,'approval',decision==='approved'?'Design approved':'Changes requested');res.json({order:publicOrder(o)})}catch{err(res,500,'Approval save failed')}
});
app.patch('/api/orders/:id/finance',auth,csrf,async(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 const o=loadOrder(req,res);if(!o)return;
 const f=normalizeFinance(req.body,o.finance);
 if(!f)return err(res,400,'Enter sale, making, shipping PKR prices and exchange rate PKR/USD');
 if(isShipped(o)&&!f.recognized_at)f.recognized_at=now();
 o.finance=f;
 history(o,req.user.username,'Sale/making/shipping costs updated','finance');
 try{await save();pushOrder(o,'finance','Order pricing updated');res.json({order:publicOrder(o)})}catch{err(res,500,'Pricing save failed')}
});


function financialReport(req){
 const list=orders.filter(o=>canView(req.user,o)&&isShipped(o)).map(financeRow).filter(Boolean)
   .sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
 const keys=['sale_pkr','making_pkr','shipping_pkr','cost_pkr','profit_pkr','sale_usd','making_usd','shipping_usd','cost_usd','profit_usd'];
 const sum=(rows,k)=>Math.round(rows.reduce((n,o)=>n+(Number(o[k])||0),0)*100)/100;
 const totals=Object.fromEntries(keys.map(k=>[k,sum(list,k)]));
 const periods=(type,count)=>{
  const today=new Date(),anchor=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
  if(type==='weekly')anchor.setUTCDate(anchor.getUTCDate()-(anchor.getUTCDay()+6)%7);
  else anchor.setUTCDate(1);
  const series=[];
  for(let i=count-1;i>=0;i--){
   const start=new Date(anchor);
   if(type==='weekly')start.setUTCDate(start.getUTCDate()-i*7);
   else start.setUTCMonth(start.getUTCMonth()-i);
   const end=new Date(start);
   if(type==='weekly')end.setUTCDate(end.getUTCDate()+7);
   else end.setUTCMonth(end.getUTCMonth()+1);
   const group=list.filter(o=>{const d=new Date(o.date);return d>=start&&d<end});
   const row={date:start.toISOString().slice(0,10),
    label:type==='weekly'?start.getUTCDate()+' '+start.toLocaleString('en',{month:'short',timeZone:'UTC'}):start.toLocaleString('en',{month:'short',year:'2-digit',timeZone:'UTC'}),
    orders:group.length};
   for(const k of keys)row[k]=sum(group,k);
   series.push(row);
  }
  let cumulative=0;
  for(const x of series){cumulative=Math.round((cumulative+x.profit_pkr)*100)/100;x.cumulative_profit_pkr=cumulative}
  return series;
 };
 let runningPkr=0,runningUsd=0;
 const rows=list.map(o=>{
  runningPkr=Math.round((runningPkr+o.profit_pkr)*100)/100;
  runningUsd=Math.round((runningUsd+o.profit_usd)*100)/100;
  return {...o,cumulative_profit_pkr:runningPkr,cumulative_profit_usd:runningUsd};
 });
 return {rows,totals,count:rows.length,weekly:periods('weekly',10),monthly:periods('monthly',12),
 disclaimer:'Gross profit = selling price minus making cost minus shipping cost. Excludes marketplace fees, taxes, refunds and other expenses. USD uses each order’s entered PKR/USD rate.'};
}
app.get('/api/finance',auth,(req,res)=>res.json(financialReport(req)));
app.get('/api/finance.csv',auth,(req,res)=>{
 const data=financialReport(req),keys=['reference','title','date','status','courier','tracking_id','sale_pkr','making_pkr','shipping_pkr','cost_pkr','profit_pkr','sale_usd','making_usd','shipping_usd','cost_usd','profit_usd','cumulative_profit_pkr','cumulative_profit_usd','fx_pkr_per_usd'];
 const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 res.set('Content-Type','text/csv; charset=utf-8');
 res.set('Content-Disposition','attachment; filename="FLYXJ-financial-report.csv"');
 res.send([keys.join(','),...data.rows.map(row=>keys.map(k=>cell(row[k])).join(','))].join('\r\n'));
});


const chatVisible=(u,m)=>u.role==='staff'||m.from===u.username||m.to===u.username;
const presentChat=m=>({id:m.id,from:m.from,to:m.to,body:m.body,at:m.at,seen_by:m.seen_by||[],
 photo_url:m.photo_file?'/api/chat/'+m.id+'/photo':null});
const presentPresence=()=>({staff_online:[...trackingClients].some(c=>c.role==='staff'),
 customer_online:[...trackingClients].some(c=>c.role==='customer')});
app.get('/api/chat',auth,(req,res)=>{
 res.json({messages:directChat.filter(m=>chatVisible(req.user,m)).slice(-300).map(presentChat),presence:presentPresence()});
});
app.post('/api/chat',auth,csrf,async(req,res)=>{
 const body=text(req.body?.message,1500);
 const image=req.body?.photo,pic=image?imageData(image):null;
 if((image&&!pic)||(!body&&!pic))return err(res,400,'Enter a message or JPG/PNG/WebP photo under 2.5MB');
 const to=req.user.role==='staff'?users[0].name:users[1].name;
 let file=null;
 try{
  if(pic){
   file=crypto.randomUUID()+'.'+pic.ext;
   fs.writeFileSync(path.join(CHAT_PHOTO_DIR,file),pic.bytes,{flag:'wx'});
   if(persistent.enabled)await persistent.uploadLocalFile(CHAT_PHOTO_DIR,file,'chat-images');
  }
  const msg={id:crypto.randomUUID(),from:req.user.username,to,body,at:now(),photo_file:file,seen_by:[req.user.username]};
  directChat.push(msg);
  if(directChat.length>3000)directChat=directChat.slice(-3000);
  await saveAtomic(CHAT_FILE,directChat);
  const safe=presentChat(msg);
  pushEvent('chat',safe,c=>c.role==='staff'||c.username===msg.from||c.username===msg.to);
  res.status(201).json({message:safe});
 }catch(e){
  if(file)try{fs.unlinkSync(path.join(CHAT_PHOTO_DIR,file))}catch{}
  err(res,500,'Could not send chat message');
 }
});
app.get('/api/chat/:id/photo',auth,(req,res)=>{
 const m=directChat.find(x=>x.id===req.params.id);
 if(!m||!chatVisible(req.user,m)||!m.photo_file)return err(res,404,'Chat photo not found');
 const ext=m.photo_file.split('.').pop();
 return storedAttachment(req,res,CHAT_PHOTO_DIR,m.photo_file,'image/'+(ext==='jpg'?'jpeg':ext));
});
app.post('/api/chat/read',auth,csrf,async(req,res)=>{
 let changes=0;
 for(const m of directChat)if(chatVisible(req.user,m)&&!(m.seen_by||[]).includes(req.user.username)){
  m.seen_by=[...(m.seen_by||[]),req.user.username];changes++;
 }
 if(changes){await saveAtomic(CHAT_FILE,directChat);pushEvent('chat_read',{username:req.user.username},()=>true)}
 res.json({ok:true,marked:changes});
});
app.get('/api/staff',auth,(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 res.json({staff:[{name:users[1].name,active:true},...additionalStaff.map(u=>({name:u.name,active:u.active!==false}))]});
});
app.post('/api/staff',auth,csrf,async(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 const username=text(req.body?.username,30),password=req.body?.password;
 if(!/^[a-zA-Z0-9_-]{3,30}$/.test(username)||typeof password!=='string'||password.length<12||password.length>200)return err(res,400,'Use a 3-30 character username and 12+ character password');
 if([...users,...additionalStaff].some(u=>u.name.toLowerCase()===username.toLowerCase()))return err(res,409,'Username already exists');
 if(additionalStaff.length>=15)return err(res,400,'Staff account limit reached');
 const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(password,salt,32).toString('hex');
 additionalStaff.push({name:username,salt,hash,active:true,created_at:now(),created_by:req.user.username,role:'staff'});
 try{await saveAtomic(STAFF_FILE,additionalStaff);res.status(201).json({username})}catch{err(res,500,'Could not create staff')}
});


app.get('/api/orders/:id/summary.pdf',auth,(req,res)=>{
 const o=loadOrder(req,res);if(!o)return;
 const f=financeRow(o),shipping=o.shipping||{};
 const fmt=(field,currency)=>f?f[field].toFixed(2)+' '+currency:'Not set';
 const lines=[
 'FLYXJ ORDER COST SUMMARY','NOT A TAX INVOICE','',
 'Order: '+ref(o),'Dress: '+o.title,'Customer: '+(o.customer||o.ordered_by),
 'Ordered: '+o.created_at,'Size: '+o.size+'  Colour: '+o.colour+'  Quantity: '+o.quantity,
 'Status: '+o.status,'Courier: '+(shipping.courier||'Not assigned'),
 'Tracking ID: '+(shipping.tracking_id||'Not assigned'),'',
 'Selling price: '+fmt('sale_pkr','PKR'),'Making cost: '+fmt('making_pkr','PKR'),
 'Shipping cost: '+fmt('shipping_pkr','PKR'),'Total cost: '+fmt('cost_pkr','PKR'),
 'Gross profit: '+fmt('profit_pkr','PKR'),'',
 'Selling price: '+fmt('sale_usd','USD'),'Making cost: '+fmt('making_usd','USD'),
 'Shipping cost: '+fmt('shipping_usd','USD'),'Total cost: '+fmt('cost_usd','USD'),
 'Gross profit: '+fmt('profit_usd','USD'),
 'PKR per USD: '+(f?f.fx_pkr_per_usd:'Not set'),'',
 'Gross profit excludes taxes, platform fees and returns.','Created: '+now()
 ];
 res.set('Content-Type','application/pdf');
 res.set('Content-Disposition','attachment; filename="'+ref(o)+'-cost-summary.pdf"');
 res.send(require('./pdf.js')(lines));
});


// Free-hosting backup and recovery. Export sensitive private data only to authenticated staff.
app.get('/api/backup.json',auth,async(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 const collect=async(dir,names,category)=>Promise.all([...new Set(names.filter(Boolean))].map(async name=>{
  try{
   const bytes=await persistent.retrieveOrLocal(dir,name,category);
   return {name,data:bytes?bytes.toString('base64'):null};
  }catch(e){console.warn('Backup missing file:',name);return {name,data:null}}
 }));
 const archive={format:'flyxj-backup-v3',created_at:now(),orders,directChat,
  additionalStaff,photos:await collect(PHOTO_DIR,orders.flatMap(o=>[...(o.image_files||[]),...(o.finished_files||[])]),'photos'),
  pdfs:await collect(PDF_DIR,orders.map(o=>o.pdf_file),'pdfs'),
  chat_photos:await collect(CHAT_PHOTO_DIR,directChat.map(m=>m.photo_file),'chat-images')};
 res.set('Content-Type','application/json');
 res.set('Content-Disposition','attachment; filename="FLYXJ-PRIVATE-backup.json"');
 res.json(archive);
});
app.post('/api/restore',auth,csrf,async(req,res)=>{
 if(req.user.role!=='staff')return err(res,403,'Staff only');
 if(req.get('x-confirm-restore')!=='REPLACE_ALL_DATA')return err(res,400,'Restore requires explicit confirmation');
 const b=req.body;
 if(b?.format!=='flyxj-backup-v3'||!Array.isArray(b.orders)||!Array.isArray(b.directChat)||!Array.isArray(b.additionalStaff)||
 b.orders.length>1500||b.directChat.length>3000||b.additionalStaff.length>15)
  return err(res,400,'Invalid backup');
 for(const key of ['photos','pdfs','chat_photos']){
  if(!Array.isArray(b[key])||b[key].length>12000)return err(res,400,'Invalid backup attachments');
  for(const f of b[key]){
   if(!/^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/.test(f?.name||'')||typeof f.data!=='string'||f.data.length>(f.name.endsWith('.pdf')?Math.ceil(MAX_PDF_BYTES*4/3)+1024:9000000))
    return err(res,400,'Unsafe backup attachment');
  }
 }
 try{
  for(const [key,dir,category] of [['photos',PHOTO_DIR,'photos'],['pdfs',PDF_DIR,'pdfs'],['chat_photos',CHAT_PHOTO_DIR,'chat-images']]){
   for(const file of b[key])if(file.data){
    const bytes=Buffer.from(file.data,'base64');
    fs.writeFileSync(path.join(dir,file.name),bytes);
    if(persistent.enabled)await persistent.upload(category,file.name,bytes);
   }
  }
  orders=b.orders;directChat=b.directChat;additionalStaff=b.additionalStaff;
  await save();await saveAtomic(CHAT_FILE,directChat);await saveAtomic(STAFF_FILE,additionalStaff);
  res.json({ok:true,orders:orders.length,chats:directChat.length});
 }catch(e){console.error('Restore error:',e.message);err(res,500,'Restore incomplete: check backup')}
});

app.use('/assets',(req,res,next)=>{res.set('Cache-Control','no-store, max-age=0');next()});
app.use('/assets',express.static(path.join(__dirname,'assets'),{index:false,maxAge:'5m'}));
app.use('/assets',express.static(path.join(__dirname,'../v2/assets'),{index:false,maxAge:'5m'}));
app.get('/chat',(req,res)=>{res.set('Cache-Control','no-store, max-age=0');res.sendFile(path.join(__dirname,'mobile-chat.html'))});
app.get('/order/:id',(req,res)=>{if(!/^[1-9]\d{0,8}$/.test(req.params.id))return err(res,404,'Invalid order');res.set('Cache-Control','no-store, max-age=0');res.sendFile(path.join(__dirname,'order-sheet.html'))});
app.get('/',(req,res)=>{res.set('Cache-Control','no-store, max-age=0');res.sendFile(path.join(__dirname,'index.html'))});
app.use((req,res)=>err(res,404,'Not found'));
app.use((error,req,res,next)=>{
 if(error?.type==='entity.too.large')return err(res,413,'Upload exceeds server size limit. PDF maximum is 30 MB; reduce photos too.');
 console.error('Request error:',error?.message||String(error));
 return err(res,400,'Invalid upload data. Please retry with a valid PDF.');
});
const PORT=Number(process.env.PORT)||10000;
async function startFlyxj(){
 if(persistent.enabled){
  const status=await persistent.health();
  if(!status.ok)throw Error('Private storage bridge unavailable');
  const [remoteOrders,remoteChat,remoteStaff]=await Promise.all([
   persistent.load('orders'),persistent.load('direct_chat'),persistent.load('staff_accounts')
  ]);
  const localStates={orders,direct_chat:directChat,staff_accounts:additionalStaff};
  const remoteStates={orders:remoteOrders,direct_chat:remoteChat,staff_accounts:remoteStaff};
  for(const [namespace,entries] of Object.entries(remoteStates)){
   if(entries===null){
    if(localStates[namespace].length)throw Error('Local '+namespace+' data needs explicit backup and migration; refusing unsafe startup');
    if(process.env.FLYXJ_ALLOW_EMPTY_BOOTSTRAP!=='1')throw Error('Missing '+namespace+' dataset. Import old backup first.');
    await persistent.save(namespace,[]);
   }else if(!Array.isArray(entries))throw Error('Invalid database state '+namespace);
   else{
    if(namespace==='orders')orders=entries;
    else if(namespace==='direct_chat')directChat=entries;
    else additionalStaff=entries;
   }
  }
  console.log('Supabase persistence ready: orders',orders.length,'chat',directChat.length);
 }
 app.listen(PORT,'0.0.0.0',()=>console.log('FlyXJ dashboard v4 listening on '+PORT));
}
startFlyxj().catch(error=>{console.error('Refusing unsafe FlyXJ startup:',error.message);process.exit(1)});
