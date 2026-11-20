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


test('emergency backup awaits the picker or browser-download request without premature success',()=>{
 const source=fs.readFileSync('index.html','utf8');
 const backup=source.match(/\$\('backupNow'\)\.onclick=async\(\)=>\{([\s\S]*?)\};\$\('selectTool'\)/);
 assert.ok(backup,'emergency backup handler must be asynchronous');
 assert.match(backup[1],/await file\(/);
 assert.doesNotMatch(backup[1],/فایل خروجی نقشه آماده شد/);
});
test('error log export relies on file result messages instead of treating requested as saved',()=>{
 const source=fs.readFileSync('index.html','utf8');
 const body=source.match(/async function exportErrorLog\(\)\{([\s\S]*?)\n\}/);
 assert.ok(body);
 assert.match(body[1],/await file\(/);
 assert.doesNotMatch(body[1],/فایل لاگ خطاها آماده شد/);
});
