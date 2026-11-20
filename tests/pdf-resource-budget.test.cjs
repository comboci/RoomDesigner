'use strict';
// Regression source only; tests/build are NOT_RUN under audit/regression/POLICY.md.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extractFunction}=require('./source-harness.cjs');
const image='data:image/png;base64,QUJD',crop={x:0,y:0,w:1,h:1},page=(n,data=image)=>({data,width:100,height:80,page:n,fileName:'test.pdf',crop});
function boot({quota=true,renderError=false,validateError=false}={}){
 const original={devices:[],cables:[],walls:[],imageAssets:{},activeLayer:'main',layers:[{id:'main',name:'main'}]};
 const physical={raw:'prior',calls:0};let id=0;
 const context=vm.createContext({doc:original,documentEpoch:1,selection:null,multiSelection:null,view:{x:0,y:0,w:10,h:10},tool:'select',history:[],redoHistory:[],volatileStorageKeys:new Set(),recoveryWritesBlocked:false,rdLastBlocked:false,manualSaveFailed:false,recoveryJournalPending:()=>false,drag:null,wireDrag:null,wallGesture:null,cableGesture:null,pinch:null,canCreateInActiveLayer:()=>true,allowDocumentGrowth:()=>true,structuredClone,uid:()=>('id'+(++id)),placeNewDevice:d=>{d.x=10;d.y=20},validateRoomDocument:d=>{if(validateError)throw Error('invalid candidate');return d},safeStorage:{getItem:()=>physical.raw,setItem:(_,value)=>{physical.calls++;if(!quota)return false;physical.raw=value;return true},removeItem:()=>true},fallbackStore:new Map(),trimHistory:()=>{},render:()=>{if(renderError)throw Error('render failure')},setTool:t=>{context.tool=t},positionWorkspaceView:()=>{},updateHistoryControls:()=>{},scheduleSave:()=>{context.documentEpoch++},persistenceStatus:()=>{},notify:()=>{}});
 vm.runInContext(extractFunction('preparePdfPageRecords'),context);vm.runInContext(extractFunction('commitPdfPageRecords'),context);
 return {context,original,physical};
}
test('stages images, deduplicates repeated image data, without changing the live document',()=>{
 const h=boot(),r=h.context.preparePdfPageRecords([page(1),page(2)]);
 assert.equal(h.original.devices.length,0);assert.equal(r.candidate.devices.length,2);assert.equal(Object.keys(r.candidate.imageAssets).length,1);
 assert.equal(r.candidate.devices[0].x-r.candidate.devices[1].x,504);
});
test('rejects malformed image, crop, page and too many pages without editing',()=>{
 const h=boot();
 for(const bad of [{...page(1),data:'data:text/html;base64,QUJD'},{...page(1),crop:{...crop,w:2}},{...page(1),width:0},{...page(1),page:0}])
  assert.throws(()=>h.context.preparePdfPageRecords([bad]));
 assert.throws(()=>h.context.preparePdfPageRecords(Array.from({length:17},(_,i)=>page(i+1))));
 assert.equal(h.original.devices.length,0);
});
test('aggregate document budget rejects oversized imported raster',()=>{
 const h=boot();assert.throws(()=>h.context.preparePdfPageRecords([page(1,'data:image/png;base64,'+'A'.repeat(3200000))]),/بودجه/);
 assert.equal(h.original.devices.length,0);
});
test('schema validation rejects candidate before persistent write',()=>{
 const h=boot({validateError:true});
 assert.throws(()=>h.context.commitPdfPageRecords([page(1)],h.original,1),/invalid candidate/);
 assert.equal(h.physical.calls,0);assert.equal(h.context.doc,h.original);
});
test('LocalStorage quota rejection preserves editor, physical bytes and Undo history',()=>{
 const h=boot({quota:false});
 assert.throws(()=>h.context.commitPdfPageRecords([page(1)],h.original,1),/ذخیره اصلی/);
 assert.equal(h.context.doc,h.original);assert.equal(h.context.history.length,0);
 assert.equal(h.physical.raw,'prior');assert.equal(h.context.volatileStorageKeys.has('rd_last'),false);
});
test('render failure cannot write any PDF image data',()=>{
 const h=boot({renderError:true});
 assert.throws(()=>h.context.commitPdfPageRecords([page(1)],h.original,1),/render failure/);
 assert.equal(h.context.doc,h.original);assert.equal(h.physical.calls,0);
});
test('successful PDF import persists one candidate and creates one Undo boundary',()=>{
 const h=boot();h.context.commitPdfPageRecords([page(1)],h.original,1);
 assert.equal(h.physical.calls,1);assert.equal(h.context.history.length,1);
 assert.equal(JSON.parse(h.physical.raw).devices.length,1);
});
test('stale PDF import is rejected before any writes',()=>{
 const h=boot();h.context.documentEpoch=2;
 assert.throws(()=>h.context.commitPdfPageRecords([page(1)],h.original,1),/تغییر کرده/);
 assert.equal(h.physical.calls,0);
});
test('PDF export is bounded and writes JPEG streams page-by-page',()=>{
 const src=extractFunction('saveDrawingPdf');
 assert.match(src,/canvas\.toBlob/);assert.match(src,/areas\.length>20/);assert.match(src,/maxOutputBytes=32\*1024\*1024/);
 assert.doesNotMatch(src,/images\.push\(/);
});
test('PDF importer source sets aggregate memory budget and source page cap',()=>{
 const src=fs.readFileSync('assets/pdf-import.js','utf8');
 assert.match(src,/MAX_PDF_IMPORT_DATA_CHARS=3000000/);assert.match(src,/enforcePdfImportBudget\(order\.length,usedChars,data\.length\)/);
 assert.match(src,/MAX_PDF_SOURCE_PAGES=500/);
});
