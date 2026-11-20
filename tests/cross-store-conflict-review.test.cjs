'use strict';
// N8 cross-store conflict discovery: authored source regressions, NOT_RUN per POLICY.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extractFunction}=require('./source-harness.cjs');
const checksum=raw=>String(raw.length).padStart(8,'0');
function classify(){
 const ctx=vm.createContext({
  mirrorChecksum:checksum,
  validateRoomDocument:doc=>{
   if(!doc||!Array.isArray(doc.devices)||!Array.isArray(doc.cables))throw Error('invalid document');
   return doc;
  }
 });
 vm.runInContext(extractFunction('divergentValidSnapshots'),ctx);
 return ctx.divergentValidSnapshots;
}
const local=JSON.stringify({id:'local',devices:[],cables:[]});
const mirror=JSON.stringify({id:'mirror',devices:[],cables:[]});
const meta={length:mirror.length,checksum:checksum(mirror)};
test('different valid snapshots with intact mirror metadata require manual review',()=>{
 assert.equal(classify()(local,mirror,meta),true);
});
test('identical, invalid or checksum-mismatched mirror does not trigger valid-divergence notice',()=>{
 const detect=classify();
 assert.equal(detect(local,local,{length:local.length,checksum:checksum(local)}),false);
 assert.equal(detect(local,'{"not":"drawing"}',null),false);
 assert.equal(detect(local,mirror,{length:mirror.length,checksum:'bad'}),false);
 assert.equal(detect(null,mirror,meta),false);
});
test('conflict export is explicit, checks storage freshness and never modifies either store',()=>{
 const index=fs.readFileSync('index.html','utf8');
 const logic=extractFunction('offerDivergentSnapshotBackup');
 assert.match(index,/divergentValidSnapshots\(localRaw,stored,meta\)/);
 assert.match(logic,/await mirrorQueue/);
 assert.match(logic,/safeStorage\.getItem\('rd_last'\)!==localRaw/);
 assert.match(logic,/await file\(/);
 assert.doesNotMatch(logic,/safeStorage\.(?:setItem|removeItem)\(/);
 assert.doesNotMatch(logic,/mirrorOperation\('readwrite'/);
});
