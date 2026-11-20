// N7 Regression SOURCE only — NOT_RUN under regression policy.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const start=src.indexOf('function committedRevisionContinuity('),end=src.indexOf('\nconst pendingRevision=',start);
assert.ok(start>=0&&end>start);
const proof=new Function(src.slice(start,end)+'\nreturn committedRevisionContinuity;')();
const record=(n,note='same')=>({number:n,at:'2026-11-20',by:'owner',summary:note,snapshot:{ok:true}});
const doc=(id,n,entry=record(n))=>({id,revision:n,revisions:[entry],name:'room'});
const verify=(local,profile)=>proof(JSON.stringify(local),JSON.stringify({[profile.id]:profile}));
test('interrupted write after profiles but before current document fails proof',()=>assert.equal(verify(doc('x',7),doc('x',8)),false));
test('later same-Revision autosave keeps record and qualifies',()=>{const p=doc('x',8);assert.equal(verify({...p,name:'edited'},p),true)});
test('Save As different document ID never proves original revision',()=>assert.equal(verify(doc('x',8),doc('y',8)),false));
test('same Revision number but changed record fails proof',()=>assert.equal(verify(doc('x',8,record(8,'older')),doc('x',8,record(8,'newer'))),false));
test('missing duplicate or malformed entries refuse proof',()=>{const p=doc('x',8);assert.equal(verify({...p,revisions:[]},p),false);assert.equal(verify({...p,revisions:[record(8),record(8)]},p),false);assert.equal(proof('{bad','{}'),false)});
test('startup must keep ambiguous state and use continuity proof',()=>{assert.match(src,/if\(revisionCommitted\|\|continuedRevision\)/);assert.match(src,/continuedRevision=profileExpected&&currentValid&&committedRevisionContinuity/);assert.match(src,/else if\(pendingRevision\.format===2&&currentValid\)/)});
