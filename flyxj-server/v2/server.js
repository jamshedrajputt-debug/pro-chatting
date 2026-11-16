'use strict';
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'24mb'}));
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
const FILE = path.join(DATA_DIR,'orders.json');
let orders = [];
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
const STATUSES=['pending','confirmed','in_progress','quality_check','shipped','delivered','completed','cancelled'];
const SIZES=['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','CUSTOM'];
const MAX_IMAGES=8,MAX_IMAGE_BYTES=2500000,MAX_TOTAL_BYTES=16000000;
const now=()=>new Date().toISOString();
const err=(res,code,detail)=>res.status(code).json({detail});
const text=(s,max=200)=>typeof s==='string'?s.trim().slice(0,max):'';
const ref=o=>o.reference || ('FXJ-'+String(o.id).padStart(6,'0'));
const canView=(u,o)=>u.role==='staff'||(o.customer||o.ordered_by)===u.username;
const shipDefault=()=>({courier:'',tracking_id:'',tracking_url:'',updated_at:null});
const safeUrl=url=>{const v=text(url,600);if(!v)return '';try{const u=new URL(v);return u.protocol==='https:'?u.toString():null;}catch{return null;}};
function save(){
  const temp=FILE+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(orders));
  fs.renameSync(temp,FILE);
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
  const {image,image_files,images,photos,...rest}=o;
  let count=Array.isArray(image_files)?image_files.length:0;
  if(!count&&typeof image==='string')count=1;
  return {
    ...rest,reference:ref(o),
    customer:o.customer||o.ordered_by||'',
    shipping:o.shipping||shipDefault(),
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

app.get('/api/health',(req,res)=>res.json({ok:true,version:'2.0',storage:'ephemeral',orders:orders.length}));
app.post('/api/login',(req,res)=>{
  const username=text(req.body&&req.body.username,100);
  const password=req.body&&req.body.password;
  if(!username||typeof password!=='string'||password.length>300)return err(res,400,'Enter username and password');
  const key=req.ip||'unknown',recent=loginTries.get(key)||{count:0,since:Date.now()};
  if(Date.now()-recent.since>900000){recent.count=0;recent.since=Date.now();}
  if(recent.count>=20)return err(res,429,'Too many attempts. Try again later.');
  const found=users.find(u=>u.name.toLowerCase()===username.toLowerCase());
  const a=crypto.scryptSync(password,'flyxj-login-check',32);
  const b=crypto.scryptSync(found?found.password:'unknown-invalid-password','flyxj-login-check',32);
  if(!found||!crypto.timingSafeEqual(a,b)){
    recent.count++;loginTries.set(key,recent);
    return err(res,401,'Incorrect username or password');
  }
  loginTries.delete(key);
  const token=crypto.randomBytes(32).toString('hex');
  const session={username:found.name,role:found.role,csrf:crypto.randomBytes(24).toString('hex'),expires:Date.now()+30*86400000};
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
  const client={username:req.user.username,response:res};
  trackingClients.add(client);
  res.write('event: connected\ndata: {"ok":true}\n\n');
  const heartbeat=setInterval(()=>{
    try{res.write(': keep-alive\n\n')}catch{clearInterval(heartbeat);trackingClients.delete(client)}
  },25000);
  res.on('close',()=>{clearInterval(heartbeat);trackingClients.delete(client)});
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
app.get('/api/orders/:id/photos/:index',auth,(req,res)=>{
  const o=loadOrder(req,res);if(!o)return;
  const ix=Number(req.params.index);
  if(!Number.isInteger(ix)||ix<0)return err(res,404,'Photo not found');
  const files=Array.isArray(o.image_files)?o.image_files:[];
  if(files[ix]){
    const filename=files[ix];
    if(!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename))return err(res,404,'Photo not found');
    const abs=path.join(PHOTO_DIR,filename);
    if(!fs.existsSync(abs))return err(res,404,'Photo unavailable');
    return res.sendFile(abs);
  }
  if(ix===0&&typeof o.image==='string'){
    const parsed=imageData(o.image);
    if(!parsed)return err(res,404,'Photo unavailable');
    res.set('Content-Type',parsed.mime);
    return res.send(parsed.bytes);
  }
  return err(res,404,'Photo not found');
});
app.post('/api/orders',auth,csrf,(req,res)=>{
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
  const id=orders.reduce((n,o)=>Math.max(n,Number(o.id)||0),0)+1;
  const created_at=now(),reference='FXJ-'+new Date().getUTCFullYear()+'-'+String(id).padStart(6,'0');
  const image_files=[];
  try {
    for(const p of parsed){
      const filename=crypto.randomUUID()+'.'+p.ext;
      fs.writeFileSync(path.join(PHOTO_DIR,filename),p.bytes,{flag:'wx'});
      image_files.push(filename);
    }
    const o={id,reference,title,colour,size,quantity:qty,comments,status:'pending',
      customer:req.user.username,ordered_by:req.user.username,created_at,updated_at:created_at,
      image_files,shipping:shipDefault(),return_shipping:shipDefault(),messages:[],
      history:[{id:crypto.randomUUID(),at:created_at,by:req.user.username,kind:'created',label:'Order submitted'}]};
    orders.push(o);
    try{save()}catch(ex){orders.pop();throw ex;}
    res.status(201).json({order:publicOrder(o)});
  }catch(ex){
    image_files.forEach(f=>{try{fs.unlinkSync(path.join(PHOTO_DIR,f))}catch{}});
    console.error('Order create failed:',ex.message);
    err(res,500,'Could not save order. Please try again');
  }
});
app.post('/api/orders/:id/messages',auth,csrf,(req,res)=>{
  const o=loadOrder(req,res);if(!o)return;
  const message=text(req.body&&req.body.message,1000);
  if(!message)return err(res,400,'Write a message');
  if(!Array.isArray(o.messages))o.messages=[];
  o.messages.push({id:crypto.randomUUID(),at:now(),by:req.user.username,role:req.user.role,text:message});
  history(o,req.user.username,'New message added','message');
  try{save();res.json({order:publicOrder(o)})}catch{err(res,500,'Message could not be saved')}
});
app.patch('/api/orders/:id/status',auth,csrf,(req,res)=>{
  if(req.user.role!=='staff')return err(res,403,'Staff only');
  const o=loadOrder(req,res);if(!o)return;
  const status=text(req.body&&req.body.status,40),note=text(req.body&&req.body.staff_note,1000);
  if(!STATUSES.includes(status))return err(res,400,'Choose a valid status');
  o.status=status;o.staff_note=note;
  o.completed_at=['delivered','completed'].includes(status)?now():null;
  history(o,req.user.username,'Status changed to '+status.replaceAll('_',' ')+(note?' · '+note:''),'status');
  try{save();res.json({order:publicOrder(o)})}catch{err(res,500,'Status could not be saved')}
});
app.patch('/api/orders/:id/shipping',auth,csrf,(req,res)=>{
  if(req.user.role!=='staff')return err(res,403,'Staff only');
  const o=loadOrder(req,res);if(!o)return;
  const courier=text(req.body&&req.body.courier,100);
  const tracking_id=text(req.body&&req.body.tracking_id,120);
  const tracking_url=safeUrl(req.body&&req.body.tracking_url);
  if(tracking_url===null)return err(res,400,'Tracking URL must start with https://');
  if(!courier&&!tracking_id)return err(res,400,'Enter courier or tracking ID');
  o.shipping={courier,tracking_id,tracking_url,updated_at:now()};
  history(o,req.user.username,'Shipping tracking updated','shipping');
  try{save();notifyCustomerTracking(o);res.json({order:publicOrder(o)})}catch{err(res,500,'Shipping details could not be saved')}
});
app.post('/api/orders/:id/return',auth,csrf,(req,res)=>{
  if(req.user.role!=='customer')return err(res,403,'Customer only');
  const o=loadOrder(req,res);if(!o)return;
  const courier=text(req.body&&req.body.courier,100);
  const tracking_id=text(req.body&&req.body.tracking_id,120);
  const note=text(req.body&&req.body.note,1000);
  if(!tracking_id||!courier)return err(res,400,'Enter return courier and tracking ID');
  o.return_shipping={courier,tracking_id,tracking_url:'',note,updated_at:now()};
  history(o,req.user.username,'Return tracking submitted','return');
  try{save();res.json({order:publicOrder(o)})}catch{err(res,500,'Return tracking could not be saved')}
});
app.use('/assets',express.static(path.join(__dirname,'assets'),{index:false,fallthrough:false,maxAge:'10m'}));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.use((req,res)=>err(res,404,'Not found'));
const PORT=Number(process.env.PORT)||10000;
app.listen(PORT,'0.0.0.0',()=>console.log('FlyXJ dashboard v2 listening on '+PORT));
