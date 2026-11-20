'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {extractFunction} = require('./source-harness.cjs');

const invalidRaw = '{old-invalid-document';
const mirrorRaw = JSON.stringify({id:'mirror-candidate',devices:[],cables:[]});
function harness() {
  const durable=new Map([['rd_last',invalidRaw]]);
  const fallbackStore=new Map();
  const volatileStorageKeys=new Set();
  const notifications=[];
  const originalDoc={id:'editor-document',devices:[],cables:[]};
  const scope=vm.createContext({
    doc:originalDoc,rdLastBlocked:true,rdLastBackupConfirmed:true,
    manualSaveFailed:false,invalidLocalData:new Set(['rd_last']),
    fallbackStore,volatileStorageKeys,
    safeStorage:{
      getItem:key=>volatileStorageKeys.has(key)
        ?fallbackStore.get(key)??null:durable.get(key)??null
    },
    mirrorQueue:Promise.resolve(),
    readMirrorSnapshot:async()=>({mirror:mirrorRaw,mirrorMeta:null}),
    validateRoomDocument:value=>value,
    mirrorChecksum:()=> 'not-needed',
    confirm:()=>true,
    // A denied rd_last write updates volatile fallback, not durable bytes.
    saveAuto:()=>{
      fallbackStore.set('rd_last',JSON.stringify({id:'rejected-new-document'}));
      volatileStorageKeys.add('rd_last');
      return false;
    },
    persistenceStatus:()=>{},
    notify:message=>notifications.push(message)
  });
  vm.runInContext(extractFunction('resolveInvalidLast'),scope);
  return {scope,durable,fallbackStore,volatileStorageKeys,notifications,originalDoc};
}

for(const useMirror of [false,true]) {
  test('failed invalid-last replacement preserves recovery source, mirror='+useMirror,async()=>{
    const h=harness();
    await h.scope.resolveInvalidLast(useMirror);
    assert.equal(h.durable.get('rd_last'),invalidRaw,'durable damaged original must not change');
    assert.equal(h.scope.safeStorage.getItem('rd_last'),invalidRaw,'recovery export must see original bytes');
    assert.equal(h.fallbackStore.get('rd_last'),invalidRaw,'rejected candidate must not shadow the original');
    assert.equal(h.volatileStorageKeys.has('rd_last'),true);
    assert.equal(h.scope.doc,h.originalDoc,'failed replacement restores live editor document');
    assert.equal(h.scope.rdLastBlocked,true,'automatic saves remain blocked');
    assert.equal(h.scope.manualSaveFailed,true);
    assert.equal(h.scope.invalidLocalData.has('rd_last'),true);
    assert.match(h.notifications.join(' '),/ذخیره ناموفق بود/);
  });
}
