'use strict';
// V405-R regression source; NOT_RUN under repository POLICY.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {html,extractFunction}=require('./source-harness.cjs');
const checksum=raw=>{let n=0;for(const c of raw)n=(n*31+c.charCodeAt(0))>>>0;return String(n)};
function authority(){
 const ctx=vm.createContext({mirrorChecksum:checksum});
 vm.runInContext(['buildMirrorCommitMeta','classifyStorageReceipt'].map(extractFunction).join('\n'),ctx);
 return ctx
}
test('receipt records exact durable primary observations without ranking divergent snapshots',()=>{
 const c=authority(),meta=c.buildMirrorCommitMeta('mirror',4,()=> 'local');
 assert.equal(meta.primaryObservation,'different');assert.equal(meta.primaryObservedRaw,'local');
 assert.equal(c.classifyStorageReceipt('local','mirror',meta),'mirror-committed-with-this-primary');
 assert.equal(c.classifyStorageReceipt('later','mirror',meta),'unresolved');
 assert.equal(c.classifyStorageReceipt('mirror','mirror',meta),'aligned');
 assert.equal(c.classifyStorageReceipt('local','changed',meta),'unverified');
 assert.equal(c.classifyStorageReceipt('local','mirror',{format:2,length:6,checksum:checksum('mirror')}),'legacy-divergent')
});
test('unavailable, absent and oversized primary observations fail conservatively',()=>{
 const c=authority();
 assert.equal(c.buildMirrorCommitMeta('mirror',null,()=>{throw Error('denied')}).primaryObservation,'unreadable');
 const absent=c.buildMirrorCommitMeta('mirror',null,()=>null);
 assert.equal(c.classifyStorageReceipt(null,'mirror',absent),'mirror-committed-without-primary');
 const huge='x'.repeat(3200001),bounded=c.buildMirrorCommitMeta('mirror',null,()=>huge);
 assert.equal('primaryObservedRaw' in bounded,false);assert.equal(c.classifyStorageReceipt(huge,'mirror',bounded),'unresolved')
});
test('receipt and raw mirror use the same IDB transaction and failure aborts it',()=>{
 const code=extractFunction('mirrorOperation');
 assert.match(code,/buildMirrorCommitMeta\(value,snapshotGeneration,\(\)=>window\.localStorage\.getItem\('rd_last'\)\)/);
 assert.match(code,/store\.put\(value,key\)/);assert.match(code,/store\.put\(commitMeta,'last-meta'\)/);
 assert.match(code,/tx\.oncomplete/);assert.match(code,/tx\?\.abort\(\)/);
 const gate=extractFunction('protectCrossStoreStartup');
 assert.ok(gate.indexOf("await preserveMirrorForMigration(snapshot,'valid-conflict-before-review')")<gate.indexOf('await offerDivergentSnapshotBackup'));
 assert.match(gate,/classifyStorageReceipt/);
});
function decoder(){
 const ctx=vm.createContext({mirrorChecksum:checksum,validateRoomDocument:d=>{if(!Array.isArray(d?.devices)||!Array.isArray(d?.cables))throw Error('bad drawing');return d}});
 vm.runInContext(extractFunction('decodeArchiveRestore'),ctx);return ctx.decodeArchiveRestore
}
test('archive decoder preserves current raw drawing and historical local resources; rejects malformed/checksum-invalid inputs',()=>{
 const decode=decoder(),raw=JSON.stringify({id:'a',devices:[],cables:[]});
 const local={store:'local',raw:JSON.stringify({format:1,values:{rd_last:raw,rd_types:'{}',rd_catalog:'[]',rd_svg_drafts:'{"assets":{}}'}})};
 assert.equal(decode(local).drawing.id,'a');assert.equal(decode(local).hasHistoricalResources,true);
 const meta={length:raw.length,checksum:checksum(raw)};
 assert.equal(decode({store:'mirror',value:{mirror:raw,mirrorMeta:meta}}).drawing.id,'a');
 assert.throws(()=>decode({store:'mirror',value:{mirror:raw,mirrorMeta:{...meta,checksum:'wrong'}}}));
 assert.throws(()=>decode({store:'local',raw:'{"format":1,"values":{}}'}));
});
test('controlled restore is journaled only after verified external backup and fresh local/mirror checks',()=>{
 const code=extractFunction('restoreSelectedArchive');
 assert.ok(code.indexOf('prepareRoomImport(input)')<code.indexOf('await file('));
 assert.ok(code.indexOf('await file(')<code.indexOf('applyRoomImport(candidate)'));
 assert.match(code,/outcome!==true&&outcome!=='requested'/);
 assert.match(code,/sameMirrorPair\(snapshot,current\)/);
 assert.match(code,/sameMirrorPair\(current,finalMirror\)/);
 assert.match(code,/archiveRestoreStateUnchanged\(state\)/);
 assert.match(code,/await preserveMirrorForMigration\(current,'before-controlled-restore'\)/);
 assert.match(code,/candidate\.doc\.id=uid\(\)/);
 assert.doesNotMatch(code,/safeStorage\.(?:setItem|removeItem)\(/);
 assert.match(extractFunction('archiveRestoreStateUnchanged'),/window\.localStorage\.getItem/);
 assert.match(extractFunction('offerMigrationArchive'),/migrationArchiveRestore/);
});

function restoreHarness({download=true,answer=true,changed=false,archived=true}={}){
 const calls=[],drawing={id:'archived',name:'Room',devices:[],cables:[]},candidate={doc:{...drawing},legacyCleaned:false};
 const snapshot={mirror:'original',mirrorMeta:{length:8}},state={queue:Promise.resolve(),raw:'{}',typesRaw:'{}',catalogRaw:'[]',draftsRaw:'{}',local:{}};
 let reads=0,confirms=0;
 const ctx=vm.createContext({
  captureArchiveRestoreState:()=>state,archiveRestoreStateUnchanged:()=>true,archiveEntryUnchanged:async()=>true,
  readMirrorSnapshot:async()=>{reads++;return changed&&reads>1?{mirror:'changed',mirrorMeta:{length:7}}:snapshot},
  decodeArchiveRestore:()=>({drawing,hasHistoricalResources:true}),archiveRestoreEnvelope:()=>({}),prepareRoomImport:()=>candidate,
  confirm:()=>++confirms===1?true:answer,packRecoveryDrawing:()=>({doc:{},assets:{svg:[]}}),libraryAsset:()=>null,
  file:async()=>{calls.push('backup');return download},sameMirrorPair:(a,b)=>a.mirror===b.mirror,
  preserveMirrorForMigration:async()=>{calls.push('archive');return archived},
  uid:()=> 'new-id',applyRoomImport:c=>calls.push(['apply',c.doc.id,c.doc.name]),notify:m=>calls.push(['notice',m])
 });
 vm.runInContext(extractFunction('restoreSelectedArchive'),ctx);
 return {ctx,calls,entry:{store:'local',key:'archive'}}
}
test('cancelled backup or declined retention never invokes the importer',async()=>{
 for(const opts of [{download:false},{answer:false}]){
  const h=restoreHarness(opts);await h.ctx.restoreSelectedArchive(h.entry);
  assert.deepEqual(h.calls,['backup'])
 }
});
test('changed mirror or failed durable archive prevents restore after backup',async()=>{
 for(const opts of [{changed:true},{archived:false}]){
  const h=restoreHarness(opts);await h.ctx.restoreSelectedArchive(h.entry);
  assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==='apply'),false);
  assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==='notice'),true)
 }
});
test('confirmed stable restore uses a new document identity and preserves prior mirror before import',async()=>{
 const h=restoreHarness();await h.ctx.restoreSelectedArchive(h.entry);
 assert.deepEqual(h.calls,['backup','archive',['apply','new-id','Room — بازیابی']])
});
