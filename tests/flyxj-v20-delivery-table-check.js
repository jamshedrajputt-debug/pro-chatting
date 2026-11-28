'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../flyxj-server/v3');
const ui=fs.readFileSync(path.join(root,'index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/v20-delivery-table.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
assert.doesNotThrow(()=>new vm.Script(app),'app JavaScript parses on web and Android WebView');
assert.match(ui,/<th>ORDER \/ DRESS<\/th><th>DELIVERY DATE<\/th><th>ORDER DATE<\/th><th>STATUS<\/th><th>TRACKING<\/th>/);
assert.doesNotMatch(ui,/<th>CUSTOMER<\/th>/,'customer username column removed');
assert.match(app,/o\.expected_date/,'uses customer-entered delivery date');
assert.match(app,/const delivery=node\('td','fx20-delivery-cell'\)/);
assert.match(app,/tr\.append\(first,delivery,date,st,tracking,arrow\)/,'delivery column is rendered in former customer position');
assert.doesNotMatch(app,/const customer=node\('td','',moneyless\(o\.customer\)\)/);
assert.match(app,/new Intl\.DateTimeFormat\('en-GB',\{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'\}\)/);
assert.match(app,/fx20-delivery-unset','missing dates shown honestly');
assert.match(app,/getUTCFullYear\(\)===dateParts\[0\]/,'invalid dates rejected');
assert.match(app,/fx20-delivery-overdue/,'overdue delivery highlighted');
assert.match(server,/expected_date:o\.expected_date\|\|''/,'server preserves delivery date in order payload');
assert.match(css,/fx20-delivery-badge/);
assert.match(css,/@media\(max-width:600px\)/);
assert.match(ui,/\/assets\/v20-delivery-table\.css\?v=flyxj-v20/,'premium style included');
assert.match(ui,/\/assets\/app\.js\?v=flyxj-v20-delivery/,'fresh WebView and browser JS');
for(const required of ['id="orderRows"','id="financePanel"','id="teamPanel"','id="notificationButton"','id="exportBackup"','id="messageForm"']){
 assert.ok(ui.includes(required),'kept critical UI '+required);
}
console.log('PASS V20 User A actual delivery date instead of customer names; luxury responsive web/Android table; features preserved');
