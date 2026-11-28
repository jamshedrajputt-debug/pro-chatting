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
assert.match(html,/v17-exact-only-20261128/,'Android WebView and web load exact-image-only script');
assert.match(batch,/Share Exact Image/,'only one main Share Exact Image entry');
assert.ok(batch.includes('window.FlyxjOrderWise?.open?.()'),'single button opens exact image flow');
assert.ok(order.includes('window.FlyxjOrderWise={open}'),'modern image dialog is exposed');
assert.doesNotMatch(order,/fx16-advanced|openLegacy|Original Images \\(WhatsApp may mix\\)|Share ALL Orders Together/,'old share modes no longer visible');
assert.match(order,/ordered-share-image/,'only exact image share route used');
assert.ok(order.includes('body.append(rows,buttons,preview,status)'),'simple share dialog layout');
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
assert.match(css,/fx16-insights/,'dashboard styling retained');
assert.match(html,/id="financePanel"/);
assert.match(html,/id="teamPanel"/);
assert.match(html,/id="ordersContent"/);
assert.match(html,/id="notificationButton"/);
console.log('PASS V17 exact-image-only share, one bell and Sync, dashboard, finance/tracking/backup retained');
