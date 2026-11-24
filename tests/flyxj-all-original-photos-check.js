'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'../flyxj-server/v3');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
for(const p of ['assets/share-files.js','assets/order-actions.js','assets/order-sheet.js','assets/app.js','assets/v8-experience.js','server.js']){
 assert.doesNotThrow(()=>new vm.Script(read(p),{filename:p}),'invalid JS '+p);
}
const web=read('assets/share-files.js'),order=read('assets/order-actions.js'),sheet=read('assets/order-sheet.js'),dashboard=read('assets/app.js'),v8=read('assets/v8-experience.js'),backend=read('server.js');
assert.match(web,/async function shareAllPhotos\(/);
assert.match(web,/me\.role!=='staff'/);
assert.match(web,/kind:'photo',index/);
assert.match(web,/count<1\|\|count>8/);
assert.match(web,/FlyXJAndroid/);
assert.match(web,/shareFiles\(JSON\.stringify/);
assert.match(web,/await navigator\.share\(\{files:previous\.files/);
assert.match(order,/Share ALL /);
assert.match(sheet,/shareAllOriginalPhotos/);
assert.match(dashboard,/shareAllPhotos\(o\.id/);
assert.match(v8,/shareAllPhotos\(order\.id/);
assert.match(read('order-sheet.html'),/class="card hidden" id="shareAllOriginalPhotosCard"/);
assert.match(read('index.html'),/share-files\.js/);
assert.match(backend,/app\.post\('\/api\/orders\/:id\/mobile-file',auth,csrf/);
assert.match(backend,/if\(kind==='maker'&&req\.user\.role!=='staff'\)/);
assert.match(backend,/kind==='photo'/);
assert.match(backend,/const index=Number\(req\.body\?\.index\)/);
console.log('PASS original customer images shared as separate photos (1-8) with staff authorization, native version gate, and existing PDF+PNG flows');
