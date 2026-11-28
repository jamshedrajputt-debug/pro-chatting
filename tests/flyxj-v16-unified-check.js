'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../flyxj-server/v3');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const html=read('index.html'),batch=read('assets/v10-batch-share.js'),
order=read('assets/v11-orderwise-share.js'),v6=read('assets/v6-professional.js'),
pro=read('assets/v13-command-center.js'),legacy=read('assets/init-extra.js'),
v8=read('assets/v8-experience.js'),app=read('assets/app.js'),
notify=read('assets/two-way-notifications.js'),css=read('assets/v13-command-center.css');
for(const [name,s] of Object.entries({batch,order,v6,pro,legacy,v8,app,notify}))
 assert.doesNotThrow(()=>new vm.Script(s),name+' valid JavaScript');
assert.match(html,/v16-unified-20261128/,'Android WebView and web load new scripts');
assert.match(batch,/Share Orders/,'one main share entry');
assert.match(batch,/window\.FlyxjOrderWise\?\.open/,'main entry opens ordered sharing');
assert.match(order,/window\.FlyxjOrderWise=\{open\}/,'modern dialog is exposed');
assert.doesNotMatch(order,/actions\.append\(btn\)/,'second toolbar share button is not mounted');
assert.match(order,/node\('details','fx16-advanced'\)/,'old share modes in advanced');
assert.match(order,/bulkActions\.append\(exact,download\)/,'exact image default');
assert.match(order,/advancedBody\.append\(shareAll,quick,oneByOne\)/,'all legacy share modes retained');
assert.match(batch,/openLegacy:show/,'numbered and text sharing remain reachable');
assert.match(order,/ordered-share-image/,'exact image remains main format');
assert.match(legacy,/\$\('notificationButton'\)\.onclick=\(\)=>window\.FlyxjNotifications\?\.inbox\(\)/,'one bell opens authenticated inbox');
assert.doesNotMatch(v6,/function notificationCenter/,'duplicate V6 notification panel removed');
assert.doesNotMatch(app,/window\.flyxjV6Notify/,'no double event notification');
assert.match(notify,/window\.FlyxjNotifications=\{attach,clear,show,permission,inbox,poll/,'notification API unchanged');
assert.doesNotMatch(pro,/button\('♧ Notifications'/,'duplicate dashboard notification action removed');
assert.doesNotMatch(pro,/button\('↻ Sync now'/,'duplicate dashboard refresh removed');
assert.doesNotMatch(v8,/\['Refresh orders'/,'duplicate mobile refresh removed');
assert.match(html,/id="refreshButton"[^>]*>.*Sync<\/button>/,'one global sync button');
assert.match(app,/window\.FlyxjNotifications\?\.poll\(\)/,'sync includes notification polling');
assert.match(v6,/n\('details','v6-operations fx16-insights'\)/,'secondary metrics collapsed by default');
assert.doesNotMatch(pro,/fx13-metrics/,'repeated command-center metrics removed');
assert.match(css,/fx16-insights-toggle/,'collapsed insights styled');
assert.match(css,/fx16-advanced/,'advanced sharing styled');
assert.match(html,/id="financePanel"/);
assert.match(html,/id="teamPanel"/);
assert.match(html,/id="ordersContent"/);
assert.match(html,/id="notificationButton"/);
console.log('PASS V16 one Share Orders, advanced modes preserved, one bell and Sync, unique dashboard, finance/tracking/backup retained');
