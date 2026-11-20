'use strict';
// Regression scenarios authored only. Project policy forbids running tests/build during this remediation.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {extractFunction}=require('./source-harness.cjs');
const DXF=require('../dxf-engine.js');

function transform(point,d){
 let x=point.x-d.x,y=point.y-d.y;
 if(d.flipX)x=-x;if(d.flipY)y=-y;
 const angle=(Number(d.rotation)||0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return {x:d.x+x*c-y*s,y:d.y+x*s+y*c};
}
function outline(d){
 const x=d.x,y=d.y,hw=d.w/2,hh=d.h/2;
 return [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([dx,dy])=>transform({x:x+dx,y:y+dy},d));
}
function device(kind,extra={}){
 return {id:'d1',kind,x:150,y:90,w:100,h:40,rotation:0,ports:[],layerId:'cad',showLabel:false,...extra};
}
function boot(devices=[],walls=[]){
 const doc={name:'fixture',devices,walls,cables:[],layers:[{id:'cad',name:'DXF | Furnishings',visible:true}],activeLayer:'cad'};
 const context=vm.createContext({
  doc,SvgEngine:{transform},deviceOutlinePoints:outline,layerVisible:x=>x.visible!==false,
  deviceVisibleOnCanvas:x=>x.visible!==false,effectiveArtwork:()=>null,deviceArtwork:()=>null
 });
 vm.runInContext(extractFunction('buildDXF'),context);
 return {doc,context,export:()=>context.buildDXF()};
}
function close(a,b){return Math.abs(a-b)<1e-7}
function samePoint(a,b){return close(a.x,b.x)&&close(a.y,b.y)}
function sameLine(a,b,c,d){return samePoint(a,c)&&samePoint(b,d)||samePoint(a,d)&&samePoint(b,c)}
test('native converted CAD door retains source line endpoints, original layer, flip and rotation',()=>{
 const d=device('door',{rotation:90,flipX:true,dxfGeometry:[[.1,.25,.9,.25],[.9,.25,.9,.75]]});
 const h=boot([d]),raw=h.export(),parsed=DXF.parse(raw);
 assert.equal(parsed.segments.length,2,'no fabricated door arc or rectangular fallback');
 assert(parsed.segments.every(s=>s.layer==='Furnishings'));
 const expected=[[{x:160,y:130},{x:160,y:50}],[{x:160,y:50},{x:140,y:50}]];
 for(const [a,b] of expected)assert(parsed.segments.some(s=>sameLine(s.a,s.b,a,b)),'CAD endpoints did not preserve object transform');
});
test('malformed CAD source segments fail closed instead of exporting fake outline',()=>{
 const d=device('door',{dxfGeometry:[[0,0,NaN,1]]}),h=boot([d]),before=JSON.stringify(h.doc);
 assert.throws(()=>h.export(),/invalid CAD source segment/);
 assert.equal(JSON.stringify(h.doc),before);
});
test('non-CAD objects keep existing vector outline fallback',()=>{
 const h=boot([device('custom')]);assert.equal(DXF.parse(h.export()).segments.length,4);
});
test('raster/PDF images never emit misleading placeholder geometry in DXF',()=>{
 const raster=device('image',{imageAssetId:'pdf-1',name:'PDF page'}),wall={layerId:'cad',a:{x:0,y:0},b:{x:10,y:0}};
 const h=boot([raster],[wall]),parsed=DXF.parse(h.export());
 assert.equal(parsed.segments.length,1);assert.equal(parsed.segments[0].layer,'Furnishings');
});
function saveHarness({accepted=true,visible=true}={}){
 const state={prompts:[],saves:[],messages:[],builds:0};
 const raster=device('image',{visible,name:'PDF page',imageAssetId:'pdf'});
 const context=vm.createContext({
  doc:{name:'fixture',devices:[raster]},deviceVisibleOnCanvas:d=>d.visible!==false,
  window:{confirm:message=>{state.prompts.push(message);return accepted}},
  buildDXF:()=>{state.builds++;return 'VECTOR DXF';},
  file:async(data,name,type)=>{state.saves.push({data,name,type});return true},
  notify:message=>state.messages.push(message),console
 });
 vm.runInContext(extractFunction('downloadDXF'),context);
 return {context,state};
}
test('declining raster loss aborts DXF before build, picker or download',async()=>{
 const h=saveHarness({accepted:false});assert.equal(await h.context.downloadDXF(),false);
 assert.equal(h.state.prompts.length,1);assert.match(h.state.prompts[0],/Raster/);
 assert.deepEqual(h.state.saves,[]);assert.equal(h.state.builds,0);
});
test('accepting raster loss produces only the prepared vector file once',async()=>{
 const h=saveHarness();assert.equal(await h.context.downloadDXF(),true);
 assert.equal(h.state.prompts.length,1);assert.match(h.state.prompts[0],/PDF/);
 assert.equal(h.state.builds,1);assert.equal(h.state.saves.length,1);
 assert.equal(h.state.saves[0].data,'VECTOR DXF');
});
test('hidden raster objects do not trigger a misleading export warning',async()=>{
 const h=saveHarness({visible:false});assert.equal(await h.context.downloadDXF(),true);
 assert.equal(h.state.prompts.length,0);assert.equal(h.state.saves.length,1);
});
test('DXF build errors prevent opening a save destination or downloading a partial file',async()=>{
 const h=saveHarness({visible:false});h.context.buildDXF=()=>{throw Error('bad CAD geometry')};
 assert.equal(await h.context.downloadDXF(),false);
 assert.equal(h.state.saves.length,0);assert.match(h.state.messages.at(-1),/bad CAD geometry/);
});
