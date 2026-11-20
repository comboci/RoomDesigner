'use strict';
// Authored static regression scenarios only; no Test/Build executed for V398-R.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const codec=require('../assets/dxf-encoding.js');
function header(codepage){return Buffer.from('0\nSECTION\n2\nHEADER\n9\n$DWGCODEPAGE\n3\n'+codepage+'\n0\nENDSEC\n','ascii')}
test('explicit DWGCODEPAGE ANSI_1256 chooses Windows Arabic encoding and preserves name',()=>{
 const data=Buffer.concat([header('ANSI_1256'),Buffer.from([50,10,0xc7,10])]);
 const result=codec.decode(data);
 assert.equal(result.info.encoding,'windows-1256');
 assert.equal(result.info.declared,'ANSI_1256');
 assert.match(result.text,/\u0627/);
});
test('ANSI_1252 header is decoded without silent UTF-8 replacement',()=>{
 const data=Buffer.concat([header('ANSI_1252'),Buffer.from([0xe9,10])]);
 const result=codec.decode(data);
 assert.equal(result.info.encoding,'windows-1252');assert.match(result.text,/é/);
});
test('unknown non-ASCII codepage stops until manual choice is made',()=>{
 const data=Buffer.concat([header('DOS9999'),Buffer.from([0xc7,10])]);
 assert.equal(codec.inspect(data).needsChoice,true);
 assert.throws(()=>codec.decode(data),/Encoding/);
 assert.equal(codec.decode(data,'windows-1256').info.explicit,true);
});
test('undocumented non-ASCII DXF is never silently decoded',()=>{
 const data=Buffer.from([48,10,0xe9,10]);
 assert.equal(codec.inspect(data).needsChoice,true);
 assert.throws(()=>codec.decode(data),/Encoding/);
});
test('known UTF-8 with malformed byte throws rather than inserting replacement glyph',()=>{
 const data=Buffer.concat([header('UTF-8'),Buffer.from([0xff,10])]);
 assert.throws(()=>codec.decode(data),/سازگار/);
});
test('UTF-8 BOM has priority over an ANSI header',()=>{
 const data=Buffer.concat([Buffer.from([239,187,191]),header('ANSI_1252'),Buffer.from('é','utf8')]);
 const result=codec.decode(data);
 assert.equal(result.info.encoding,'utf-8');assert.equal(result.info.hasBom,true);
});
test('crop pointermove updates only overlay while release computes clipped segments',()=>{
 const script=fs.readFileSync(path.join(__dirname,'..','assets','dxf-import.js'),'utf8');
 assert.match(script,/function sync\(recalculate=true\)/);
 assert.match(script,/crop=\{x:Math\.min\(a\.x,p\.x\).*?;sync\(false\)/s);
 assert.match(script,/gesture=null;sync\(\)/);
});
test('DXF importer explicitly declares decoding and selection UI',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const importer=fs.readFileSync(path.join(__dirname,'..','assets','dxf-import.js'),'utf8');
 assert.match(html,/assets\/dxf-encoding\.js\?v=398/);
 assert.match(importer,/data-dxf-encoding/);
 assert.match(importer,/RoomDXFEncoding\.decode\(sourceBytes,encodingSelect\.value\)/);
 assert.match(importer,/declaredCodepage:/);
});

