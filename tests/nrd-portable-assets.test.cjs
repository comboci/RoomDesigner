'use strict';
// Authored regression coverage only: policy prohibits running tests during source remediation.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {extractFunction}=require('./source-harness.cjs');
const funcs=['mirrorChecksum','normalizeSvgReferences','roomSvgReferenceIds','buildPortableRoomEnvelope',
 'stagePortableRoomSvg','prepareRoomImport','applyRoomImport','validRecoveryJournal']
 .map(extractFunction).join('\n');
const svgA='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const svgB='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>';
const svgC='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 9"/></svg>';
function drawing(name,ref='my-svg'){
 return {schema:'room-designer/v0.3',connectionModel:'physical-connections-1',equipmentRelease:'lighting-equipment-1',
  id:name,name,devices:[{id:'device',kind:'custom',name:'Custom',svgAssetId:ref,ports:[]}],
  cables:[],walls:[],layers:[{id:'main',name:'Main',visible:true}],activeLayer:'main'};
}
function harness({local={},published={},current=drawing('current','stock-svg'),failWrite=null}={}){
 const storage=new Map(),writes=[],notices=[];
 let failureCount=0,ctx;
 const drafts={symbols:Object.keys(local).map(id=>({id,name:id,category:'custom',viewBox:'0 0 10 10',version:1})),assets:{...local},map:{}};
 storage.set('rd_svg_drafts',JSON.stringify(drafts));
 storage.set('rd_last',JSON.stringify(current));
 ctx=vm.createContext({
  Map,Set,JSON,Array,Math,Number,Object,Error,String,structuredClone,
  doc:current,types:{ethernet:{name:'Ethernet',color:'#123456'}},catalog:[{name:'Device',kind:'custom',ports:[]}],
  svgDrafts:drafts,svgLibrary:{assets:{...published}},SvgLibraryBuiltin:{assets:{...published},manifest:{symbols:[]}},
  EquipmentCatalogBuiltin:{iconAliases:{}},svgReferenceCache:new Map(),
  SvgEngine:{parse:()=>({documentElement:{getAttribute:()=> '0 0 10 10'}})},
  svgArtwork:svg=>typeof svg==='string'&&svg.startsWith('<svg ')&&!/<script|onload=|foreignObject/i.test(svg)?svg:null,
  libraryAsset:id=>ctx.svgDrafts.assets[id]||ctx.svgLibrary.assets[id]||ctx.SvgLibraryBuiltin.assets[id],
  libraryEntries:()=>ctx.svgDrafts.symbols,
  safeStorage:{
   getItem:key=>storage.get(key)??null,
   setItem(key,value){writes.push([key,value]);if(key===failWrite&&failureCount++===0)return false;storage.set(key,String(value));return true},
   removeItem(key){writes.push([key,null]);storage.delete(key);return true}
  },
  RoomConnections:{version:'physical-connections-1',normalizeTypes:x=>x,resetDocument:x=>x,
   resetCatalog:x=>x,types:()=>({ethernet:{name:'Ethernet',color:'#123456'}})},
  RoomEquipment:{release:'lighting-equipment-1',cleanDocument:x=>x,cleanCatalog:x=>x,
   defaults:()=>[],isArchitecture:()=>false},
  defaults:{ethernet:{name:'Ethernet',color:'#123456'}},
  validateRoomDocument:value=>{
   if(!value||!Array.isArray(value.devices)||!Array.isArray(value.cables))throw Error('invalid drawing');
   return value
  },
  selection:{kind:'device',id:'device'},multiSelection:null,history:['prior'],redoHistory:['redo'],
  drag:null,wallGesture:null,wallStart:null,polyPreview:null,start:null,routePoints:[],previewPoint:null,
  cableGesture:null,tool:'select',resizeMode:false,persistTimer:1,
  documentEpoch:0,drawingChangedSinceStartup:false,mirrorGeneration:0,mirrorSaveOk:true,
  mirrorQueue:Promise.resolve(),manualSaveFailed:false,recoveryWritesBlocked:false,
  recoveryJournalPending:()=>storage.has('rd_pending_import')||storage.has('rd_pending_revision'),
  clearRecoveryJournal:key=>{storage.delete(key);return true},
  saveAuto:()=>{storage.set('rd_last',JSON.stringify(ctx.doc));return true},
  populateDesktopToolbox:()=>{},setTool:()=>{},updateHistoryControls:()=>{},
  render:()=>{},clearPointerState:()=>{},clearTimeout:()=>{},close:()=>{},
  persistenceStatus:()=>{},notify:message=>notices.push(message)
 });
 vm.runInContext(funcs,ctx);
 return {ctx,storage,writes,notices};
}
const copy=obj=>JSON.parse(JSON.stringify(obj));
test('portable NRD embeds exact referenced custom, published, original and revision SVG resources',()=>{
 const doc=drawing('exported');doc.devices[0].svgOriginalAssetId='stock-svg';
 doc.revisions=[{number:1,snapshot:drawing('previous','revised-svg')}];
 const h=harness({local:{'my-svg':svgA,'revised-svg':svgC},published:{'stock-svg':svgB},current:doc});
 const bundle=copy(h.ctx.buildPortableRoomEnvelope());
 assert.equal(bundle.format,'roomdesigner-portable/v1');
 assert.deepEqual(bundle.assets.svg.map(x=>x.id).sort(),['my-svg','revised-svg','stock-svg']);
 for(const entry of bundle.assets.svg){
  assert.equal(entry.length,entry.svg.length);
  assert.equal(entry.checksum,h.ctx.mirrorChecksum(entry.svg));
 }
});
test('fresh browser stages portable SVGs, imports and saves without changing existing assets',()=>{
 const a=harness({local:{'my-svg':svgA}}),bundle=copy(a.ctx.buildPortableRoomEnvelope());
 const b=harness({local:{},current:drawing('before','stock-svg')});
 const before=b.storage.get('rd_svg_drafts');
 const candidate=b.ctx.prepareRoomImport(copy(bundle));
 assert.equal(b.storage.get('rd_svg_drafts'),before,'preflight never writes to storage');
 assert.equal(b.ctx.svgDrafts.assets['my-svg'],undefined,'preflight never mutates active drafts');
 assert.equal(candidate.nextSvgDrafts.assets['my-svg'],svgA);
 b.ctx.applyRoomImport(candidate);
 assert.equal(b.ctx.doc.devices[0].svgAssetId,'my-svg');
 assert.equal(b.ctx.svgDrafts.assets['my-svg'],svgA);
 assert.equal(JSON.parse(b.storage.get('rd_svg_drafts')).assets['my-svg'],svgA);
 assert.equal(b.ctx.history.length,0);
});
test('existing different SVG ID is preserved and imported references including revisions are remapped',()=>{
 const original=drawing('from');original.revisions=[{number:1,snapshot:drawing('rev')}];
 const src=harness({local:{'my-svg':svgA},current:original});
 const incoming=copy(src.ctx.buildPortableRoomEnvelope());
 const dest=harness({local:{'my-svg':svgB},current:drawing('safe')});
 const candidate=dest.ctx.prepareRoomImport(incoming);
 const id=candidate.doc.devices[0].svgAssetId;
 assert.notEqual(id,'my-svg');
 assert.match(id,/^portable-svg-/);
 assert.equal(candidate.doc.revisions[0].snapshot.devices[0].svgAssetId,id);
 assert.equal(dest.ctx.svgDrafts.assets['my-svg'],svgB);
 dest.ctx.applyRoomImport(candidate);
 assert.equal(dest.ctx.svgDrafts.assets['my-svg'],svgB);
 assert.equal(dest.ctx.svgDrafts.assets[id],svgA);
});
test('tampered checksum, missing assets, unsafe svg and duplicate identifiers reject without writes',()=>{
 const h=harness({local:{'my-svg':svgA}}),bundle=copy(h.ctx.buildPortableRoomEnvelope());
 const variants=[];
 const checksum=copy(bundle);checksum.assets.svg[0].checksum='ffffffff';variants.push(checksum);
 const absent=copy(bundle);absent.assets.svg=[];variants.push(absent);
 const unsafe=copy(bundle);unsafe.assets.svg[0].svg='<svg onload="alert(1)"></svg>';unsafe.assets.svg[0].length=unsafe.assets.svg[0].svg.length;unsafe.assets.svg[0].checksum=h.ctx.mirrorChecksum(unsafe.assets.svg[0].svg);variants.push(unsafe);
 const duplicate=copy(bundle);duplicate.assets.svg.push(copy(duplicate.assets.svg[0]));variants.push(duplicate);
 for(const record of variants){
  const fresh=harness({local:{}}),before=JSON.stringify(fresh.ctx.doc);
  assert.throws(()=>fresh.ctx.prepareRoomImport(record),/بسته SVG/);
  assert.equal(JSON.stringify(fresh.ctx.doc),before);
  assert.equal(fresh.writes.length,0);
  assert.equal(fresh.ctx.svgDrafts.assets['my-svg'],undefined);
 }
});
test('failure writing imported document rolls back staged SVG and leaves current drawing intact',()=>{
 const src=harness({local:{'my-svg':svgA}}),bundle=copy(src.ctx.buildPortableRoomEnvelope());
 const h=harness({local:{'stock-svg':svgB},current:drawing('old','stock-svg'),failWrite:'rd_last'});
 const beforeDoc=JSON.stringify(h.ctx.doc),beforeDrafts=h.storage.get('rd_svg_drafts');
 const candidate=h.ctx.prepareRoomImport(copy(bundle));
 assert.throws(()=>h.ctx.applyRoomImport(candidate),/ناموفق/);
 assert.equal(JSON.stringify(h.ctx.doc),beforeDoc);
 assert.equal(h.storage.get('rd_svg_drafts'),beforeDrafts);
 assert.equal(h.ctx.svgDrafts.assets['my-svg'],undefined);
 assert.equal(h.storage.has('rd_pending_import'),false,'completed rollback clears import journal');
});
test('legacy NRD without portable asset section remains importable',()=>{
 const h=harness({local:{'stock-svg':svgB},current:drawing('old','stock-svg')});
 const legacy={doc:drawing('legacy','stock-svg'),types:{ethernet:{name:'Ethernet',color:'#123456'}},catalog:[]};
 const candidate=h.ctx.prepareRoomImport(legacy);
 assert.equal(candidate.svgDraftsJSON,null);
 h.ctx.applyRoomImport(candidate);
 assert.equal(h.ctx.doc.id,'legacy');
 assert.equal(h.ctx.svgDrafts.assets['stock-svg'],svgB);
});
test('version 3 import journal allows SVG key with checksums while old schema refuses it',()=>{
 const h=harness({local:{}});
 const journal={format:3,previous:[['rd_svg_drafts',null],['rd_last',null]],
  expected:[['rd_svg_drafts','12345678'],['rd_last','abcdef01']]};
 assert.equal(h.ctx.validRecoveryJournal(journal,'import'),true);
 assert.equal(h.ctx.validRecoveryJournal({...journal,format:2},'import'),false);
});
test('startup rollback refreshes the in-memory SVG resolver after restoring rd_svg_drafts',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const section=source.slice(source.indexOf('if(recoveredImport){'),source.indexOf('else{recoveryIncomplete=true;manualSaveFailed=true;notify',source.indexOf('if(recoveredImport){')));
 assert.match(section,/pendingImport\.previous\.some\(\(\[key\]\)=>key==='rd_svg_drafts'\)/);
 assert.match(section,/svgDrafts=restored;svgReferenceCache\.clear\(\)/);
});
