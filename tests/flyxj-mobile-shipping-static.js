'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../flyxj-server/v3'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
for(const p of ['server.js','assets/app.js','assets/v8-experience.js','assets/mobile-staff-controls.js','assets/order-extra.js','assets/order-sheet.js'])
 assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}),'bad JS: '+p);
const html=read('order-sheet.html'),js=read('assets/mobile-staff-controls.js'),app=read('assets/app.js'),server=read('server.js');
for(const id of ['fx9ShipForm','fx9FinanceForm','fx9StatusForm','fx9EarningForm','fx9ShipmentSummary'])assert.ok(html.includes('id="'+id+'"'));
assert.match(html,/mobile-staff-controls.js/);
assert.match(js,/user.role==='staff'/);assert.match(js,/user.role==='customer'/);
assert.match(js,/\/shipping'/);assert.match(js,/\/finance'/);assert.match(js,/\/status'/);
assert.match(app,/statShippedPieces/);
assert.match(read('assets/v8-experience.js'),/Log out securely/);
assert.match(server,/shipped_units/);assert.match(server,/shipped_quantity/);
assert.match(server,/Gross profit = selling price minus making cost, shipping cost and User A earning/);
console.log('PASS mobile order sheet, logout and finance integration syntax');
