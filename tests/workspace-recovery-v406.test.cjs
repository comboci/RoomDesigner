'use strict';
// V406-R source regression scenarios, NOT_RUN under repository POLICY.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{IDBFactory}=require('fake-indexeddb');
const {html,extractFunction}=require('./source-harness.cjs');
function harness(){
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../storage-safety.js'),'utf8'),ctx);
 return ctx.RoomStorageSafety
}
function store(seed={}){
 const data=new Map(Object.entries(seed));
 return {data,get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}
}
const dbOpen=()=>new Promise((resolve,reject)=>{const idb=new IDBFactory(),req=idb.open('workspace-test',1);req.onupgradeneeded=()=>req.result.createObjectStore('backups');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
function values(api,extra={}){return Object.assign(Object.fromEntries(Array.from(api.workspaceKeys,k=>[k,null])),extra)}
function record(api,id,extra={}){return api.makeWorkspaceRecord(values(api,extra),id,'2026-11-26T00:00:00Z')}
async function seedMirror(db,raw){return new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite');tx.objectStore('backups').put(raw,'last');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})}
test('canonical record enforces explicit keys, size and checksum; no unknown or malformed fields',()=>{
 const api=harness(),r=record(api,'a',{rd_last:'A'});
 assert.equal(api.validateWorkspaceRecord(r).values.rd_last,'A');
 assert.throws(()=>api.validateWorkspaceRecord({...r,checksum:'bad'}));
 assert.throws(()=>api.makeWorkspaceRecord({...r.values,rd_other:'X'},'other'));
 assert.throws(()=>api.makeWorkspaceRecord({...r.values,rd_last:'x'.repeat(api.workspaceCharLimit+1)},'large'));
 assert.throws(()=>api.captureWorkspace(store({rd_pending_import:'journal'})));
});
test('checkpoint only commits against matching mirror and exact prior authority',async()=>{
 const api=harness(),db=await dbOpen(),a=record(api,'a',{rd_last:'A'});
 await seedMirror(db,'A');
 const expected=await api.readWorkspaceAuthority(db);
 await api.writeWorkspaceCheckpoint(db,a,expected);
 assert.equal((await api.readWorkspaceAuthority(db)).checkpoint.id,'a');
 await seedMirror(db,'B');
 await assert.rejects(api.writeWorkspaceCheckpoint(db,record(api,'b',{rd_last:'B'}),expected));
 const latest=await api.readWorkspaceAuthority(db);
 await api.writeWorkspaceCheckpoint(db,record(api,'b',{rd_last:'B'}),latest);
 assert.equal((await api.readWorkspaceAuthority(db)).checkpoint.id,'b');
 assert.equal((await api.readWorkspaceHistory(db,0,true)).length,1);db.close()
});
test('interrupted projection resumes before final authoritative commit; original values retained',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A',rd_profiles:'old',rd_unrelated:'untouched'});
 await seedMirror(db,'A');
 const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B',rd_profiles:'new'});
 const expected=await api.readWorkspaceAuthority(db),intent=await api.stageWorkspaceRestore(db,before,target,expected,'restore1');
 // Simulate crash after one allowed local write, before final commit.
 s.setItem(api.workspaceMarker,intent.id);s.setItem('rd_last','B');
 assert.equal(await api.resumeWorkspaceRestore(db,s),true);
 assert.equal(s.getItem('rd_profiles'),'new');assert.equal(s.getItem('rd_unrelated'),'untouched');assert.equal(s.getItem(api.workspaceMarker),null);
 const final=await api.readWorkspaceAuthority(db);
 assert.equal(final.mirror,'B');assert.equal(final.checkpoint.id,'target');assert.equal(final.intent,null);
 const history=await api.readWorkspaceHistory(db);assert.equal(history.length,1);assert.equal(history[0].value.before.values.rd_last,'A');db.close()
});
test('unexpected third state blocks replay without touching data',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A',rd_profiles:'old'});
 await seedMirror(db,'A');const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B',rd_profiles:'new'});
 await api.stageWorkspaceRestore(db,before,target,await api.readWorkspaceAuthority(db),'restore2');
 s.setItem('rd_profiles','third');
 await assert.rejects(api.resumeWorkspaceRestore(db,s),/تغییر/);
 assert.equal(s.getItem('rd_last'),'A');assert.equal(s.getItem('rd_profiles'),'third');assert.ok((await api.readWorkspaceControl(db)).intent);db.close()
});
test('quota failure leaves durable intent; explicit rollback restores prior local and mirror',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A',rd_profiles:'old'});
 await seedMirror(db,'A');const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B',rd_profiles:'new'});
 await api.stageWorkspaceRestore(db,before,target,await api.readWorkspaceAuthority(db),'restore3');
 const set=s.setItem;s.setItem=(k,v)=>{if(k==='rd_profiles')throw Error('quota');return set(k,v)};
 await assert.rejects(api.resumeWorkspaceRestore(db,s));assert.equal(s.getItem('rd_last'),'B');
 const pending=(await api.readWorkspaceControl(db)).intent;
 assert.ok(pending);assert.equal(s.getItem(api.workspaceMarker),'restore3');
 s.setItem=set;await api.requestWorkspaceRollback(db,pending);
 assert.equal(await api.resumeWorkspaceRestore(db,s),true);
 assert.equal(s.getItem('rd_last'),'A');assert.equal(s.getItem('rd_profiles'),'old');assert.equal((await api.readWorkspaceAuthority(db)).mirror,'A');db.close()
});
test('unavailable IndexedDB cannot resume a marked partial projection; receipt safely clears a leftover marker',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A'});await seedMirror(db,'A');
 const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B'});
 await api.stageWorkspaceRestore(db,before,target,await api.readWorkspaceAuthority(db),'restore4');
 s.setItem(api.workspaceMarker,'restore4');
 await assert.rejects(api.resumeWorkspaceRestore(null,s));
 const remove=s.removeItem;s.removeItem=k=>{if(k===api.workspaceMarker)throw Error('marker cleanup failed');return remove(k)};
 await assert.rejects(api.resumeWorkspaceRestore(db,s));
 assert.equal((await api.readWorkspaceControl(db)).intent,null);assert.equal(s.getItem('rd_last'),'B');
 s.removeItem=remove;assert.equal(await api.resumeWorkspaceRestore(db,s),false);assert.equal(s.getItem(api.workspaceMarker),null);db.close()
});
test('history cap and pruning only affect exact selected historical entries, never current authority',async()=>{
 const api=harness(),db=await dbOpen();await seedMirror(db,'A');
 await api.writeWorkspaceCheckpoint(db,record(api,'a',{rd_last:'A'}),await api.readWorkspaceAuthority(db));
 await seedMirror(db,'B');await api.writeWorkspaceCheckpoint(db,record(api,'b',{rd_last:'B'}),await api.readWorkspaceAuthority(db));
 await assert.rejects(api.readWorkspaceHistory(db,1));
 const [key]=await api.readWorkspaceHistory(db,0,true),old=await api.readWorkspaceHistoryEntry(db,key);
 await assert.rejects(api.removeExportedWorkspaceHistory(db,'workspace-commit-v1',old));
 await assert.rejects(api.removeExportedWorkspaceHistory(db,key,{...old,id:'wrong'}));
 await api.removeExportedWorkspaceHistory(db,key,old);
 assert.equal(await api.readWorkspaceHistoryEntry(db,key),null);assert.equal((await api.readWorkspaceAuthority(db)).checkpoint.id,'b');db.close()
});
test('startup replay precedes legacy migration and UI restore stages only after backup acknowledgment',()=>{
 const early=html.indexOf('await RoomStorageSafety.resumeWorkspaceRestore(await mirrorDb,migrationStorage)');
 assert.ok(early>=0&&early<html.indexOf('RoomEquipment.migrateStorage(migrationStorage)',early));
 const code=extractFunction('restoreWorkspaceRecord');
 assert.ok(code.indexOf('await exportWorkspacePackage')<code.indexOf('beginWorkspaceRestore'));
 assert.match(code,/outcome!==true&&outcome!=='requested'/);
 assert.match(code,/workspaceCaptureUnchanged\(capture\)/);
 assert.match(code,/safeStorage\.crossStoreWriteBlocked=true/);
 assert.doesNotMatch(code,/safeStorage\.(?:setItem|removeItem)\(/);
 const history=extractFunction('showWorkspaceHistory');
 assert.ok(history.indexOf('if(outcome!==true)')<history.indexOf('removeExportedWorkspaceHistory'));
 assert.match(history,/await exportRecord/);
});

test('pre-stage marker survives an inaccessible database and permits exact startup replay',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A'});await seedMirror(db,'A');
 const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B'});
 await api.beginWorkspaceRestore(db,s,before,target,await api.readWorkspaceAuthority(db),'prepare1');
 assert.equal(s.getItem(api.workspaceMarker),'prepare:prepare1');
 await assert.rejects(api.resumeWorkspaceRestore(null,s));
 assert.equal(s.getItem('rd_last'),'A');
 assert.equal(await api.resumeWorkspaceRestore(db,s),true);
 assert.equal(s.getItem('rd_last'),'B');assert.equal(s.getItem(api.workspaceMarker),null);db.close()
});
test('failed optimistic staging leaves only a prepare marker, cleared after confirming no intent',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A'});await seedMirror(db,'A');
 const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B'}),expected=await api.readWorkspaceAuthority(db);
 await seedMirror(db,'changed');
 await assert.rejects(api.beginWorkspaceRestore(db,s,before,target,expected,'prepare2'));
 assert.equal(s.getItem(api.workspaceMarker),'prepare:prepare2');
 assert.equal(s.getItem('rd_last'),'A');
 assert.equal(await api.resumeWorkspaceRestore(db,s),false);assert.equal(s.getItem(api.workspaceMarker),null);assert.equal(s.getItem('rd_last'),'A');db.close()
});
test('completed receipt cannot clear a marker after an unexpected local change',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A'});await seedMirror(db,'A');
 const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B'});
 await api.beginWorkspaceRestore(db,s,before,target,await api.readWorkspaceAuthority(db),'receipt1');
 const remove=s.removeItem;s.removeItem=k=>{if(k===api.workspaceMarker)throw Error('cleanup denied');return remove(k)};
 await assert.rejects(api.resumeWorkspaceRestore(db,s));s.removeItem=remove;
 s.setItem('rd_last','third');await assert.rejects(api.resumeWorkspaceRestore(db,s));
 assert.equal(s.getItem(api.workspaceMarker),'receipt1');assert.equal(s.getItem('rd_last'),'third');
 s.setItem('rd_last','B');assert.equal(await api.resumeWorkspaceRestore(db,s),false);assert.equal(s.getItem(api.workspaceMarker),null);db.close()
});
test('latest recovery receipt history is protected from pruning',async()=>{
 const api=harness(),db=await dbOpen(),s=store({rd_last:'A'});await seedMirror(db,'A');
 const before=api.makeWorkspaceRecord(api.captureWorkspace(s),'before'),target=record(api,'target',{rd_last:'B'});
 await api.beginWorkspaceRestore(db,s,before,target,await api.readWorkspaceAuthority(db),'receipt2');
 await api.resumeWorkspaceRestore(db,s);
 const key='workspace-restore-history-v406:receipt2',value=await api.readWorkspaceHistoryEntry(db,key);
 await assert.rejects(api.removeExportedWorkspaceHistory(db,key,value));assert.ok(await api.readWorkspaceHistoryEntry(db,key));db.close()
});
test('uncertain stage and old journal acknowledgment require a fresh startup before saving',()=>{
 const stage=extractFunction('restoreWorkspaceRecord'),review=extractFunction('offerPendingJournalReview');
 assert.match(stage,/beginWorkspaceRestore\(db,window\.localStorage/);
 assert.match(stage,/getItem\(RoomStorageSafety\.workspaceMarker\)!==null/);
 assert.match(review,/if\(!mirrorSnapshot\)\{notify\(/);
 assert.match(review,/sameMirrorPair\(mirrorSnapshot,latestMirror\)/);
 assert.match(review,/safeStorage\.crossStoreWriteBlocked=true/);
 assert.match(review,/rd_svg_drafts/);
});
