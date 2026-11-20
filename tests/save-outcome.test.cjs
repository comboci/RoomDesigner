'use strict';
// Save-result semantics regression source. NOT_RUN per audit/regression/POLICY.md.
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {extractFunction}=require('./source-harness.cjs');
function harness({picker=false,abort=false}={}){
 const notices=[],clicks=[];
 const ctx=vm.createContext({
  Blob,
  window:{...(picker?{showSaveFilePicker:async()=>{if(abort)throw Object.assign(Error('cancel'),{name:'AbortError'});return{createWritable:async()=>({write:async()=>{},close:async()=>{},abort:async()=>{}})}}}:{})},
  URL:{createObjectURL:()=> 'blob:mock',revokeObjectURL:()=>{}},
  document:{body:{append:()=>{}},createElement:()=>({click:()=>clicks.push('clicked'),remove:()=>{}})},
  setTimeout:()=>{},notify:s=>notices.push(s)
 });
 vm.runInContext(extractFunction('file'),ctx);
 return {ctx,notices,clicks};
}
test('file picker write and close are the only confirmed-save result',async()=>{
 const h=harness({picker:true}),out=await h.ctx.file('a','name.nrd');
 assert.equal(out,true);assert.match(h.notices.at(-1),/واقعاً/);
});
test('anchor download returns requested without claiming physical persistence',async()=>{
 const h=harness(),out=await h.ctx.file('a','name.nrd');
 assert.equal(out,'requested');assert.equal(h.clicks.length,1);
 assert.match(h.notices.at(-1),/درخواست دانلود/);
});
test('picker cancellation does not initiate browser download',async()=>{
 const h=harness({picker:true,abort:true}),out=await h.ctx.file('a','name.nrd');
 assert.equal(out,false);assert.equal(h.clicks.length,0);
});
test('PDF download and DXF messages distinguish confirmed files from requests',()=>{
 const index=fs.readFileSync('index.html','utf8');
 assert.match(index,/return 'requested'/);assert.match(index,/ok===true\?'PDF/);
 assert.match(index,/result===true\?'فایل DXF/);
});

