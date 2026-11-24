'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../flyxj-server/v3'),read=x=>fs.readFileSync(path.join(root,x),'utf8');
for(const p of ['server.js','assets/app.js','assets/v8-experience.js','assets/mobile-staff-controls.js','assets/order-extra.js','assets/order-sheet.js'])
 assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}),'bad JS: '+p);
const html=read('order-sheet.html'),js=read('assets/mobile-staff-controls.js'),app=read('assets/app.js'),server=read('server.js');
for(const id of ['fx9ShipForm','fx9FinanceForm','fx9StatusForm','fx9EarningForm','fx9ShipmentSummary'])assert.ok(html.includes('id="'+id+'"'));
assert.match(html,/mobile-staff-controls.js/);
assert.match(js,/user.role==='staff'/);assert.match(js,/earningMoney=FlyxjCurrency.connect/);
assert.match(js,/\/shipping'/);assert.match(js,/\/finance'/);assert.match(js,/\/status'/);
assert.match(app,/statShippedPieces/);
assert.match(read('assets/v8-experience.js'),/Log out securely/);
assert.match(server,/shipped_units/);assert.match(server,/shipped_quantity/);
assert.match(server,/Real profit = User A net earning after Etsy fees/);
assert.match(server,/all_rows:allRows/);
assert.match(server,/pending_count:pendingCount/);
console.log('PASS mobile order sheet, logout and finance integration syntax');

assert.doesNotThrow(()=>new vm.Script(read('assets/flyxj-money-inputs.js')));
assert.doesNotThrow(()=>new vm.Script(read('assets/flyxj-money-dashboard.js')));
assert.ok(!html.includes('name="sale_pkr"'), 'No selling price input on Android');
assert.ok(!read('index.html').includes('id="salePkr"'), 'No selling price input on desktop');
