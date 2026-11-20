'use strict';
// V398-R regression source only; prohibited to execute tests/build in this cycle.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {extractFunction}=require('./source-harness.cjs');
function testContext(){
 const original={devices:[],walls:[],cables:[],imageAssets:{},layers:[{id:'main',name:'Main',visible:true}],activeLayer:'main'};
 let seq=0;const ctx=vm.createContext({doc:original,structuredClone,uid:()=>String(++seq),placeNewDevice:d=>{d.x=100;d.y=100},validateRoomDocument:d=>d});
 vm.runInContext(extractFunction('preparePdfPageRecords'),ctx);
 return {ctx,original};
}
const basic={data:'data:image/png;base64,QUJD',width:500,height:250,page:1,fileName:'site.pdf',crop:{x:.2,y:0,w:.5,h:1}};
test('uncalibrated PDF stays an explicitly labeled raster reference at legacy 480',()=>{
 const h=testContext(),out=h.ctx.preparePdfPageRecords([basic]);
 assert.equal(out.candidate.devices[0].w,480);
 assert.equal(out.candidate.devices[0].pdfSource.calibration.mode,'uncalibrated');
 assert.equal(out.candidate.devices[0].pdfSource.calibration.referenceWidth,480);
});
test('two reference points and known cm define actual physical dimensions for a cropped raster',()=>{
 const h=testContext(),calibration={mode:'two-point',knownCm:200,start:{x:0,y:0},end:{x:.5,y:0},sourceWidth:1000,sourceHeight:500,cmPerPixel:.4};
 const out=h.ctx.preparePdfPageRecords([{...basic,calibration}]),d=out.candidate.devices[0];
 assert.equal(d.w,200);assert.equal(d.h,100);
 assert.equal(d.pdfSource.calibration.knownCm,200);
 assert.equal(out.candidate.imageAssets[d.imageAssetId].width,500);
});
test('wrong distance-to-scale metadata fails without modifying live drawing',()=>{
 const h=testContext(),calibration={mode:'two-point',knownCm:100,start:{x:0,y:0},end:{x:.5,y:0},sourceWidth:1000,sourceHeight:500,cmPerPixel:3};
 assert.throws(()=>h.ctx.preparePdfPageRecords([{...basic,calibration}]),/تطابق/);
 assert.equal(h.original.devices.length,0);
});
test('out-of-range physical image dimensions are rejected',()=>{
 const h=testContext(),calibration={mode:'two-point',knownCm:100000,start:{x:0,y:0},end:{x:.0001,y:0},sourceWidth:1000,sourceHeight:500,cmPerPixel:1000000};
 assert.throws(()=>h.ctx.preparePdfPageRecords([{...basic,calibration}]));
 assert.equal(h.original.devices.length,0);
});
test('modal requires explicit two-point calibration, stores pixel ratio and is page-specific',()=>{
 const importer=fs.readFileSync('assets/pdf-import.js','utf8');
 assert.match(importer,/data-pdf-known-cm/);assert.match(importer,/data-pdf-calibrate/);
 assert.match(importer,/const dist=Math\.hypot\(\(ref\.start\.x-ref\.end\.x\)\*source\.width/);
 assert.match(importer,/calibrations=new Map\(\)/);
 assert.match(importer,/cmPerPixel/);
});

