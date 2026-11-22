'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const directory=path.join(__dirname,'..');
test('User B gets one real PNG collage: four images, Size and Color drawn onto same canvas',async()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://flyxj.test/order/42',runScripts:'outside-only'});
 const w=dom.window,d=w.document,draws=[],labels=[],opened=[],calls=[];
 const create=d.createElement.bind(d);
 d.createElement=function(tag){
  if(tag!=='canvas'){
   const element=create(tag);
   if(tag==='a')element.click=function(){opened.push({url:element.href,name:element.download})};
   return element;
  }
  const ctx={
   fillStyle:'',strokeStyle:'',lineWidth:1,font:'',
   fillRect:(...args)=>draws.push({type:'fillRect',args}),
   strokeRect:(...args)=>draws.push({type:'strokeRect',args}),
   drawImage:(image,...args)=>draws.push({type:'drawImage',url:image.src,args}),
   fillText:(text,...args)=>labels.push({text,args}),
   measureText:txt=>({width:txt.length*25}),
   beginPath(){},moveTo(){},lineTo(){},stroke(){}
  };
  return {width:0,height:0,getContext:()=>ctx,toDataURL:()=>('data:image/png;base64,'+Buffer.from('mock png').toString('base64'))};
 };
 w.Image=class MockImage{
  naturalWidth=800;naturalHeight=600;
  set src(url){this._src=url;Promise.resolve().then(()=>this.onload&&this.onload())}
  get src(){return this._src}
 };
 w.fetch=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,json:async()=>({url:'/api/orders/42/maker-image/11111111-1111-4111-8111-111111111111'})};
 };
 vm.runInContext(fs.readFileSync(path.join(directory,'assets/maker-collage.js'),'utf8'),dom.getInternalVMContext(),{filename:'maker-collage.js'});
 try{
  const order={id:42,reference:'FXJ-42',size:'M',colour:'Black',photos:['/photo/1','/photo/2','/photo/3','/photo/4']};
  const png=await w.FlyxjMakerCollage.render(order);
  assert.match(png,/^data:image\/png;base64,/);
  assert.deepEqual(draws.filter(x=>x.type==='drawImage').map(x=>x.url),order.photos,'all four photos are in one canvas');
  assert.equal(draws.filter(x=>x.type==='drawImage').length,4);
  assert.ok(labels.some(x=>x.text==='M'),'size text is drawn inside PNG');
  assert.ok(labels.some(x=>x.text==='Black'),'color text is drawn inside PNG');
  assert.ok(labels.some(x=>x.text==='SIZE'));
  assert.ok(labels.some(x=>x.text==='COLOR'));
  const squares=draws.filter(x=>x.type==='drawImage').map(x=>[x.args[0],x.args[1]]);
  assert.equal(new Set(squares.map(x=>x[0])).size,2,'two grid columns');
  assert.equal(new Set(squares.map(x=>x[1])).size,2,'two grid rows');
  await w.FlyxjMakerCollage.download(order,'staff-csrf');
  assert.equal(calls.length,1,'one API request after image created');
  assert.equal(calls[0].url,'/api/orders/42/maker-image');
  assert.equal(calls[0].opts.headers['x-csrf-token'],'staff-csrf');
  assert.equal(calls[0].opts.method,'POST');
  assert.equal(JSON.parse(calls[0].opts.body).png,png);
  assert.equal(opened.length,1,'only one image file downloaded');
  assert.match(opened[0].url,/maker-image\/11111111/);
  assert.match(opened[0].name,/MAKER\.png$/);
 }finally{w.close()}
});
