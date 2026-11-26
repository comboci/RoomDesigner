'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),{IDBFactory}=require('fake-indexeddb'),{html,extractFunction}=require('./source-harness.cjs');
const open=idb=>new Promise((resolve,reject)=>{const req=idb.open('room-designer-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('backups');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
function write(db,entries){return new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite');for(const [key,value]of entries)tx.objectStore('backups').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
function get(db,key){return new Promise((resolve,reject)=>{const tx=db.transaction('backups'),req=tx.objectStore('backups').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
test('opening recovery DB preserves original mirror and metadata once, before subsequent mirror writes',async()=>{
 const indexedDB=new IDBFactory(),db=await open(indexedDB),old='original legacy bytes',meta={generation:8};await write(db,[['last',old],['last-meta',meta]]);db.close();
 const code=html.slice(html.indexOf('const mirrorDb='),html.indexOf('function mirrorChecksum('))+'\nglobalThis.ready=mirrorDb;';
 const boot=async()=>{const c=vm.createContext({indexedDB,RoomConnections:{recoveryReset:Promise.resolve(true)}});vm.runInContext(code,c);return await c.ready};
 const current=await boot();assert.ok(current);assert.deepEqual(await get(current,'preserved-before-v325'),{mirror:old,mirrorMeta:meta});await write(current,[['last','newer']]);current.close();
 const reopened=await boot();assert.deepEqual(await get(reopened,'preserved-before-v325'),{mirror:old,mirrorMeta:meta});assert.equal(await get(reopened,'last'),'newer');reopened.close();
});

// V404-R: authored source tests; execution NOT_RUN under repository POLICY.
function archiveHarness(db){
 const scope=vm.createContext({mirrorDb:Promise.resolve(db)});
 vm.runInContext(['mirrorMigrationArchiveKey','sameMirrorPair','preserveMirrorForMigration','hasMirrorMigrationArchives','readMirrorMigrationArchives'].map(extractFunction).join('\n'),scope);
 return scope
}
test('distinct mirror bytes and metadata are archived without rewriting legacy or prior archives',async()=>{
 const idb=new IDBFactory(),db=await open(idb),scope=archiveHarness(db);
 await write(db,[['last','A'],['last-meta',{format:2,generation:1}],['preserved-before-v325',{mirror:'legacy'}]]);
 assert.equal(await scope.preserveMirrorForMigration(),true);
 assert.equal(await scope.preserveMirrorForMigration(),true);
 await write(db,[['last','B'],['last-meta',{format:2,generation:2}]]);
 assert.equal(await scope.preserveMirrorForMigration(),true);
 await write(db,[['last-meta',{format:2,generation:3}]]);
 assert.equal(await scope.preserveMirrorForMigration(),true);
 const all=await scope.readMirrorMigrationArchives(),newer=all.filter(x=>x.key.startsWith('pre-migration-v404:'));
 assert.equal(newer.length,3);assert.equal(await scope.hasMirrorMigrationArchives(),true);
 assert.equal(newer[0].value.mirror,'A');assert.equal(newer[1].value.mirror,'B');assert.equal(newer[2].value.mirrorMeta.generation,3);
 assert.equal((await get(db,'preserved-before-v325')).mirror,'legacy');assert.equal(await get(db,'last'),'B');db.close()
});
test('stale expected mirror refuses archival and leaves the current snapshot unchanged',async()=>{
 const idb=new IDBFactory(),db=await open(idb),scope=archiveHarness(db);
 await write(db,[['last','new'],['last-meta',{generation:9}]]);
 assert.equal(await scope.preserveMirrorForMigration({mirror:'old',mirrorMeta:{generation:8}},'mirror-document-migration'),false);
 assert.equal((await scope.readMirrorMigrationArchives()).length,0);
 assert.equal(await get(db,'last'),'new');
 assert.equal(await scope.preserveMirrorForMigration({mirror:'new',mirrorMeta:{generation:9}},'mirror-document-migration'),true);
 assert.equal((await scope.readMirrorMigrationArchives()).length,1);db.close()
});
test('empty mirror is not archived and a closed database fails safely',async()=>{
 const idb=new IDBFactory(),db=await open(idb),scope=archiveHarness(db);
 assert.equal(await scope.preserveMirrorForMigration(),true);assert.equal((await scope.readMirrorMigrationArchives()).length,0);assert.equal(await scope.hasMirrorMigrationArchives(),false);
 db.close();assert.equal(await scope.preserveMirrorForMigration(),false);assert.equal(await scope.readMirrorMigrationArchives(),null);assert.equal(await scope.hasMirrorMigrationArchives(),null)
});
