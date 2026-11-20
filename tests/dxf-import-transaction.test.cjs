'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {extractFunction}=require('./source-harness.cjs');

function fixture(){
 return {segments:[
  {a:{x:0,y:0},b:{x:10,y:0},layer:'walls',shapeId:'s1'},
  {a:{x:10,y:0},b:{x:10,y:5},layer:'walls',shapeId:'s1'},
  {a:{x:20,y:0},b:{x:30,y:0},layer:'furniture',shapeId:'s2'},
  {a:{x:30,y:0},b:{x:30,y:5},layer:'furniture',shapeId:'s2'}
 ],factor:1,group:true,preserveLayers:true,objects:[]};
}
function harness({failRender=false,failBoundsAt=0,failValidation=false}={}){
 const original={id:'existing-room',schema:'room-designer/v0.3',name:'existing',
  devices:[],cables:[],walls:[{id:'prior-wall',layerId:'main',a:{x:1,y:1},b:{x:2,y:2}}],
  layers:[{id:'main',name:'main',visible:true}],activeLayer:'main'};
 const before=JSON.stringify(original),oldSelection={kind:'wall',id:'prior-wall'};
 const oldView={x:0,y:0,w:960,h:680},oldHistory=['older-state'],oldRedo=['redo-state'];
 const count={bounds:0,render:0,save:0,close:0,notify:0,clear:0,history:0},notes=[];
 let nextId=0;
 const scope=vm.createContext({
  doc:original,view:oldView,selection:oldSelection,multiSelection:null,
  history:oldHistory,redoHistory:oldRedo,documentEpoch:7,drawingChangedSinceStartup:false,
  persistTimer:null,drag:null,wireDrag:null,wallGesture:null,polyPreview:null,cableGesture:null,
  svg:{getBoundingClientRect:()=>({width:960,height:680})},
  window:{
   RoomDXF:{bounds(lines){count.bounds++;if(failBoundsAt===count.bounds)throw Error('injected bounds failure');
    const points=lines.flatMap(s=>[s.a,s.b]);const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const x=Math.min(...xs),y=Math.min(...ys);return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
   }},
   RoomDXFObjects:{kinds:{door:'Door',table:'Table'}}
  },
  structuredClone,uid:()=> 'imported-'+(++nextId),
  validateRoomDocument(d){if(failValidation)throw Error('injected validation failure');assert(Array.isArray(d.layers));return d},
  trimHistory(stack){if(stack.length>60)stack.splice(0,stack.length-60)},
  clearPointerState(){count.clear++},
  render(){count.render++;if(failRender&&scope.doc!==original)throw Error('injected render failure')},
  updateHistoryControls(){count.history++},
  scheduleSave(){count.save++;scope.documentEpoch++;scope.drawingChangedSinceStartup=true},
  close(){count.close++},
  notify(message){count.notify++;notes.push(message)},
  setTimeout:()=>123,clearTimeout:()=>{}
 });
 vm.runInContext(extractFunction('applyRoomDXFGeometry'),scope);
 return {scope,count,notes,original,before,oldSelection,oldView,oldHistory,oldRedo};
}
function assertUnchanged(h){
 assert.equal(h.scope.doc,h.original);
 assert.equal(JSON.stringify(h.original),h.before);
 assert.equal(h.scope.selection,h.oldSelection);
 assert.equal(h.scope.view,h.oldView);
 assert.equal(h.scope.history,h.oldHistory);
 assert.equal(h.scope.redoHistory,h.oldRedo);
 assert.equal(h.scope.documentEpoch,7);
 assert.equal(h.scope.drawingChangedSinceStartup,false);
 assert.equal(h.count.save,0);
 assert.equal(h.count.close,0);
}
test('DXF prevalidation error never touches live document, history or autosave',()=>{
 const h=harness({failValidation:true});
 assert.throws(()=>h.scope.applyRoomDXFGeometry(fixture()),/injected validation failure/);
 assertUnchanged(h);
 assert.equal(h.count.render,0);
});
test('DXF object conversion failing during staging never modifies live document',()=>{
 const h=harness({failBoundsAt:2});
 const plan=fixture();plan.objects=[
  {kind:'door',indices:[0,1],rotation:0},{kind:'table',indices:[2,3],rotation:0}
 ];
 assert.throws(()=>h.scope.applyRoomDXFGeometry(plan),/injected bounds failure/);
 assertUnchanged(h);
 assert.equal(h.count.render,0);
});
test('DXF render failure restores old document, selection, view and undo/redo',()=>{
 const h=harness({failRender:true});
 assert.throws(()=>h.scope.applyRoomDXFGeometry(fixture()),/injected render failure/);
 assertUnchanged(h);
 assert.equal(h.count.render,2,'failed next render and best-effort old render');
});
test('successful DXF conversion commits once, appends one undo and schedules one save',()=>{
 const h=harness();const plan=fixture();
 h.scope.applyRoomDXFGeometry(plan);
 assert.notEqual(h.scope.doc,h.original);
 assert.equal(JSON.stringify(h.original),h.before);
 assert.equal(h.scope.doc.walls.length,5);
 assert.equal(h.scope.doc.layers.length,3);
 assert.equal(h.scope.history.length,2);
 assert.equal(h.scope.history[1],h.before);
 assert.equal(h.scope.redoHistory.length,0);
 assert.equal(h.scope.selection.kind,'group');
 assert.equal(h.count.save,1);
 assert.equal(h.count.close,1);
 assert.equal(h.count.notify,1);
 assert.equal(h.count.render,1);
});
