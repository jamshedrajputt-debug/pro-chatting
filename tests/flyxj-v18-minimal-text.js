'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../flyxj-server/v3');
const batch=fs.readFileSync(path.join(root,'assets/v10-batch-share.js'),'utf8');
const wise=fs.readFileSync(path.join(root,'assets/v11-orderwise-share.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.doesNotThrow(()=>new vm.Script(batch));
assert.doesNotThrow(()=>new vm.Script(wise));
assert.match(html,/flyxj-v18-shorttext-20261128/);
function evaluate(source,name,argument){
 const line=source.split('\n').find(x=>x.includes(name));
 if(!line)throw Error(name+' declaration missing');
 const match=source.match(name==='shareReference'?
  /const shareReference=o=>\{[\s\S]*?\n \};/:name==='summary'?
  /function summary\(items\)\{[\s\S]*?\n \}/:
  /function caption\(o,i,total\)\{[\s\S]*?\n \}/);
 if(!match)throw Error(name+' source missing');
 const code=match[0].replace(/^ const /,'const ')+';'+(name==='summary'?'summary('+JSON.stringify(argument)+')':name==='caption'?'caption('+JSON.stringify(argument)+',1,1)':'shareReference('+JSON.stringify(argument)+')');
 return vm.runInNewContext(code);
}
const order={id:123,reference:'FXJ-2026-000123',created_at:'2026-11-28T01:00:00Z',title:'Jacket',size:'XL',colour:'Black',quantity:4,status:'pending'};
const reference=evaluate(batch,'shareReference',order);
assert.equal(reference,'FXJ-2026-11-000123');
const card={...order,reference};
const text='Reference: FXJ-2026-11-000123\nSize: XL\nColor: Black';
assert.equal(evaluate(batch,'summary',[card]),text);
assert.equal(evaluate(wise,'caption',card),text);
assert.equal(evaluate(batch,'summary',[card,card]),text+'\n\n'+text);
assert.match(server,/getUTCMonth\(\)\+1/,'new order reference includes month');
assert.match(server,/String\(id\)\.padStart\(6,'0'\)/,'new order number padded');
assert.doesNotMatch(evaluate(wise,'caption',card),/Dress:|Product:|Quantity:|Status:|Check SIZE|ORDER 0/);
console.log('PASS V18 FXJ-year-month-number & only 3 WhatsApp text fields; all sharing modes intact');
