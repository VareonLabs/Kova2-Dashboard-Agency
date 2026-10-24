import {schemas,saveRecord,deleteRecord} from './domain.mjs';
const canonical=value=>JSON.stringify(value===null?null:Object.fromEntries(Object.keys(value||{}).filter(k=>!['createdAt','updatedAt'].includes(k)).sort().map(k=>[k,value[k]])));
const supported=new Set(['clients','projects','tasks','contracts','posts','notes','invoices','expenses','resources','documents','websites','prospects','meetings','forecastItems']);
export function createHistory(store){
 function eligibility(change){
  if(!change)return {canUndo:false,reason:'Change not found'};
  if(change.undoneAt)return {canUndo:false,reason:'This change has already been undone'};
  if(change.undoOf)return {canUndo:false,reason:'This entry records an undo'};
  if(!supported.has(change.collection)||!schemas[change.collection])return {canUndo:false,reason:'Use the original screen to correct this entry; automatic undo is not supported'};
  if(change.collection==='posts'&&[change.before?.status,change.after?.status].some(s=>['Published','Scheduled','Failed'].includes(s)))return {canUndo:false,reason:'Publishing and scheduled delivery need separate handling'};
  if(store.version(change.collection,change.entityId)!==(change.undoVersion||change.afterVersion))return {canUndo:false,reason:'This record changed again. Newer changes must be reviewed first'};
  return {canUndo:true,reason:'Reverses this local record change. External actions are not reversed'};
 }
 function list(){return store.list('changes').slice(0,1000).map(c=>({...c,...eligibility(c)}));}
 function undo(id){const c=store.get('changes',id),check=eligibility(c);if(!check.canUndo)throw new Error(check.reason);store.db.exec('BEGIN IMMEDIATE');try{const locked=eligibility(store.get('changes',id));if(!locked.canUndo)throw new Error(locked.reason);let record;if(c.action==='Created')deleteRecord(store,c.collection,c.entityId,'You · undo',{undoOf:id});else record=saveRecord(store,c.collection,c.before,c.entityId,'You · undo',{restore:c.action==='Deleted',undoOf:id});store.put('changes',{...c,undoneAt:new Date().toISOString()});const previous=store.list('changes').find(r=>r.collection===c.collection&&r.entityId===c.entityId&&!r.undoneAt&&!r.undoOf);const current=store.get(c.collection,c.entityId);if(previous&&canonical(previous.after)===canonical(current))store.put('changes',{...previous,undoVersion:store.version(c.collection,c.entityId)});store.db.exec('COMMIT');store.emit('ui',{action:'records_changed',collection:c.collection,id:c.entityId});return {undone:true,record};}catch(error){store.db.exec('ROLLBACK');throw error;}}
 function request(id,actor='GPT'){const change=store.get('changes',id),check=eligibility(change);if(!check.canUndo)throw new Error(check.reason);return store.list('approvals').find(a=>a.kind==='undo'&&a.entityId===id&&a.status==='Pending')||store.put('approvals',{kind:'undo',entityId:id,title:`Undo: ${change.title}`,requestedBy:actor,status:'Pending',payload:{changeId:id,collection:change.collection,before:change.after,record:change.before,action:change.action}});}
 return {list,eligibility,undo,request};
}
