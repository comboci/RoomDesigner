/* No drawing bytes leave this worker. Vendor files are served from this site. */
import init,{convertDwgToDxf} from './vendor/dwgdxf/dwgdxf.js';
const MAX_DWG_INPUT_BYTES=25*1024*1024,MAX_DXF_OUTPUT_BYTES=80*1024*1024;
self.onmessage=async event=>{
 let stage='input';
 try{
  if(!(event.data instanceof ArrayBuffer)||event.data.byteLength===0)throw Error('ورودی DWG نامعتبر است.');
  if(event.data.byteLength>MAX_DWG_INPUT_BYTES){stage='input-limit';throw Error('DWG از سقف سخت ۲۵ MiB فراتر رفت.');}
  stage='initialization';await init();
  stage='conversion';
  const bytes=convertDwgToDxf(new Uint8Array(event.data));
  if(!bytes.length||!Number.isSafeInteger(bytes.length))throw Error('خروجی DXF معتبر نیست.');
  if(bytes.byteLength>MAX_DXF_OUTPUT_BYTES){stage='output-limit';throw Error('خروجی DXF از سقف سخت ۸۰ MiB بیشتر است.');}
  // Copy the exact view: WASM-owned buffers may be shared, offset or non-transferable.
  const output=new Uint8Array(bytes.length);
  output.set(bytes);
  self.postMessage({bytes:output},[output.buffer]);
 }catch(error){self.postMessage({error:String(error?.message||error||'خطای نامشخص'),stack:error?.stack||null,stage})}
};
