'use strict';
// RD-A02 V402-R source regression contracts; authored, NOT_RUN.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {html,extractFunction}=require('./source-harness.cjs');
test('valid local startup waits for conflict protection before first local drawing render',()=>{
 assert.match(html,/if\(localLast&&!recoveryIncomplete&&!await protectCrossStoreStartup\(\)\)return;render\(\)/);
 const gate=extractFunction('protectCrossStoreStartup');
 assert.match(gate,/crossStoreWriteBlocked=true/);
 assert.match(gate,/await offerDivergentSnapshotBackup\(localRaw,stored,meta,gate\)/);
 assert.ok(gate.indexOf('await offerDivergentSnapshotBackup')<gate.indexOf('crossStoreWriteBlocked=false'));
 assert.match(gate,/return false/);
});
test('blocked storage cannot schedule a save or write the current mirror',()=>{
 for(const name of ['saveAuto','scheduleSave','saveLocal','applyRoomImport','commitPdfPageRecords','mirrorOperation'])assert.match(extractFunction(name),/safeStorage\.crossStoreWriteBlocked/,name);
 assert.match(html,/setItem\(key,value\) \{ if\(safeStorage\.crossStoreWriteBlocked&&key\.startsWith\('rd_'\)\)return false/);
 assert.match(html,/removeItem\(key\) \{ if\(safeStorage\.crossStoreWriteBlocked&&key\.startsWith\('rd_'\)\)return false/);
});
test('conflict review only resolves after confirmed export and fresh recheck',()=>{
 const review=extractFunction('offerDivergentSnapshotBackup');
 assert.match(review,/outcome!==true&&outcome!=='requested'/);
 assert.match(review,/if\(!confirm\(/);
 assert.match(review,/if\(!unchanged\(after\)\|\|keys\.some/);
 assert.ok(review.indexOf('const after=await')<review.indexOf('notice.remove();resolve()'));
 assert.doesNotMatch(review,/safeStorage\.(?:setItem|removeItem)\(/);
});
