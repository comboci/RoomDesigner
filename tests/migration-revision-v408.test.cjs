'use strict';
// Source authored only; NOT_RUN under audit/regression/POLICY.md.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {html,extractFunction}=require('./source-harness.cjs');
const restore=new Function('validateRoomDocument',extractFunction('restoreHistoryDocument')+'\nreturn restoreHistoryDocument;')(d=>d);
const current={id:'room',name:'current',revision:8,revisions:[{number:8,snapshot:{devices:[]}}],createdAt:'new',createdBy:'owner',updatedAt:'saved',lastEditedBy:'owner'};
test('Undo restores drawing but keeps current Revision ledger and metadata',()=>{
 const old={id:'room',name:'old',revision:7,revisions:[{number:7}],createdAt:'old',updatedAt:'old'};
 const result=restore(JSON.stringify(old),current);
 assert.equal(result.name,'old');assert.equal(result.revision,8);assert.deepEqual(result.revisions,current.revisions);
 assert.equal(result.updatedAt,'saved');assert.equal(result.createdAt,'new');assert.notEqual(result.revisions,current.revisions);
});
test('History cannot cross document identity',()=>assert.throws(()=>restore(JSON.stringify({id:'other'}),current)));
test('Undo cannot revive absent saved metadata',()=>{
 const result=restore(JSON.stringify({id:'room',revision:3,revisions:[{number:3}]}),{id:'room'});
 assert.equal(Object.hasOwn(result,'revision'),false);assert.equal(Object.hasOwn(result,'revisions'),false);
});
test('Undo/Redo and selected history use the same helper; Save As isolates stacks',()=>{
 assert.match(extractFunction('applyHistoryStep'),/restoreHistoryDocument\(from\[from\.length-1\],doc\)/);
 assert.match(html,/restoreHistoryDocument\(history\[index\],doc\)/);
 assert.match(extractFunction('saveLocal'),/if\(copy\)\{history=\[\];redoHistory=\[\];updateHistoryControls\(\)\}/);
});
function model(file){
 const ctx=vm.createContext({EquipmentCatalogBuiltin:{entries:[]},RoomEquipment:{defaults:()=>[],isArchitecture:()=>false}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
 return ctx[file==='equipment-release.js'?'RoomEquipment':'RoomConnections'];
}
function store(initial,fail){
 const values=new Map(Object.entries(initial));
 return {getItem:k=>values.get(k)??null,setItem(k,v){if(fail(k,v))return false;values.set(k,v);return true},removeItem(k){if(fail(k,null))return false;values.delete(k);return true}};
}
test('Equipment failure retains previous release marker and catalog bytes',()=>{
 const m=model('equipment-release.js'),s=store({rd_equipment_release:'old-release',rd_catalog:'[]'},(k,v)=>k==='rd_equipment_release'&&v===m.release);
 assert.throws(()=>m.migrateStorage(s));
 assert.equal(s.getItem('rd_equipment_release'),'old-release');assert.equal(s.getItem('rd_catalog'),'[]');
});
test('Equipment rollback failure reports exact unverified key',()=>{
 const m=model('equipment-release.js');
 const s=store({rd_equipment_release:'old-release',rd_catalog:'[]'},k=>k==='rd_catalog');
 assert.throws(()=>m.migrateStorage(s),/بازیابی از پشتیبان لازم است: rd_catalog/);
 assert.equal(s.getItem('rd_equipment_release'),'old-release');
});
test('Connection migration failure restores original marker and data',()=>{
 const m=model('connection-model.js'),s=store({rd_connection_model:'old-model',rd_catalog:'[]',rd_types:'{}'},(k,v)=>k==='rd_connection_model'&&v===m.version);
 assert.throws(()=>m.migrateStorage(s));
 assert.equal(s.getItem('rd_connection_model'),'old-model');assert.equal(s.getItem('rd_types'),'{}');assert.equal(s.getItem('rd_catalog'),'[]');
});
test('Connection migration reports failed rollback instead of swallowing it',()=>{
 const m=model('connection-model.js'),s=store({rd_connection_model:'old-model',rd_catalog:'[]',rd_types:'{}'},(k,v)=>k==='rd_connection_model'&&v===m.version||k==='rd_types'&&v==='{}');
 assert.throws(()=>m.migrateStorage(s),/بازیابی از پشتیبان لازم است: rd_types/);
});
