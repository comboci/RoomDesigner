'use strict';
// RD-A02 V402-R source regression contracts; authored, NOT_RUN.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {html,extractFunction}=require('./source-harness.cjs');
test('startup waits for conflict protection and absent-local recovery before first drawing render',()=>{
 assert.match(html,/if\(!recoveryIncomplete&&!await protectCrossStoreStartup\(\)\)return;render\(\)/);
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

test('read error and failed absent-local recovery do not silently enable fresh editor',()=>{
 const gate=extractFunction('protectCrossStoreStartup');
 assert.match(gate,/if\(!snapshot&&await mirrorDb\)throw Error/);
 assert.match(gate,/if\(!await recoverMirrorOnStartup\(snapshot,false\)\)/);
 assert.match(gate,/await offerDivergentSnapshotBackup\(null,stored,meta,gate,'fresh'\)/);
 assert.ok(gate.indexOf("await offerDivergentSnapshotBackup(null")<gate.indexOf('crossStoreWriteBlocked=false'));
 const review=extractFunction('offerDivergentSnapshotBackup');
 assert.match(review,/selectedForDisplay:selectionMode/);
});
test('migration archive export includes each raw retained snapshot',()=>{
 const code=extractFunction('offerMigrationArchive');
 assert.match(code,/RoomStorageSafety\.migrationArchiveEntries/);
 assert.match(code,/JSON\.stringify\(\{format:1,local,preservedMirror,archives,mirrorArchives,localArchivesReadFailed,mirrorArchivesReadFailed\}/);
 assert.doesNotMatch(code,/button\.remove\(/);
});

test('migration and journal preflight protects mirror bytes before startup mutations',()=>{
 const marker=html.indexOf("if(migrationRequired||pending)");
 assert.ok(marker>=0&&html.indexOf("await preserveMirrorForMigration(undefined,pending?",marker)<html.indexOf("RoomEquipment.migrateStorage(migrationStorage)",marker));
 assert.match(html,/else if\(startupHadProjectData&&typeof indexedDB!=='undefined'\)throw Error/);
 assert.match(html,/if\(startupHadProjectData&&migrationStorage&&safeStorage\.getItem\('rd_connection_model'\)!==RoomConnections.version\)RoomStorageSafety.preserveMigration/);
 const recovery=extractFunction('recoverMirrorOnStartup');
 assert.ok(recovery.indexOf("await preserveMirrorForMigration(snapshot,'mirror-document-migration')")<recovery.indexOf('RoomConnections.resetDocument(recovered)'));
 assert.ok(recovery.indexOf("await preserveMirrorForMigration(snapshot,'mirror-document-migration')")<recovery.indexOf('RoomEquipment.cleanDocument(recovered,catalog)'));
 assert.match(extractFunction('protectCrossStoreStartup'),/await preserveMirrorForMigration\(snapshot,'unclassified-startup-mirror'\)/);
});
test('mirror-only migration archives can be exported and incomplete reads are disclosed',()=>{
 const code=extractFunction('offerMigrationArchive');
 assert.match(code,/hasMirror=await hasMirrorMigrationArchives\(\)/);
 assert.match(extractFunction('hasMirrorMigrationArchives'),/\.openKeyCursor\(\)/);
 assert.match(extractFunction('protectCrossStoreStartup'),/preserveMirrorForMigration\(snapshot,'orphan-mirror-metadata'\)/);
 assert.match(code,/mirrorArchivesReadFailed=mirrorArchives===null/);
 assert.match(code,/if\(\(localArchivesReadFailed\|\|mirrorArchivesReadFailed\)&&!confirm/);
 assert.match(extractFunction('preserveMirrorForMigration'),/store\.add\(/);
 assert.doesNotMatch(extractFunction('preserveMirrorForMigration'),/store\.put\(/);
});
