'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'..','assets','dxf-import.js'),'utf8');

function harness(){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{
  url:'https://roomdesigner.test',runScripts:'outside-only',pretendToBeVisual:true
 });
 const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.confirm=()=>true;
 const lines=[{a:{x:0,y:0},b:{x:20,y:10},layer:'walls',shapeId:'line-1'}];
 w.RoomDXF={
  parse:()=>({segments:lines,layers:[{name:'walls',off:false,frozen:false,color:7,count:1}],unit:{factor:1},warnings:{}}),
  bounds:()=>({x:0,y:0,w:20,h:10}),
  select:()=>lines,
  architectural:()=>true
 };
 w.TextDecoder=TextDecoder;w.eval(fs.readFileSync(path.join(__dirname,'..','assets','dxf-encoding.js'),'utf8'));
 w.eval(script);
 const file={name:'sample.dxf',size:32,text:async()=>'DXF'};
 const dialog=()=>w.document.querySelector('#dxfImportDialog');
 return {w,file,dialog,close:()=>w.close()};
}
const settled=()=>new Promise(resolve=>setTimeout(resolve,0));
test('DXF modal cannot close, cancel or be replaced while import callback is pending',async()=>{
 const h=harness();try{
  let release,calls=0;
  const pending=new Promise(resolve=>release=resolve);
  const handle=await h.w.RoomDXFImport.open(h.file,async()=>{calls++;await pending});
  assert(h.dialog());
  h.dialog().querySelector('[data-dxf-confirm-unit]').click();
  h.dialog().querySelector('[data-dxf-import]').click();
  assert.equal(calls,1);
  assert.equal(handle.close(),false,'programmatic close blocked while import is busy');
  h.dialog().querySelector('[data-dxf-close]').click();
  assert(h.dialog(),'close button is blocked while importing');
  h.dialog().dispatchEvent(new h.w.Event('cancel',{cancelable:true}));
  assert(h.dialog(),'Escape/cancel cannot dismiss active commit');
  await assert.rejects(h.w.RoomDXFImport.open(h.file,async()=>{}),/در حال تکمیل/);
  assert.equal(h.w.document.querySelectorAll('#dxfImportDialog').length,1);
  assert.equal(h.dialog().querySelector('[data-dxf-import]').disabled,true);
  release();await settled();
  assert.equal(calls,1,'callback is invoked at most once');
  assert.equal(h.dialog(),null,'successful import closes its own modal');
 }finally{h.close()}
});
test('DXF callback failure leaves original modal open and permits controlled retry',async()=>{
 const h=harness();try{
  let calls=0;
  await h.w.RoomDXFImport.open(h.file,async()=>{calls++;if(calls===1)throw Error('injected failure')});
  const dialog=h.dialog(),button=dialog.querySelector('[data-dxf-import]');
  dialog.querySelector('[data-dxf-confirm-unit]').click();button.click();await settled();
  assert.equal(h.dialog(),dialog);
  assert.match(dialog.querySelector('[data-dxf-status]').textContent,/injected failure/);
  assert.equal(button.disabled,false);
  button.click();await settled();
  assert.equal(calls,2);
  assert.equal(h.dialog(),null);
 }finally{h.close()}
});
