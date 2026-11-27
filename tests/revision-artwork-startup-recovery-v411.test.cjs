'use strict';
// V411-R regression scenarios: source authored only; NOT_RUN under audit/regression/POLICY.md.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{IDBFactory}=require('fake-indexeddb');
const {html,extractFunction}=require('./source-harness.cjs');
const A='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const B='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>';
function artworkHarness(){
 const source={face:A,detail:B};
 const ctx=vm.createContext({RoomConnections:{version:'test'},RoomEquipment:{release:'test'},LightingModel:{isSwitch:d=>d.kind==='switch'},effectiveArtwork:d=>d.displayMode==='real'?source.detail:source.face,libraryAsset:()=>null,svgArtwork:raw=>typeof raw==='string'&&raw.startsWith('<svg ')?raw:null});
 vm.runInContext(['pinRevisionSvgArtwork','validateRevisionArtwork','snapshot'].map(extractFunction).join('\n'),ctx);
 return {ctx,source}
}
test('generated panel and implicit catalog art are captured once per unique SVG, independent of later library changes',()=>{
 const {ctx,source}=artworkHarness(),doc={devices:[{id:'a',kind:'switch',displayMode:'code',detailView:{enabled:true}},{id:'b',kind:'equipment'}],cables:[]},before=JSON.stringify(doc);
 const snap=ctx.snapshot(doc);source.face=B;source.detail=A;
 const art=ctx.validateRevisionArtwork(snap);assert.equal(art.assets.length,2);
 assert.equal(art.assets[art.devices[0].face],A);assert.equal(art.assets[art.devices[0].detail],B);assert.equal(art.devices[1].face,art.devices[0].face);
 assert.equal(JSON.stringify(doc),before)
});
test('missing generated face or requested detail and oversized rendered resource fail detached capture',()=>{
 const {ctx,source}=artworkHarness(),doc={devices:[{id:'a',kind:'switch',displayMode:'code',detailView:{enabled:true}}],cables:[]};
 const before=JSON.stringify(doc);source.face=null;assert.throws(()=>ctx.snapshot(doc));source.face=A;source.detail=null;assert.throws(()=>ctx.snapshot(doc));source.detail='<svg '+ 'x'.repeat(250001);assert.throws(()=>ctx.snapshot(doc));assert.equal(JSON.stringify(doc),before)
});
test('historical manifest validation refuses duplicate device rows, missing indices and unsafe art; import validation does not rewrite snapshots',()=>{
 const {ctx}=artworkHarness(),snap=ctx.snapshot({devices:[{id:'a',kind:'equipment'}],cables:[]});
 const clone=()=>JSON.parse(JSON.stringify(snap));
 let bad=clone();bad.historicalArtwork.devices.push(bad.historicalArtwork.devices[0]);assert.throws(()=>ctx.validateRevisionArtwork(bad));
 bad=clone();bad.historicalArtwork.devices[0].face=999;assert.throws(()=>ctx.validateRevisionArtwork(bad));
 bad=clone();bad.historicalArtwork.assets[0]='not SVG';assert.throws(()=>ctx.validateRevisionArtwork(bad));
 const importer=extractFunction('prepareRoomImport');assert.match(importer,/documentData\(structuredClone\(r\.snapshot\)\)/);assert.match(importer,/validateRevisionArtwork\(r\.snapshot\)/);
 const view=extractFunction('showRevisionArtwork');assert.match(view,/svgArtwork\(art\.assets\[c\.index\]\)/);assert.doesNotMatch(view,/effectiveArtwork\(/)
});
function safety(){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','storage-safety.js'),'utf8'),ctx);return ctx.RoomStorageSafety}
const storage=seed=>{const values=new Map(Object.entries(seed));return {values,get length(){return values.size},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null}};
const open=idb=>new Promise((resolve,reject)=>{const r=idb.open('room-designer-recovery',1);r.onupgradeneeded=()=>r.result.createObjectStore('backups');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const put=(db,entries)=>new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite');for(const [k,v] of entries)tx.objectStore('backups').put(v,k);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});
test('read-only recovery does not create a missing database and opens an existing one',async()=>{
 const api=safety(),idb=new IDBFactory();assert.equal(await api.openExistingRecoveryDb(idb),null);assert.equal((await idb.databases()).length,0);
 const db=await open(idb);db.close();const recovered=await api.openExistingRecoveryDb(idb);assert.ok(recovered);recovered.close()
});
test('raw key index loads no local payloads; selected malformed local and mirror values retain exact content',async()=>{
 const api=safety(),idb=new IDBFactory(),db=await open(idb),local=storage({rd_last:'{broken',other:'unrelated'});let reads=0;
 const get=local.getItem;local.getItem=k=>{reads++;return get(k)};
 try{await put(db,[['last','not JSON'],['workspace-checkpoint-history-v406:a',{payload:'archived'}]]);
 const list=await api.listRawRecoveryRecords(local,db);assert.equal(reads,0);
 assert.deepEqual(Array.from(list.records,r=>r.key),['rd_last','last','workspace-checkpoint-history-v406:a']);
 assert.equal((await api.readRawRecoveryRecord(local,db,{store:'local',key:'rd_last'})).value,'{broken');
 assert.equal((await api.readRawRecoveryRecord(local,db,{store:'mirror',key:'last'})).value,'not JSON');
 assert.equal(reads,1);assert.equal(local.values.get('rd_last'),'{broken');
 await assert.rejects(api.readRawRecoveryRecord(local,db,{store:'local',key:'other'}))
 }finally{db.close()}
});
test('partial read is explicit and raw serialization refuses lossy value types',async()=>{
 const api=safety(),local=storage({rd_last:'A'}),list=await api.listRawRecoveryRecords(local,null);
 assert.equal(list.indexedReadFailed,true);assert.equal(list.localReadFailed,false);assert.equal(list.records.length,1);
 assert.equal(JSON.parse(api.serializeRawRecoveryRecord({entry:{value:'{broken'}})).entry.value,'{broken');
 assert.throws(()=>api.serializeRawRecoveryRecord({entry:{value:new Map([['a',1]])}}));
 assert.throws(()=>api.serializeRawRecoveryRecord({entry:{value:undefined}}))
});
test('invalid-last approval binds durable bytes, editor and mirror, and partial read never authorizes replacement',()=>{
 const ctx=vm.createContext({});vm.runInContext(extractFunction('sameInvalidLastEvidence'),ctx);
 const a={local:{rd_last:'{broken',rd_profiles:'[]'},editor:'{}',mirror:{mirror:'A',mirrorMeta:{checksum:'x'}}};
 assert.equal(ctx.sameInvalidLastEvidence(a,JSON.parse(JSON.stringify(a))),true);
 assert.equal(ctx.sameInvalidLastEvidence(a,{...a,local:{...a.local,rd_profiles:'changed'}}),false);
 assert.equal(ctx.sameInvalidLastEvidence(a,{...a,editor:'{"changed":1}'}),false);
 assert.equal(ctx.sameInvalidLastEvidence(a,{...a,mirror:null}),false);
 const exp=extractFunction('exportInvalidLastBundle'),restore=extractFunction('resolveInvalidLast');
 assert.match(exp,/rdLastBackupEvidence=evidence;rdLastBackupConfirmed=true/);
 assert.ok(restore.indexOf('sameInvalidLastEvidence(evidence,await captureInvalidLastEvidence())')<restore.indexOf('saveAuto(true)'))
});
test('denied recovery primary write returns before scheduling any mirror; damaged startup includes independent export',()=>{
 let calls=0;const ctx=vm.createContext({safeStorage:{crossStoreWriteBlocked:false,getItem:()=>null,setItem:()=>{calls++;return false}},recoveryWritesBlocked:false,rdLastBlocked:false,normalizeSvgReferences:()=>{},doc:{devices:[]},manualSaveFailed:false,primarySaveOk:true,persistenceStatus:()=>{}});
 vm.runInContext(extractFunction('saveAuto'),ctx);assert.equal(ctx.saveAuto(true),false);assert.equal(calls,1);
 const ui=extractFunction('attachRawRecoveryAccess');assert.match(ui,/openExistingRecoveryDb/);assert.match(ui,/readRawRecoveryRecord/);assert.doesNotMatch(ui,/\.(?:setItem|removeItem|clear|put)\(/);
 assert.match(extractFunction('protectCrossStoreStartup'),/attachRawRecoveryAccess\(gate\)/);
 assert.match(html,/damagedCritical\.length\)\{safeStorage\.crossStoreWriteBlocked=true;blockStartupForRawRecovery/);
});
