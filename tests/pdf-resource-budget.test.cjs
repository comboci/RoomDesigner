'use strict';
// V397 source-only regression cases; do NOT run tests/build under audit/regression/POLICY.md.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extractFunction,html}=require('./source-harness.cjs');
const image='data:image/png;base64,QUJD',crop={x:0,y:0,w:1,h:1};
const page=(n,data=image)=>({data,width:100,height:80,page:n,fileName:'test.pdf',crop});
function boot({quota=true,journal=true,marker=true,mirror=true,renderError=false,validateError=false}={}){
 const original={devices:[],cables:[],walls:[],imageAssets:{},activeLayer:'main',layers:[{id:'main',name:'main'}]};
 const store=new Map([['rd_last','prior']]),writes=[],messages=[];let id=0;
 const context=vm.createContext({
  doc:original,documentEpoch:1,selection:null,multiSelection:null,view:{x:0,y:0,w:10,h:10},tool:'select',
  history:[],redoHistory:[],volatileStorageKeys:new Set(),fallbackStore:new Map(),recoveryWritesBlocked:false,rdLastBlocked:false,
  manualSaveFailed:false,primarySaveOk:true,mirrorSaveOk:false,mirrorPending:false,mirrorGeneration:0,mirrorQueue:Promise.resolve(),
  drawingChangedSinceStartup:false,persistTimer:null,drag:null,wireDrag:null,wallGesture:null,cableGesture:null,pinch:null,wallStart:null,start:null,polyPreview:null,
  recoveryJournalPending:()=>store.has('rd_pending_import')||store.has('rd_pending_revision'),
  canCreateInActiveLayer:()=>true,allowDocumentGrowth:()=>true,structuredClone,uid:()=>('x'+String(++id).padStart(12,'0')),
  placeNewDevice:d=>{d.x=10;d.y=20},validateRoomDocument:d=>{if(validateError)throw Error('invalid candidate');return d},
  safeStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>{
   writes.push([key,value]);
   if(key==='rd_last'&&!quota&&value!=='prior'||key==='rd_pending_import'&&!journal||key==='rd_import_committed'&&!marker)return false;
   store.set(key,value);return true;
  },removeItem:key=>{store.delete(key);return true}},
  trimHistory:()=>{},render:()=>{if(renderError)throw Error('render failure')},
  setTool:t=>{context.tool=t},positionWorkspaceView:()=>{},updateHistoryControls:()=>{},
  clearTimeout:()=>{},persistenceStatus:()=>{},notify:s=>messages.push(s),
  mirrorChecksum:payload=>{let h=2166136261;for(let i=0;i<payload.length;i++){h^=payload.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')},
  mirrorOperation:async()=>mirror,
  readLocalJSON:(key,fallback,check)=>{try{const x=JSON.parse(store.get(key));return !check||check(x)?x:fallback}catch{return fallback}},
  clearRecoveryJournal:key=>{store.delete(key);return true}
 });
 for(const name of ['preparePdfPageRecords','schedulePdfImportMirror','commitPdfPageRecords'])vm.runInContext(extractFunction(name),context);
 return {context,original,store,writes,messages,commit:(records=[page(1)])=>context.commitPdfPageRecords(records,original,1)};
}
test('detached import deduplicates repeated rasters and retains previous drawing',()=>{
 const h=boot(),v=h.context.preparePdfPageRecords([page(1),page(2)]);
 assert.equal(v.candidate.devices.length,2);assert.equal(Object.keys(v.candidate.imageAssets).length,1);
 assert.equal(h.original.devices.length,0);assert.equal(v.candidate.devices[0].x-v.candidate.devices[1].x,504);
});
test('invalid PDF page, crop and excessive count fail before mutation',()=>{
 const h=boot();
 for(const bad of [{...page(1),data:'data:text/html;base64,QUJD'},{...page(1),crop:{...crop,w:2}},{...page(1),width:0},{...page(1),page:0}])
  assert.throws(()=>h.context.preparePdfPageRecords([bad]));
 assert.throws(()=>h.context.preparePdfPageRecords(Array.from({length:17},(_,i)=>page(i+1))));
 assert.equal(h.original.devices.length,0);
});
test('aggregate PDF data budget blocks oversized raster before journal',()=>{
 const h=boot();assert.throws(()=>h.context.preparePdfPageRecords([page(1,'data:image/png;base64,'+'A'.repeat(3200000))]),/بودجه/);
 assert.equal(h.writes.length,0);
});
test('invalid candidate is rejected without writing a recovery journal',()=>{
 const h=boot({validateError:true});assert.throws(()=>h.commit(),/invalid candidate/);
 assert.deepEqual(h.writes,[]);assert.equal(h.context.doc,h.original);
});
test('journal creation failure preserves original raw data, editor and history',()=>{
 const h=boot({journal:false});assert.throws(()=>h.commit(),/Journal/);
 assert.equal(h.context.doc,h.original);assert.equal(h.store.get('rd_last'),'prior');
 assert.equal(h.store.has('rd_pending_import'),false);assert.equal(h.context.history.length,0);
});
test('primary quota refusal restores original raw bytes and clears aborted journal',()=>{
 const h=boot({quota:false});assert.throws(()=>h.commit(),/ذخیره اصلی/);
 assert.equal(h.context.doc,h.original);assert.equal(h.store.get('rd_last'),'prior');
 assert.equal(h.store.has('rd_pending_import'),false);assert.equal(h.context.history.length,0);
});
test('commit marker failure rolls back physical drawing and undo history',()=>{
 const h=boot({marker:false});assert.throws(()=>h.commit(),/نشانگر Commit/);
 assert.equal(h.store.get('rd_last'),'prior');assert.equal(h.store.has('rd_pending_import'),false);
 assert.equal(h.context.doc,h.original);assert.equal(h.context.history.length,0);
});
test('render failure leaves all storage untouched',()=>{
 const h=boot({renderError:true});assert.throws(()=>h.commit(),/render failure/);
 assert.equal(h.store.get('rd_last'),'prior');assert.equal(h.writes.length,0);
 assert.equal(h.context.doc,h.original);
});
test('successful PDF commit records a transaction before physical write, and exactly one Undo',async()=>{
 const h=boot();h.commit([page(1),page(2)]);
 const keys=h.writes.map(([key])=>key);
 assert(keys.indexOf('rd_pending_import')>=0);
 assert(keys.indexOf('rd_pending_import')<keys.indexOf('rd_last'));
 assert(keys.indexOf('rd_last')<keys.indexOf('rd_import_committed'));
 assert.equal(h.context.history.length,1);
 const intent=JSON.parse(h.store.get('rd_pending_import'));assert.equal(intent.scope,'pdf');
 assert.equal(JSON.parse(h.store.get('rd_import_committed')).txId,intent.txId);
 await h.context.mirrorQueue;
 assert.equal(h.store.has('rd_pending_import'),false);
 assert.equal(h.store.has('rd_import_committed'),false);
 assert.equal(JSON.parse(h.store.get('rd_last')).devices.length,2);
});
test('mirror failure leaves a recoverable journal and durable primary untouched',async()=>{
 const h=boot({mirror:false});h.commit();await h.context.mirrorQueue;
 assert.equal(JSON.parse(h.store.get('rd_last')).devices.length,1);
 assert.equal(h.store.has('rd_pending_import'),true);
 assert.equal(h.context.manualSaveFailed,true);
});
test('stale epoch refuses import before any write',()=>{
 const h=boot();h.context.documentEpoch=2;assert.throws(()=>h.commit(),/تغییر کرده/);
 assert.equal(h.writes.length,0);
});
test('PDF recovery on startup requires matching PDF transaction ID, not staged bytes alone',()=>{
 assert.match(html,/const pdfIntent=pendingImport\.format===3&&pendingImport\.scope==='pdf'/);
 assert.match(html,/const markerOwnsPdf=pdfIntent&&committed\?\.txId===pendingImport\.txId/);
 assert.match(html,/pdfIntent\?markerOwnsPdf:/);
 assert.match(html,/pdfIntent&&stagedMatches&&!markerOwnsPdf/);
});
test('autosave retains matching PDF transaction ID while its mirror is pending',()=>{
 assert.match(extractFunction('saveAuto'),/priorImportMarker\?\.txId/);
});
test('PDF direct export remains bounded and encodes one JPEG per page',()=>{
 const s=extractFunction('saveDrawingPdf');
 assert.match(s,/canvas\.toBlob/);assert.match(s,/areas\.length>20/);assert.match(s,/maxOutputBytes=32\*1024\*1024/);
 assert.doesNotMatch(s,/images\.push\(/);
});
test('modal enforces aggregate PDF raster and source page budgets',()=>{
 const src=fs.readFileSync('assets/pdf-import.js','utf8');
 assert.match(src,/MAX_PDF_IMPORT_DATA_CHARS=3000000/);
 assert.match(src,/enforcePdfImportBudget\(order\.length,usedChars,data\.length\)/);
 assert.match(src,/MAX_PDF_SOURCE_PAGES=500/);
});

