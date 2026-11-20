'use strict';
// Source-only regression scenarios; RoomDesigner policy forbids executing tests/build here.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
function boot(){
 const dom=new JSDOM('<body><script src="https://test.local/assets/dwg-import.js"></script></body>',{url:'https://test.local',runScripts:'outside-only'}),w=dom.window;
 w.TextDecoder=TextDecoder;w.File=File;w.Blob=Blob;w.URL.createObjectURL=()=> 'blob:mock';w.URL.revokeObjectURL=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const workers=[];w.Worker=class{constructor(){workers.push(this)}postMessage(){}terminate(){this.terminated=true}};
 Object.defineProperty(w.document,'currentScript',{value:w.document.querySelector('script')});
 w.RoomDWGPreview={read:async()=>null};
 w.eval(fs.readFileSync(path.join(root,'assets/dwg-import.js'),'utf8'));
 return {w,workers,close:()=>dom.window.close()};
}
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
test('DWG over 25 MiB stays preview-only without reading the entire file',async()=>{
 const h=boot();try{
  const f=new h.w.File(['AC1027fake'],'big.dwg');Object.defineProperty(f,'size',{value:25*1024*1024+1});
  let fullReads=0;f.arrayBuffer=async()=>{fullReads++;throw Error('whole-file read attempted')};
  const p=h.w.RoomDWGImport.convert(f).catch(e=>e);await pause();
  const button=h.w.document.querySelector('[data-dwg-convert]');
  assert.equal(button.disabled,true);assert.match(h.w.document.querySelector('[data-dwg-warning]').textContent,/۲۵/);
  await button.onclick();await pause();assert.equal(fullReads,0);assert.equal(h.workers.length,0);
  h.w.document.querySelector('[data-dwg-cancel]').click();assert.equal((await p).name,'AbortError');
 }finally{h.close()}
});
test('DWG below size limit retains normal worker path',async()=>{
 const h=boot();try{
  const p=h.w.RoomDWGImport.convert(new h.w.File(['AC1027small'],'valid.dwg'));await pause();
  const b=h.w.document.querySelector('[data-dwg-convert]');assert.equal(b.disabled,false);
  await b.onclick();await pause();assert.equal(h.workers.length,1);
  h.workers[0].onmessage({data:{bytes:new h.w.Uint8Array([48,10])}});
  assert.equal((await p).name,'valid.dxf');
 }finally{h.close()}
});
test('oversized DXF message is rejected without constructing File',async()=>{
 const h=boot();try{
  const p=h.w.RoomDWGImport.convert(new h.w.File(['AC1027small'],'valid.dwg')).catch(e=>e);await pause();
  await h.w.document.querySelector('[data-dwg-convert]').onclick();await pause();
  const result=new h.w.Uint8Array([48,10]);Object.defineProperty(result,'byteLength',{value:80*1024*1024+1});
  h.workers[0].onmessage({data:{bytes:result}});
  assert.match(h.w.document.querySelector('[data-dwg-status]').textContent,/۸۰/);
  assert.equal(h.w.document.querySelector('[data-dwg-convert]').disabled,true);
  h.w.document.querySelector('[data-dwg-cancel]').click();assert.equal((await p).name,'AbortError');
 }finally{h.close()}
});
test('worker guards input before WASM and output before extra copy',()=>{
 const source=fs.readFileSync(path.join(root,'assets/dwg-worker.mjs'),'utf8');
 assert(source.indexOf('event.data.byteLength>MAX_DWG_INPUT_BYTES')<source.indexOf('await init()'));
 assert(source.indexOf('bytes.byteLength>MAX_DXF_OUTPUT_BYTES')<source.indexOf('const output=new Uint8Array(bytes.length)'));
});

