'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {extractFunction} = require('./source-harness.cjs');

function harness(primarySaved, mirrorSaved) {
 const data=new Map([['rd_last','{"id":"previous"}']]),notices=[];
 const backup={style:{},title:'',setAttribute(){}};
 const title={textContent:''};
 const ctx=vm.createContext({
  manualSaveFailed:false,rdLastBlocked:false,rdLastWarningShown:false,recoveryWritesBlocked:false,
  recoveryJournalPending:()=>false,normalizeSvgReferences:()=>{},notify:m=>notices.push(m),
  safeStorage:{
   getItem:key=>data.get(key)??null,
   setItem(key,value){if(key==='rd_last'&&!primarySaved)return false;data.set(key,String(value));return true;}
  },
  mirrorChecksum:()=>'checksum',readLocalJSON:()=>null,
  mirrorOperation:async()=>mirrorSaved,
  $:key=>key==='backupNow'?backup:key==='title'?title:null
 });
 const source=`
 let doc={id:'newer',name:'Newest',date:'2026-11-20'},documentEpoch=0,mirrorGeneration=0;
 let mirrorPending=false,mirrorSaveOk=false,primarySaveOk=true,mirrorQueue=Promise.resolve();
 `+extractFunction('persistenceStatus')+extractFunction('saveAuto')+`
 function done(){return mirrorQueue}
 function state(){return {primarySaveOk,mirrorSaveOk,mirrorPending,manualSaveFailed}}
 `;
 vm.runInContext(source,ctx);
 return {ctx,data,backup,notices};
}

test('failed primary write keeps emergency export visible even when mirror succeeds',async()=>{
 const h=harness(false,true);
 assert.equal(h.ctx.saveAuto(),false);
 await h.ctx.done();
 assert.equal(h.ctx.state().mirrorSaveOk,true);
 assert.equal(h.ctx.state().manualSaveFailed,true);
 assert.notEqual(h.backup.style.display,'none');
 assert.match(h.backup.title,/تأیید نشده/);
 assert.match(h.notices.join(' '),/نسخه قدیمی|خروجی NRD/);
 assert.equal(h.data.get('rd_last'),'{"id":"previous"}');
});

test('successful primary write retains the normal saved indicator',async()=>{
 const h=harness(true,true);
 assert.equal(h.ctx.saveAuto(),true);
 await h.ctx.done();
 assert.equal(h.ctx.state().manualSaveFailed,false);
 assert.equal(h.backup.style.display,'none');
 assert.match(h.data.get('rd_last'),/"id":"newer"/);
});

test('two failed persistence targets keep the export warning visible',async()=>{
 const h=harness(false,false);
 assert.equal(h.ctx.saveAuto(),false);
 await h.ctx.done();
 assert.equal(h.ctx.state().mirrorSaveOk,false);
 assert.notEqual(h.backup.style.display,'none');
 assert.equal(h.ctx.state().manualSaveFailed,true);
});
