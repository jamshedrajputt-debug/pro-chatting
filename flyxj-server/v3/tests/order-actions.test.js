'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const script=fs.readFileSync(path.join(__dirname,'../assets/order-actions.js'),'utf8');
function mount(){
 const html='<html><body><button id="flyxjTrashButton">Recently Deleted</button></body></html>';
 const dom=new JSDOM(html,{url:'https://flyxj-order-manager-free.onrender.com/#orders',pretendToBeVisual:true,runScripts:'outside-only'});
 const d=dom.window.document,requests=[];
 const order={id:23,reference:'FXJ-2026-000023',title:'Custom leather jacket',size:'M',colour:'Black',
  quantity:1,comments:'short arms',priority:'normal',expected_date:'2026-12-15',measurements:{bust:'36 in'},updated_at:'2026-11-22T04:00:00Z',photos:['/api/orders/23/photos/0']};
 dom.window.fetch=async(url,opts={})=>{
  requests.push({url,opts});
  const response=body=>({ok:true,status:200,json:async()=>body});
  if(url==='/api/orders/23')return response({order});
  if(url==='/api/me')return response({username:'usera',role:'customer',csrf:'secure-csrf'});
  if(url==='/api/orders/deleted')return response({orders:[{...order,deleted_at:'2026-11-22T06:00:00Z'}]});
  if(url==='/api/orders/23/edit')return response({order});
  if(url==='/api/orders/23/restore')return response({order});
  if(url==='/api/orders/23')return response({ok:true});
  return {ok:false,status:404,json:async()=>({detail:'Unknown route'})};
 };
 vm.runInContext(script,dom.getInternalVMContext(),{filename:'order-actions.js'});
 return {dom,d,requests,order};
}
test('WhatsApp draft goes only to requested UAE number with protected PDF and photo URLs',()=>{
 const {dom,order}=mount();
 try{
  const url=dom.window.FlyxjOrderActions.link(order);
  assert.match(url,/^https:\/\/wa.me\/971567527192\?text=/);
  const text=decodeURIComponent(url.split('?text=')[1]);
  assert.match(text,/Custom leather jacket/);
  assert.match(text,/Size: M/);
  assert.match(text,/Color: Black/);
  assert.match(text,/api\/orders\/23\/pdf/);
  assert.match(text,/api\/orders\/23\/photos\/0/);
  assert.match(text,/Log in to FlyXJ/);
 }finally{dom.window.close()}
});
test('Order Edit modal appears for either account and contains replacement PDF/photos',async()=>{
 const {dom,d}=mount();
 try{
  await dom.window.FlyxjOrderActions.edit(23);
  assert.match(d.querySelector('.flyxj-action-header').textContent,/Edit order/);
  assert.equal(d.querySelector('input[name=title]').value,'Custom leather jacket');
  assert.equal(d.querySelector('input[name=colour]').value,'Black');
  assert.equal(d.querySelector('input[name=size]').value,'M');
  assert.equal(d.querySelector('input[type=file][multiple]').accept,'image/jpeg,image/png,image/webp');
  assert.equal(d.querySelectorAll('input[type=file]').length,2);
  assert.equal(d.querySelectorAll('button.flyxj-action-danger').length,0);
 }finally{dom.window.close()}
});
test('Delete asks for confirmation before API mutation and deleted orders can be restored',async()=>{
 const {dom,d,requests}=mount();
 try{
  await dom.window.FlyxjOrderActions.delete(23);
  assert.match(d.querySelector('.flyxj-action-header').textContent,/Delete/);
  assert.match(d.querySelector('.flyxj-delete-warning').textContent,/Recently Deleted/);
  assert.equal(requests.filter(x=>x.opts.method==='DELETE').length,0,'No delete on opening dialog');
  const button=d.querySelector('.flyxj-action-danger');
  assert.match(button.textContent,/Recently Deleted/);
  d.querySelector('.flyxj-x').click();
  assert.equal(d.querySelector('.flyxj-action-panel'),null);
  d.getElementById('flyxjTrashButton').click();
  await delay(25);
  assert.match(d.querySelector('.flyxj-trash-row').textContent,/Custom leather jacket/);
  assert.match(d.querySelector('.flyxj-trash-row button').textContent,/Restore/);
 }finally{dom.window.close()}
});
