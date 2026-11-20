'use strict';
// V397 regression source only; Node/Playwright/Build are intentionally NOT_RUN.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const {extractFunction}=require('./source-harness.cjs');
const importer=fs.readFileSync(path.join(__dirname,'..','assets','dxf-import.js'),'utf8');
function harness(unitCode=6,unit={factor:100,name:'متر'}){
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://roomdesigner.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const segments=[{a:{x:0,y:0},b:{x:400,y:200},layer:'walls'}];
 w.RoomDXF={
  parse:()=>({segments,layers:[{name:'walls',off:false,frozen:false,color:7,count:1}],unit,unitCode,warnings:{}}),
  bounds:()=>({x:0,y:0,w:400,h:200}),select:()=>segments,architectural:()=>true
 };
 w.eval(importer);
 const file={name:'units.dxf',size:80,text:async()=>'DXF'};
 let imported=null;
 return {w,file,open:async()=>{await w.RoomDXFImport.open(file,async data=>{imported=data});return w.document.querySelector('#dxfImportDialog')},
  get imported(){return imported},close:()=>dom.window.close()};
}
const micro=()=>new Promise(resolve=>setTimeout(resolve,0));
test('DXF with meter INSUNITS is blocked while default centimeter factor is not confirmed',async()=>{
 const h=harness();try{
  const d=await h.open();
  assert.equal(d.querySelector('[data-dxf-unit]').value,'1');
  assert.equal(d.querySelector('[data-dxf-import]').disabled,true);
  assert.match(d.querySelector('[data-dxf-source-units]').textContent,/متر/);
  assert.match(d.querySelector('[data-dxf-source-units]').textContent,/متفاوت/);
  assert.match(d.querySelector('[data-dxf-size]').textContent,/سانتی‌متر/);
 }finally{h.close()}
});
test('explicit acceptance records both source and chosen DXF units in the import payload',async()=>{
 const h=harness();try{
  const d=await h.open();d.querySelector('[data-dxf-confirm-unit]').click();
  assert.equal(d.querySelector('[data-dxf-import]').disabled,false);
  d.querySelector('[data-dxf-import]').click();await micro();
  assert.equal(h.imported.unitConfirmation.confirmed,true);
  assert.equal(h.imported.unitConfirmation.sourceCode,6);
  assert.equal(h.imported.unitConfirmation.sourceFactor,100);
  assert.equal(h.imported.unitConfirmation.factor,1);
  assert.equal(h.imported.factor,1);
 }finally{h.close()}
});
test('selecting meter units clears prior confirmation until checked again',async()=>{
 const h=harness();try{
  const d=await h.open(),unit=d.querySelector('[data-dxf-unit]'),approval=d.querySelector('[data-dxf-confirm-unit]');
  approval.click();assert.equal(d.querySelector('[data-dxf-import]').disabled,false);
  unit.value='100';unit.dispatchEvent(new h.w.Event('change'));
  assert.equal(approval.checked,false);
  assert.equal(d.querySelector('[data-dxf-import]').disabled,true);
  approval.click();assert.equal(d.querySelector('[data-dxf-import]').disabled,false);
 }finally{h.close()}
});
test('changing a custom scale revokes approval and requires explicit reapproval',async()=>{
 const h=harness();try{
  const d=await h.open(),unit=d.querySelector('[data-dxf-unit]'),factor=d.querySelector('[data-dxf-factor]'),approval=d.querySelector('[data-dxf-confirm-unit]');
  unit.value='custom';unit.dispatchEvent(new h.w.Event('change'));
  factor.value='12.5';factor.dispatchEvent(new h.w.Event('input'));
  approval.click();assert.equal(d.querySelector('[data-dxf-import]').disabled,false);
  factor.value='10';factor.dispatchEvent(new h.w.Event('input'));
  assert.equal(approval.checked,false);
  assert.equal(d.querySelector('[data-dxf-import]').disabled,true);
 }finally{h.close()}
});
test('unknown or unitless DXF also requires explicit confirmation',async()=>{
 const h=harness(0,null);try{
  const d=await h.open();
  assert.match(d.querySelector('[data-dxf-source-units]').textContent,/بدون/);
  assert.equal(d.querySelector('[data-dxf-import]').disabled,true);
  d.querySelector('[data-dxf-confirm-unit]').click();
  assert.equal(d.querySelector('[data-dxf-import]').disabled,false);
 }finally{h.close()}
});
test('native DXF import validates chosen scale and stores provenance on new layers',()=>{
 const apply=extractFunction('applyRoomDXFGeometry');
 assert.match(apply,/plan\?\.fileName&&!unitConfirmation/);
 assert.match(apply,/unitConfirmation\.factor!==factor/);
 assert.match(apply,/dxfUnitProvenance:\{\.\.\.unitConfirmation,confirmedAt:/);
});

