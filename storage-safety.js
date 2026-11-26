/* One writer per origin; preserve pre-migration bytes before changing legacy data. */
(function(global){
 'use strict';
 const archiveKey='rd_preserved_migration_v325';
 async function acquireWriter(locks){
  if(!locks?.request)return {ok:false,reason:'unsupported'};
  return new Promise(resolve=>{
   try{
    locks.request('room-designer-storage-writer',{mode:'exclusive',ifAvailable:true},lock=>{
     if(!lock){resolve({ok:false,reason:'busy'});return}
     return new Promise(release=>resolve({ok:true,release}));
    }).catch(()=>resolve({ok:false,reason:'unavailable'}));
   }catch(_){resolve({ok:false,reason:'unavailable'})}
  });
 }
 function isMigrationArchiveKey(key){return key===archiveKey||typeof key==='string'&&key.startsWith(archiveKey+':')}
 function migrationArchiveEntries(storage){
  const entries=[];
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(isMigrationArchiveKey(key))entries.push({key,raw:storage.getItem(key)})}
  return entries.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
 }
 function validatedArchive(raw){
  const saved=JSON.parse(raw);
  if(!saved||saved.format!==1||!saved.values||typeof saved.values!=='object'||Array.isArray(saved.values)||!Object.keys(saved.values).length||Object.entries(saved.values).some(([key,value])=>!key.startsWith('rd_')||isMigrationArchiveKey(key)||(value!==null&&typeof value!=='string')))throw Error('بسته حفاظت مهاجرت نامعتبر است');
  return saved
 }
 function sameValues(a,b){
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&a[k]===b[k])
 }
 function preserveMigration(storage,equipmentRelease,connectionVersion){
  if(storage.getItem('rd_equipment_release')===equipmentRelease&&storage.getItem('rd_connection_model')===connectionVersion)return false;
  // Never include earlier archives in a new archive or overwrite original bytes.
  const existing=migrationArchiveEntries(storage).map(entry=>({...entry,saved:validatedArchive(entry.raw)}));
  const values={};
  for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key?.startsWith('rd_')&&!isMigrationArchiveKey(key))values[key]=storage.getItem(key)}
  if(!Object.keys(values).length||existing.some(entry=>sameValues(entry.saved.values,values)))return false;
  let key=archiveKey;
  if(storage.getItem(key)!==null){let index=1;do{key=archiveKey+':'+index++}while(storage.getItem(key)!==null)}
  const raw=JSON.stringify({format:1,createdAt:new Date().toISOString(),target:{equipmentRelease,connectionVersion},values});
  if(storage.setItem(key,raw)===false||storage.getItem(key)!==raw)throw Error('فضای کافی برای حفاظت داده‌های پیش از مهاجرت وجود ندارد');
  return true;
 }
 global.RoomStorageSafety=Object.freeze({acquireWriter,preserveMigration,migrationArchiveEntries,archiveKey});
})(globalThis);
