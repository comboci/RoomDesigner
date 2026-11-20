'use strict';
// Regression source for direct PDF visuals and Unicode Info; tests/build intentionally NOT_RUN.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {extractFunction}=require('./source-harness.cjs');
const pdf=extractFunction('saveDrawingPdf');
test('PDF direct output uses same form fields as print',()=>{
 assert.match(pdf,/\$\('pdfDesigner'\)/);assert.match(pdf,/\$\('pdfRevision'\)/);
 assert.match(pdf,/const title=String\(doc\.name/);assert.match(pdf,/drawDate/);
});
test('each PDF raster page reserves and paints a title block without a second image array',()=>{
 assert.match(pdf,/footerHeight=Math\.max/);assert.match(pdf,/ch-footerHeight/);
 assert.match(pdf,/ctx\.fillText\('نام نقشه:/);assert.match(pdf,/ctx\.fillText\('نسخه:/);
 assert.doesNotMatch(pdf,/images\.push\(/);
});
test('PDF Info dictionary contains Unicode title, designer and revision',()=>{
 assert.match(pdf,/pdfInfoText=value/);assert.match(pdf,/FEFF/);
 assert.match(pdf,/\/Title /);assert.match(pdf,/\/Author /);assert.match(pdf,/\/Subject /);
 assert.match(pdf,/\/Info '\+infoId/);
});
test('PDF direct output retains previous 20-page 32 MiB resource limits',()=>{
 assert.match(pdf,/areas\.length>20/);assert.match(pdf,/maxOutputBytes=32\*1024\*1024/);
 assert.match(pdf,/canvas\.toBlob/);
});

