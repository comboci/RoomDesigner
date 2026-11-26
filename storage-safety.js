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
 // V406: canonical committed workspace checkpoint and recoverable restore projection.
 const workspaceKeys=Object.freeze(['rd_active_user','rd_catalog','rd_connection_model','rd_equipment_release','rd_last','rd_profiles','rd_save_generation','rd_shortcuts','rd_svg_drafts','rd_toolbox_order_v133','rd_types','rd_users','rd_workspace_dock_v1']);
 const workspaceMarker='rd_workspace_restore_pending_v406',workspaceCommitKey='workspace-commit-v1',workspaceIntentKey='workspace-restore-intent-v1',workspaceReceiptKey='workspace-restore-receipt-v1';
 const workspaceCharLimit=12000000,workspaceIntentLimit=48000000;
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 function workspaceChecksum(raw){let h=2166136261;for(let i=0;i<raw.length;i++)h=Math.imul(h^raw.charCodeAt(i),16777619);return (h>>>0).toString(16).padStart(8,'0')}
 function orderedWorkspaceValues(values){
  if(!object(values)||Object.keys(values).length!==workspaceKeys.length||workspaceKeys.some(k=>!Object.prototype.hasOwnProperty.call(values,k)||values[k]!==null&&typeof values[k]!=='string'))throw Error('ساختار کلیدهای فضای کاری معتبر نیست');
  const ordered=Object.fromEntries(workspaceKeys.map(k=>[k,values[k]]));
  if(Object.values(ordered).reduce((n,v)=>n+(v?.length||0),0)>workspaceCharLimit)throw Error('حجم فضای کاری از سقف حفاظت نسخه بیشتر است');
  return ordered
 }
 function captureWorkspace(storage){
  if(['rd_pending_import','rd_pending_revision',workspaceMarker].some(k=>storage.getItem(k)!==null))throw Error('ابتدا بازیابی معلق را تعیین تکلیف کنید');
  return orderedWorkspaceValues(Object.fromEntries(workspaceKeys.map(k=>[k,storage.getItem(k)])))
 }
 function makeWorkspaceRecord(values,id,createdAt=new Date().toISOString()){
  if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id)||typeof createdAt!=='string'||createdAt.length>64)throw Error('شناسه پشتیبان معتبر نیست');
  const normalized=orderedWorkspaceValues(values),raw=JSON.stringify(normalized);
  return {format:'roomdesigner-workspace/v1',id,createdAt,values:normalized,length:raw.length,checksum:workspaceChecksum(raw)}
 }
 function validateWorkspaceRecord(record){
  if(!object(record)||record.format!=='roomdesigner-workspace/v1')throw Error('فرمت پشتیبان فضای کاری معتبر نیست');
  const checked=makeWorkspaceRecord(record.values,record.id,record.createdAt);
  if(record.length!==checked.length||record.checksum!==checked.checksum)throw Error('طول یا checksum پشتیبان معتبر نیست');
  return checked
 }
 function workspaceEqual(a,b){return !!a&&!!b&&workspaceKeys.every(k=>Object.prototype.hasOwnProperty.call(a,k)&&Object.prototype.hasOwnProperty.call(b,k)&&a[k]===b[k])}
 function exactJson(a,b){return JSON.stringify(a??null)===JSON.stringify(b??null)}
 // All read/compare/write callbacks run inside the same IDB transaction.
 function workspaceTransaction(db,mode,keys,action){
  if(!db)return Promise.reject(Error('IndexedDB در دسترس نیست'));
  return new Promise((resolve,reject)=>{
   let tx,result,failed;
   try{
    tx=db.transaction('backups',mode);const store=tx.objectStore('backups'),data={};
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failed||tx.error||Error('تراکنش بازیابی لغو شد'));tx.onerror=()=>{};
    const abort=error=>{failed=error;try{tx.abort()}catch(_){reject(error)}};
    if(!keys.length){try{result=action(data,store)}catch(error){abort(error)}return}
    let remaining=keys.length;
    for(const key of keys){
     const req=store.get(key);
     req.onsuccess=()=>{data[key]=req.result??null;if(--remaining===0){try{result=action(data,store)}catch(error){abort(error)}}};
    }
   }catch(error){try{tx?.abort()}catch(_){}reject(error)}
  })
 }
 function readWorkspaceControl(db){
  return workspaceTransaction(db,'readonly',[workspaceIntentKey,workspaceReceiptKey],d=>({intent:d[workspaceIntentKey],receipt:d[workspaceReceiptKey]}))
 }
 function readWorkspaceAuthority(db){
  return workspaceTransaction(db,'readonly',[workspaceCommitKey,workspaceIntentKey,'last','last-meta'],d=>({checkpoint:d[workspaceCommitKey],intent:d[workspaceIntentKey],mirror:d.last,mirrorMeta:d['last-meta']}))
 }
 function writeWorkspaceCheckpoint(db,record,expected){
  const next=validateWorkspaceRecord(record);
  return workspaceTransaction(db,'readwrite',[workspaceCommitKey,workspaceIntentKey,'last','last-meta'],(d,store)=>{
   if(d[workspaceIntentKey]!==null||!exactJson(d[workspaceCommitKey],expected.checkpoint)||!exactJson(d.last,expected.mirror)||!exactJson(d['last-meta'],expected.mirrorMeta)||next.values.rd_last!==d.last)throw Error('نسخه آینه یا مرجع فضای کاری تغییر کرده است');
   const old=d[workspaceCommitKey];
   if(old!==null){const valid=validateWorkspaceRecord(old);if(workspaceEqual(valid.values,next.values))return valid;store.add(valid,'workspace-checkpoint-history-v406:'+next.id)}
   store.put(next,workspaceCommitKey);return next
  })
 }
 function stageWorkspaceRestore(db,beforeRecord,targetRecord,expected,id){
  const before=validateWorkspaceRecord(beforeRecord),target=validateWorkspaceRecord(targetRecord);
  if(target.values.rd_last===null||typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))return Promise.reject(Error('هدف بازیابی یا شناسه نامعتبر است'));
  return workspaceTransaction(db,'readwrite',[workspaceCommitKey,workspaceIntentKey,'last','last-meta'],(d,store)=>{
   if(d[workspaceIntentKey]!==null||!exactJson(d[workspaceCommitKey],expected.checkpoint)||!exactJson(d.last,expected.mirror)||!exactJson(d['last-meta'],expected.mirrorMeta))throw Error('وضعیت IndexedDB هنگام آماده‌سازی تغییر کرد');
   const intent={format:1,id,direction:'restore',before,target,priorCheckpoint:d[workspaceCommitKey],priorMirror:d.last,priorMirrorMeta:d['last-meta']};
   if(JSON.stringify(intent).length>workspaceIntentLimit)throw Error('حجم عملیات بازیابی بیش از بودجه امن است؛ از فایل‌های مستقل استفاده کنید');
   store.add(intent,workspaceIntentKey);return intent
  })
 }
 // The pre-stage marker closes the V406 gap between durable IDB intent and the first local projection.
 function workspacePrepareMarker(id){return 'prepare:'+id}
 function isWorkspacePrepareMarker(marker){return typeof marker==='string'&&/^prepare:[a-zA-Z0-9_-]{1,128}$/.test(marker)}
 async function beginWorkspaceRestore(db,storage,beforeRecord,targetRecord,expected,id){
  const before=validateWorkspaceRecord(beforeRecord),target=validateWorkspaceRecord(targetRecord);
  if(!db||!storage||target.values.rd_last===null||typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('آماده‌سازی بازیابی ممکن نیست');
  if(!workspaceEqual(captureWorkspace(storage),before.values))throw Error('داده محلی قبل از آماده‌سازی تغییر کرد');
  const marker=workspacePrepareMarker(id);
  if(storage.setItem(workspaceMarker,marker)===false||storage.getItem(workspaceMarker)!==marker)throw Error('نشانگر اولیه بازیابی ثبت نشد');
  // On any uncertain failure retain the marker; startup will inspect the durable IDB intent.
  return stageWorkspaceRestore(db,before,target,expected,id)
 }
 function validateWorkspaceIntent(intent){
  if(!object(intent)||intent.format!==1||typeof intent.id!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(intent.id)||!['restore','rollback'].includes(intent.direction))throw Error('Journal فضای کاری معتبر نیست');
  validateWorkspaceRecord(intent.before);const target=validateWorkspaceRecord(intent.target);
  if(target.values.rd_last===null||JSON.stringify(intent).length>workspaceIntentLimit)throw Error('Journal فضای کاری خارج از محدوده است');
  return intent
 }
 function applyWorkspaceProjection(storage,intent){
  validateWorkspaceIntent(intent);
  if(['rd_pending_import','rd_pending_revision'].some(k=>storage.getItem(k)!==null))throw Error('Journal قدیمی با بازیابی فضای کاری تداخل دارد');
  const marker=storage.getItem(workspaceMarker);
  if(marker!==null&&marker!==intent.id&&marker!==workspacePrepareMarker(intent.id))throw Error('شناسه بازیابی محلی متفاوت است');
  for(const key of workspaceKeys){const value=storage.getItem(key);if(value!==intent.before.values[key]&&value!==intent.target.values[key])throw Error('داده خارج از عملیات بازیابی تغییر کرده: '+key)}
  if(storage.setItem(workspaceMarker,intent.id)===false||storage.getItem(workspaceMarker)!==intent.id)throw Error('ثبت نشانگر بازیابی محلی ناموفق بود');
  const chosen=(intent.direction==='rollback'?intent.before:intent.target).values;
  // Only the explicit allowlist is projected. Null means explicitly absent in the selected backup.
  const order=[...workspaceKeys.filter(k=>chosen[k]===null),...workspaceKeys.filter(k=>chosen[k]!==null)];
  for(const key of order){
   if(storage.getItem(key)===chosen[key])continue;
   if((chosen[key]===null?storage.removeItem(key):storage.setItem(key,chosen[key]))===false||storage.getItem(key)!==chosen[key])throw Error('ذخیره بازیابی ناموفق بود: '+key)
  }
  if(!workspaceKeys.every(k=>storage.getItem(k)===chosen[k]))throw Error('تطبیق نهایی فضای کاری ناموفق بود');
  return chosen
 }
 function finishWorkspaceRestore(db,intent,storage){
  validateWorkspaceIntent(intent);
  return workspaceTransaction(db,'readwrite',[workspaceCommitKey,workspaceIntentKey,'last','last-meta'],(d,store)=>{
   const chosen=(intent.direction==='rollback'?intent.before:intent.target).values;
   if(storage.getItem(workspaceMarker)!==intent.id||!workspaceKeys.every(k=>storage.getItem(k)===chosen[k])||['rd_pending_import','rd_pending_revision'].some(k=>storage.getItem(k)!==null))throw Error('داده محلی قبل از Commit نهایی تغییر کرد');
   if(!exactJson(d[workspaceIntentKey],intent)||!exactJson(d[workspaceCommitKey],intent.priorCheckpoint)||!exactJson(d.last,intent.priorMirror)||!exactJson(d['last-meta'],intent.priorMirrorMeta))throw Error('Journal یا آینه هم‌زمان تغییر کرده؛ عملیات متوقف شد');
   // Retain both original and target bytes before clearing the only pending intent.
   store.delete(workspaceIntentKey);
   store.add(intent,'workspace-restore-history-v406:'+intent.id);
   if(intent.direction==='rollback'){
    if(intent.priorCheckpoint===null)store.delete(workspaceCommitKey);else store.put(intent.priorCheckpoint,workspaceCommitKey);
    if(intent.priorMirror===null)store.delete('last');else store.put(intent.priorMirror,'last');
    if(intent.priorMirrorMeta===null)store.delete('last-meta');else store.put(intent.priorMirrorMeta,'last-meta');
   }else{
    const raw=intent.target.values.rd_last;
    store.put(intent.target,workspaceCommitKey);store.put(raw,'last');
    store.put({format:2,length:raw.length,checksum:workspaceChecksum(raw),savedAt:Date.now(),generation:null,receiptVersion:1,primaryObservation:'matched',workspaceRestoreId:intent.id},'last-meta')
   }
   store.put({format:1,id:intent.id,direction:intent.direction,completedAt:new Date().toISOString()},workspaceReceiptKey);
   return true
  })
 }
 function clearWorkspaceMarker(storage,expected){
  if(storage.getItem(workspaceMarker)!==expected)throw Error('نشانگر بازیابی تغییر کرد');
  if(storage.removeItem(workspaceMarker)===false||storage.getItem(workspaceMarker)!==null)throw Error('پاک‌سازی نشانگر بازیابی ناموفق بود')
 }
 // A receipt ID alone cannot prove that the projected workspace remains the committed one.
 function verifyCompletedWorkspaceRestore(db,storage,marker){
  const historyKey='workspace-restore-history-v406:'+marker;
  return workspaceTransaction(db,'readonly',[workspaceIntentKey,workspaceReceiptKey,historyKey,workspaceCommitKey,'last','last-meta'],d=>{
   const receipt=d[workspaceReceiptKey],intent=d[historyKey];
   if(d[workspaceIntentKey]!==null||!receipt||receipt.format!==1||receipt.id!==marker||!intent||intent.id!==marker||receipt.direction!==intent.direction)throw Error('رسید و آرشیو نهایی بازیابی قابل تطبیق نیست');
   validateWorkspaceIntent(intent);
   const chosen=(intent.direction==='rollback'?intent.before:intent.target).values;
   if(storage.getItem(workspaceMarker)!==marker||['rd_pending_import','rd_pending_revision'].some(k=>storage.getItem(k)!==null)||!workspaceKeys.every(k=>storage.getItem(k)===chosen[k]))throw Error('داده محلی پس از Commit بازیابی تغییر کرده است');
   if(intent.direction==='rollback'){
    if(!exactJson(d[workspaceCommitKey],intent.priorCheckpoint)||!exactJson(d.last,intent.priorMirror)||!exactJson(d['last-meta'],intent.priorMirrorMeta))throw Error('مرجع قبلی بازیابی قابل تطبیق نیست')
   }else{
    const meta=d['last-meta'],raw=intent.target.values.rd_last;
    if(!exactJson(d[workspaceCommitKey],intent.target)||d.last!==raw||meta?.workspaceRestoreId!==marker||meta.format!==2||meta.length!==raw.length||meta.checksum!==workspaceChecksum(raw))throw Error('مرجع نهایی بازیابی قابل تطبیق نیست')
   }
   return chosen
  })
 }
 async function resumeWorkspaceRestore(db,storage){
  const marker=storage?storage.getItem(workspaceMarker):null;
  if(!db){if(marker!==null)throw Error('IndexedDB برای تکمیل بازیابی فضای کاری در دسترس نیست');return false}
  const {intent}=await readWorkspaceControl(db);
  if(intent===null){
   if(marker!==null){
    if(isWorkspacePrepareMarker(marker)){
     // Only an uncommitted prepare marker can be cleared without a final receipt.
     // The projection always replaces prepare:ID with ID before changing managed keys.
     await workspaceTransaction(db,'readonly',[workspaceIntentKey,workspaceReceiptKey],d=>{
      if(d[workspaceIntentKey]!==null||d[workspaceReceiptKey]?.id===marker.slice(8)||['rd_pending_import','rd_pending_revision'].some(k=>storage.getItem(k)!==null))throw Error('وضعیت آماده‌سازی بازیابی نامشخص است');
      clearWorkspaceMarker(storage,marker);return true
     })
    }else{
     const chosen=await verifyCompletedWorkspaceRestore(db,storage,marker);
     if(!workspaceKeys.every(k=>storage.getItem(k)===chosen[k]))throw Error('داده محلی پیش از پاک‌سازی نشانگر تغییر کرد');
     clearWorkspaceMarker(storage,marker)
    }
   }
   return false
  }
  if(!storage)throw Error('LocalStorage برای تکمیل بازیابی در دسترس نیست');
  validateWorkspaceIntent(intent);
  applyWorkspaceProjection(storage,intent);
  await finishWorkspaceRestore(db,intent,storage);
  const chosen=await verifyCompletedWorkspaceRestore(db,storage,intent.id);
  if(!workspaceKeys.every(k=>storage.getItem(k)===chosen[k]))throw Error('داده محلی پیش از پاک‌سازی نشانگر تغییر کرد');
  clearWorkspaceMarker(storage,intent.id);
  return true
 }
 function requestWorkspaceRollback(db,expected){
  validateWorkspaceIntent(expected);
  return workspaceTransaction(db,'readwrite',[workspaceIntentKey],(d,store)=>{
   if(!exactJson(d[workspaceIntentKey],expected))throw Error('Journal تغییر کرده است');
   const next={...expected,direction:'rollback'};store.put(next,workspaceIntentKey);return next
  })
 }
 function workspaceHistoryKey(key){return typeof key==='string'&&/^workspace-(checkpoint|restore)-history-v406:[a-zA-Z0-9_-]{1,128}$/.test(key)}
 function readWorkspaceHistory(db,limit=32000000,keysOnly=false){
  if(!db)return Promise.reject(Error('IndexedDB در دسترس نیست'));
  return new Promise((resolve,reject)=>{
   let tx;
   try{
    tx=db.transaction('backups','readonly');const entries=[],store=tx.objectStore('backups'),req=keysOnly?store.openKeyCursor():store.openCursor();let total=0;
    tx.oncomplete=()=>resolve(entries);tx.onabort=()=>reject(tx.error||Error('خواندن آرشیو ناموفق بود'));tx.onerror=()=>{};
    req.onsuccess=()=>{try{
     const cursor=req.result;if(!cursor)return;
     if(workspaceHistoryKey(cursor.key)){
      if(entries.length>=10000)throw Error('تعداد آرشیوها بیش از سقف امن است');
      if(keysOnly)entries.push(cursor.key);
      else{const entry={key:cursor.key,value:cursor.value};total+=JSON.stringify(entry).length;if(total>limit)throw Error('حجم مجموع آرشیوها بیش از سقف امن است؛ هر مورد را جداگانه صادر کنید');entries.push(entry)}
     }
     cursor.continue()
    }catch(error){try{tx.abort()}catch(_){}reject(error)}};
   }catch(error){try{tx?.abort()}catch(_){}reject(error)}
  })
 }
 function readWorkspaceHistoryEntry(db,key){
  if(!workspaceHistoryKey(key))return Promise.reject(Error('شناسه آرشیو نامعتبر است'));
  return workspaceTransaction(db,'readonly',[key],d=>d[key])
 }
 function removeExportedWorkspaceHistory(db,key,expected){
  if(!workspaceHistoryKey(key)||expected==null)return Promise.reject(Error('آرشیو قابل پاک‌سازی نیست'));
  return workspaceTransaction(db,'readwrite',[key,workspaceIntentKey,workspaceReceiptKey],(d,store)=>{
   if(d[workspaceIntentKey]!==null||d[key]===null||!exactJson(d[key],expected))throw Error('بازیابی معلق است یا آرشیو تغییر کرده است');
   // Keep the last receipt's proof while it may still be needed for crash recovery.
   if(d[workspaceReceiptKey]&&key==='workspace-restore-history-v406:'+d[workspaceReceiptKey].id)throw Error('آرشیو آخرین رسید بازیابی محافظت شده است');
   store.delete(key);return true
  })
 }
 global.RoomStorageSafety=Object.freeze({acquireWriter,preserveMigration,migrationArchiveEntries,archiveKey,workspaceKeys,workspaceMarker,workspaceCharLimit,workspaceChecksum,captureWorkspace,makeWorkspaceRecord,validateWorkspaceRecord,workspaceEqual,readWorkspaceControl,readWorkspaceAuthority,writeWorkspaceCheckpoint,stageWorkspaceRestore,beginWorkspaceRestore,applyWorkspaceProjection,resumeWorkspaceRestore,requestWorkspaceRollback,readWorkspaceHistory,readWorkspaceHistoryEntry,removeExportedWorkspaceHistory});
})(globalThis);
