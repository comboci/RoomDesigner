'use strict';
// Source scenarios only; NOT_RUN under audit/regression/POLICY.md.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {html,extractFunction}=require('./source-harness.cjs');
const A='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const B='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>';
function harness({published={},local={},deny=false}={}){
 const draft={symbols:Object.keys(local).map(id=>({id,version:1,name:id,category:'custom'})),assets:{...local},map:{device:'shared'}};
 const storage=new Map([['rd_svg_drafts',JSON.stringify(draft)]]);let next=0,ctx;
 ctx=vm.createContext({svgDrafts:draft,svgLibrary:{assets:{...published}},SvgLibraryBuiltin:{assets:{...published}},EquipmentCatalogBuiltin:{iconAliases:{}},svgReferenceCache:new Map(),structuredClone,
  svgArtwork:raw=>typeof raw==='string'&&raw.startsWith('<svg ')?raw:null,SvgEngine:{parse:()=>({documentElement:{getAttribute:()=> '0 0 10 10'}})},
  safeStorage:{getItem:k=>storage.get(k)??null,setItem(k,v){if(deny)return false;storage.set(k,v);return true}},
  libraryAsset:id=>ctx.svgDrafts.assets[id]||ctx.svgLibrary.assets[id],
  libraryEntries:()=>ctx.svgDrafts.symbols,svgTypeOptions:()=>['device'],
  libraryDefault:type=>({id:ctx.svgDrafts.map[type]}),uid:()=> 'x'+(++next)
 });
 vm.runInContext(['normalizeSvgReferences','commitSvgDrafts','saveLibrarySvgVersion','roomSvgReferenceIds'].map(extractFunction).join('\n'),ctx);
 return {ctx,storage};
}
test('inline published artwork cannot be replaced by a different local shadow',()=>{
 const {ctx,storage}=harness({published:{shared:A},local:{shared:B}}),item={svg:A};
 ctx.normalizeSvgReferences(item);
 assert.notEqual(item.svgAssetId,'shared');assert.equal(ctx.libraryAsset(item.svgAssetId),A);
 assert.equal(JSON.parse(storage.get('rd_svg_drafts')).assets[item.svgAssetId],A);
 assert.equal(ctx.libraryAsset('shared'),B);assert.equal(Object.hasOwn(item,'svg'),false);
});
test('rejected draft write leaves inline artwork, prior live registry and prior stored bytes intact',()=>{
 const {ctx,storage}=harness({deny:true}),item={svg:A},before=storage.get('rd_svg_drafts');
 assert.throws(()=>ctx.normalizeSvgReferences(item));assert.equal(item.svg,A);assert.equal(item.svgAssetId,undefined);
 assert.equal(JSON.stringify(ctx.svgDrafts),before);assert.equal(storage.get('rd_svg_drafts'),before);
});
test('ordinary normalization never rewrites historical inline artwork',()=>{
 const {ctx}=harness({published:{shared:A}}),revision={number:1,snapshot:{devices:[{svg:B,svgAssetId:'shared'}]}},before=JSON.stringify(revision);
 const doc={devices:[{svg:A}],revisions:[revision]};ctx.normalizeSvgReferences(doc);
 assert.equal(doc.devices[0].svgAssetId,'shared');assert.equal(JSON.stringify(revision),before);
 const onlyHistory={devices:[],revisions:[revision]};assert.equal(ctx.roomSvgReferenceIds(onlyHistory).size,0,'stale ID is not required when original inline SVG is carried');
});
test('resolution is recomputed after the effective library changes',()=>{
 const {ctx}=harness({published:{shared:A}}),first={svg:A};ctx.normalizeSvgReferences(first);
 assert.equal(first.svgAssetId,'shared');ctx.svgLibrary.assets.shared=B;
 const second={svg:A};ctx.normalizeSvgReferences(second);assert.notEqual(second.svgAssetId,'shared');
 assert.equal(ctx.libraryAsset(second.svgAssetId),A);
});
test('library edit creates a versioned ID and changes only future default assignments',()=>{
 const {ctx,storage}=harness({local:{shared:A}}),id=ctx.saveLibrarySvgVersion('shared',B,[0,0,10,10]);
 assert.notEqual(id,'shared');assert.equal(ctx.libraryAsset('shared'),A);assert.equal(ctx.libraryAsset(id),B);
 assert.equal(ctx.svgDrafts.map.device,id);assert.equal(ctx.svgDrafts.symbols.find(e=>e.id===id).version,2);
 assert.equal(JSON.parse(storage.get('rd_svg_drafts')).assets.shared,A);
});
test('failed library edit leaves old symbol, assignment and registry unchanged',()=>{
 const {ctx,storage}=harness({local:{shared:A},deny:true}),before=storage.get('rd_svg_drafts');
 assert.throws(()=>ctx.saveLibrarySvgVersion('shared',B,[0,0,10,10]));
 assert.equal(JSON.stringify(ctx.svgDrafts),before);assert.equal(storage.get('rd_svg_drafts'),before);
});
test('startup migration avoids direct document writes and explicit restore stages resources on a copy',()=>{
 const migrate=extractFunction('migrateSvgReferenceStorage');
 assert.match(migrate,/recoveryJournalPending\(\).*recoveryWritesBlocked/);
 assert.doesNotMatch(migrate,/safeStorage\.setItem/);
 assert.match(html,/const snap=structuredClone\(rev\.snapshot\)/);
 assert.match(html,/if\(prepared\.nextSvgDrafts\)commitSvgDrafts\(prepared\.nextSvgDrafts\);checkpoint\(\)/);
 assert.match(extractFunction('snapshot'),/equipmentRelease:d\.equipmentRelease\|\|RoomEquipment\.release/);
 const prepare=extractFunction('prepareRoomImport');assert.ok(prepare.indexOf('if(envelope)stagePortableRoomSvg')<prepare.indexOf('normalizeSvgReferences(importedDoc'),'portable references are remapped before inline SVG conversion');
});
