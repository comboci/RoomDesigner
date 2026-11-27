'use strict';
// Authored source-only scenarios. NOT_RUN under audit/regression/POLICY.md.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{IDBFactory}=require('fake-indexeddb');
const {html,extractFunction}=require('./source-harness.cjs');
const A='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const B='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>';
function pinHarness(){
 const assets={shared:A,original:B};
 const ctx=vm.createContext({libraryAsset:id=>assets[id],effectiveArtwork:d=>d.svg||assets[d.svgAssetId]||null,LightingModel:{isSwitch:()=>false},svgArtwork:raw=>typeof raw==='string'&&raw.startsWith('<svg ')?raw:null,RoomEquipment:{release:'current'},RoomConnections:{version:'current'},structuredClone});
 vm.runInContext(['pinRevisionSvgArtwork','snapshot','roomSvgReferenceIds'].map(extractFunction).join('\n'),ctx);
 return {ctx,assets};
}
test('new Revision captures both explicit artwork versions without mutating the active drawing',()=>{
 const {ctx,assets}=pinHarness(),doc={devices:[{id:'d',svgAssetId:'shared',svgOriginalAssetId:'original'}],cables:[],walls:[]},before=JSON.stringify(doc);
 const snap=ctx.snapshot(doc);assets.shared=B;assets.original=A;
 assert.equal(snap.devices[0].svg,A);assert.equal(snap.devices[0].svgOriginal,B);assert.equal(JSON.stringify(doc),before);
 assert.equal(snap.devices[0].svgAssetId,'shared');
 assert.equal(ctx.roomSvgReferenceIds({devices:[],revisions:[{snapshot:snap}]}).size,0);
});
test('authoritative inline art is kept even if its stale ID points elsewhere',()=>{
 const {ctx}=pinHarness(),record={devices:[{id:'d',svg:B,svgAssetId:'shared'}]};
 assert.equal(ctx.pinRevisionSvgArtwork(record).devices[0].svg,B);
});
test('invalid, absent and individually oversized explicit assets refuse a new snapshot',()=>{
 const {ctx,assets}=pinHarness(),doc={devices:[{id:'d',svgAssetId:'missing'}],cables:[]},before=JSON.stringify(doc);
 assert.throws(()=>ctx.snapshot(doc));assert.equal(JSON.stringify(doc),before);
 assets.missing='<svg '+ 'x'.repeat(250001);assert.throws(()=>ctx.snapshot(doc));assert.equal(JSON.stringify(doc),before);
});
test('aggregate pinned-art budget refuses excess rather than deleting older history',()=>{
 const {ctx,assets}=pinHarness();assets.shared='<svg '+ 'x'.repeat(240000);
 const doc={devices:Array.from({length:14},(_,i)=>({id:String(i),svgAssetId:'shared'})),cables:[],revisions:[{number:1,snapshot:{devices:[],cables:[]}}]};
 const before=JSON.stringify(doc);assert.throws(()=>ctx.snapshot(doc));assert.equal(JSON.stringify(doc),before);
});
test('import keeps historical inline SVG while separately remapping only effective ID references',()=>{
 const normalize=extractFunction('normalizeSvgReferences'),remap=extractFunction('stagePortableRoomSvg');
 assert.match(normalize,/key!=='revisions'/);assert.doesNotMatch(normalize,/!persist\|\|key!=='revisions'/);
 assert.match(remap,/item\?\.\[inline\].*includes\('<svg'\)/);
});
test('Revision candidate, exact freshness and capacity checks precede publishing live doc or journal',()=>{
 const save=extractFunction('saveLocal');
 assert.match(save,/JSON\.stringify\(doc\)!==beforeRaw/);assert.match(save,/svgLibrary!==beforeLibrary/);
 assert.ok(save.indexOf('snap=snapshot(nextDoc)')<save.indexOf('doc=nextDoc;'));
 assert.ok(save.indexOf('JSON.stringify(nextDoc).length>12000000')<save.indexOf('doc=nextDoc;'));
 assert.ok(save.indexOf('doc=nextDoc;')<save.indexOf("safeStorage.setItem('rd_pending_revision'"));
 assert.match(save,/Revision ذخیره شد، اما ساخت خروجی NRD ناموفق بود/);
});
const open=()=>new Promise((resolve,reject)=>{const req=new IDBFactory().open('v410-archive',1);req.onupgradeneeded=()=>req.result.createObjectStore('backups');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
const put=(db,entries)=>new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite');for(const [k,v] of entries)tx.objectStore('backups').put(v,k);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
test('workspace key listing and bounded history read preserve selected historical payloads',async()=>{
 const db=await open();try{
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','storage-safety.js'),'utf8'),ctx);
  const api=ctx.RoomStorageSafety,key='workspace-checkpoint-history-v406:one';
  await put(db,[[key,{payload:'A'.repeat(200)}],['unrelated','large unrelated value']]);
  assert.deepEqual(Array.from(await api.readWorkspaceHistory(db,0,true)),[key]);await assert.rejects(api.readWorkspaceHistory(db,1));
  assert.equal((await api.readWorkspaceHistoryEntry(db,key)).payload.length,200);
  assert.equal((await api.readWorkspaceHistory(db,1000)).length,1);
 }finally{db.close()}
});
test('mirror archive listing and individual access survive bulk cap; raw export is available without decoding',async()=>{
 const db=await open();try{
  const key='pre-migration-v404:1';await put(db,[[key,{mirror:'invalid archived data'}],['last','current']]);
  const ctx=vm.createContext({mirrorDb:Promise.resolve(db),mirrorOperation:async(_mode,_value,k)=>new Promise((resolve,reject)=>{const tx=db.transaction('backups','readonly'),r=tx.objectStore('backups').get(k);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})});
  vm.runInContext(['mirrorMigrationArchiveKey','readMirrorMigrationArchives','readMirrorMigrationArchiveKeys','readSelectedMigrationArchive'].map(extractFunction).join('\n'),ctx);
  assert.equal(await ctx.readMirrorMigrationArchives(1),null);assert.deepEqual(Array.from(await ctx.readMirrorMigrationArchiveKeys()),[key]);
  assert.equal((await ctx.readSelectedMigrationArchive({key,store:'mirror'})).value.mirror,'invalid archived data');
  const ui=extractFunction('showArchiveRestore');assert.match(ui,/readMirrorMigrationArchiveKeys\(\)/);assert.match(ui,/roomdesigner-migration-archive-raw\/v1/);
  assert.doesNotMatch(ui,/await readMirrorMigrationArchives\(/);
 }finally{db.close()}
});
