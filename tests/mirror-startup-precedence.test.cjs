'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { extractFunction } = require('./source-harness.cjs');

const mirrorDoc = { id:'mirror', devices:[], cables:[], connectionModel:'physical-connections-1', equipmentRelease:'lighting-equipment-1' };
const mirrorRaw = JSON.stringify(mirrorDoc);
function harness(localRaw, metadata) {
  const notices=[],events=[],writes=[];
  const original={id:'already-loaded-local', devices:[], cables:[]};
  const scope=vm.createContext({
    doc:original,documentEpoch:0,drawingChangedSinceStartup:false,mirrorQueue:Promise.resolve(),
    readMirrorSnapshot:async()=>({mirror:mirrorRaw,mirrorMeta:metadata}),
    safeStorage:{getItem:key=>key==='rd_last'?localRaw:null,setItem:()=>{writes.push('set');throw Error('Unexpected mutation')},removeItem:()=>{writes.push('remove');throw Error('Unexpected mutation')}},
    validateRoomDocument:value=>{if(!Array.isArray(value?.devices)||!Array.isArray(value?.cables))throw Error('Invalid document');return value},
    mirrorChecksum:()=> 'good-checksum',manualSaveFailed:false,
    persistenceStatus:()=>events.push('status'),notify:message=>notices.push(message),
    RoomConnections:{version:'physical-connections-1'},
    RoomEquipment:{release:'lighting-equipment-1',cleanDocument:value=>value},
    catalog:[],mirrorOperation:async()=>true,
    render:()=>events.push('render'),positionWorkspaceView:()=>events.push('position'),
    updateHistoryControls:()=>events.push('history')
  });
  vm.runInContext(extractFunction('recoverMirrorOnStartup'),scope);
  return {scope,notices,events,writes,original};
}

test('valid LocalStorage takes precedence without false mirror-corruption warning',async()=>{
 const h=harness(JSON.stringify({id:'valid-local',devices:[],cables:[]}),{format:2,length:999,checksum:'wrong'});
 await h.scope.recoverMirrorOnStartup();
 assert.equal(h.scope.doc,h.original);
 assert.deepEqual(h.notices,[]);
 assert.deepEqual(h.writes,[]);
 assert.equal(h.events.length,0);
});

test('invalid but present LocalStorage remains untouched even if mirror metadata is corrupt',async()=>{
 const h=harness('{malformed',{format:2,length:999,checksum:'wrong'});
 await h.scope.recoverMirrorOnStartup();
 assert.equal(h.scope.doc,h.original);
 assert.equal(h.scope.manualSaveFailed,true);
 assert.match(h.notices.join(' '),/نقشه محلی نامعتبر/);
 assert.doesNotMatch(h.notices.join(' '),/نسخه پشتیبان قابل بازیابی نیست/);
 assert.deepEqual(h.writes,[]);
});

test('absent LocalStorage still recovers a checksum-valid IndexedDB mirror',async()=>{
 const h=harness(null,{format:2,length:mirrorRaw.length,checksum:'good-checksum'});
 await h.scope.recoverMirrorOnStartup();
 assert.equal(h.scope.doc.id,'mirror');
 assert.deepEqual(h.events,['render','position','render','history']);
 assert.match(h.notices.join(' '),/نسخه پشتیبان مرورگر بازیابی شد/);
 assert.deepEqual(h.writes,[]);
});

test('absent LocalStorage cannot promote a checksum-invalid mirror',async()=>{
 const h=harness(null,{format:2,length:999,checksum:'wrong'});
 await h.scope.recoverMirrorOnStartup();
 assert.equal(h.scope.doc,h.original);
 assert.match(h.notices.join(' '),/نسخه پشتیبان قابل بازیابی نیست/);
 assert.deepEqual(h.writes,[]);
});
