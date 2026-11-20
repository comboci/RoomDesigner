/* DXF byte decoding: use the HEADER codepage when available, never silently replace characters. */
(function(global){
'use strict';
const aliases={UTF8:'utf-8','UTF-8':'utf-8',ANSI_1250:'windows-1250',ANSI_1251:'windows-1251',ANSI_1252:'windows-1252',ANSI_1253:'windows-1253',ANSI_1254:'windows-1254',ANSI_1255:'windows-1255',ANSI_1256:'windows-1256',ANSI_1257:'windows-1257',ANSI_1258:'windows-1258',ANSI_932:'shift_jis',ANSI_936:'gb18030',ANSI_949:'euc-kr',ANSI_950:'big5'};
const selectable=new Set(['utf-8','windows-1250','windows-1251','windows-1252','windows-1256','shift_jis','gb18030','euc-kr','big5']);
function headerCodepage(bytes){
 const limit=Math.min(bytes.byteLength,65536);let sample='';
 for(let i=0;i<limit;i++){const b=bytes[i];sample+=b<128?String.fromCharCode(b):'?'}
 const section=sample.match(/(?:^|\n)0\s*\nSECTION\s*\n2\s*\nHEADER\s*\n([\s\S]*?)(?:\n0\s*\nENDSEC|$)/i);
 return section?.[1]?.match(/(?:^|\n)9\s*\n\$DWGCODEPAGE\s*\n3\s*\n([A-Z0-9_-]+)/i)?.[1]?.toUpperCase()||null;
}
function inspect(bytes,choice='auto'){
 if(!(bytes instanceof Uint8Array)||!bytes.byteLength)throw Error('فایل DXF خالی یا نامعتبر است');
 const declared=headerCodepage(bytes),hasBom=bytes[0]===239&&bytes[1]===187&&bytes[2]===191;
 const nonAscii=bytes.some(b=>b>=128);
 const mapped=declared?aliases[declared]||null:null;
 if(choice!=='auto'&&!selectable.has(choice))throw Error('Encoding انتخاب‌شده پشتیبانی نمی‌شود');
 const encoding=choice==='auto'?(hasBom?'utf-8':mapped||(!nonAscii?'utf-8':null)):choice;
 const needsChoice=!encoding;
 return {encoding,declared,hasBom,nonAscii,needsChoice,explicit:choice!=='auto',detected:hasBom?'UTF-8 BOM':declared||'نامشخص'};
}
function decode(bytes,choice='auto'){
 const info=inspect(bytes,choice);
 if(info.needsChoice)throw Error('کدگذاری DXF نامشخص یا پشتیبانی‌نشده است. برای حفظ نام لایه‌ها، Encoding را به‌صورت دستی انتخاب کنید.');
 let decoder;
 try{decoder=new TextDecoder(info.encoding,{fatal:true,ignoreBOM:false})}
 catch(_){throw Error('مرورگر از کدگذاری '+info.encoding+' پشتیبانی نمی‌کند. فایل را به UTF-8 تبدیل کنید.')}
 let text;
 try{text=decoder.decode(bytes)}
 catch(_){throw Error('بایت‌های DXF با '+info.encoding+' سازگار نیستند؛ برای جلوگیری از خرابی نام‌ها Encoding دیگری انتخاب کنید.')}
 if(text.includes('\uFFFD'))throw Error('نویسه جایگزین (�) در متن DXF دیده شد؛ کدگذاری صحیح را بررسی و دوباره انتخاب کنید.');
 return {text,info};
}
const api={inspect,decode,headerCodepage,aliases,selectable};
global.RoomDXFEncoding=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
