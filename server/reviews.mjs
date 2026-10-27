import {createHash} from 'node:crypto';
import {schemas,saveRecord} from './domain.mjs';

const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createReviews(store) {
  const emit=()=>store.emit('ui',{action:'records_changed',collection:'approvals'});
  function request({collection,id='',record,reason=''},actor='GPT') {
    const schema=schemas[collection];if(!schema||collection==='payments')throw new Error('Choose a supported record for review. Record payment confirmations directly in Finances.');
    const original=id?store.get(collection,id):null;if(id&&!original)throw new Error('Record not found');
    if(collection==='emails'&&original&&original.status!=='Draft')throw new Error('Only email drafts can be reviewed');
    if(collection==='posts'&&original&&['Published','Failed'].includes(original.status))throw new Error('Review a draft, not a published post');
    const proposed=schema.parse({...original,...record,...(collection==='posts'&&record===undefined?{status:'Ready'}:{})});
    if(collection==='posts'&&['Published','Failed','Scheduled'].includes(proposed.status))throw new Error('Approve content as Ready; schedule or publish separately.');
    const payload={collection,record:proposed,before:original?schema.parse(original):null,originalFingerprint:original?fingerprint(original):'',reason:String(reason).slice(0,4000)};
    const existing=store.list('approvals').find(a=>a.kind==='record'&&a.status==='Pending'&&a.entityId===id&&JSON.stringify(a.payload)===JSON.stringify(payload));if(existing)return existing;
    const approval=store.put('approvals',{kind:'record',collection,entityId:id,status:'Pending',title:`${id?'Review':'Create'}: ${proposed.title||proposed.name||proposed.subject||collection}`,requestedBy:actor,payload});
    store.log(`Requested review: ${approval.title}`,actor,id||approval.id);emit();return approval;
  }
  function revise(id,changes={}) {
    const approval=store.get('approvals',id);
    if(!approval||approval.status!=='Pending'||approval.kind!=='record'||approval.entityId||!['tasks','notes'].includes(approval.payload?.collection)||approval.requestedBy!=='GPT · inbox')throw new Error('This inbox proposal cannot be edited.');
    const allowed=approval.payload.collection==='tasks'?['title','notes','dueDate']:['title','body'];
    if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!allowed.includes(k)))throw new Error('Only the proposed title, details and date can be changed.');
    const record=schemas[approval.payload.collection].parse({...approval.payload.record,...changes});
    const updated=store.put('approvals',{...approval,payload:{...approval.payload,record}});
    store.log(`Edited inbox proposal: ${approval.title}`,'You',id);emit();return updated;
  }
  function assertCurrent(approval) {
    if(approval.kind!=='record')return;
    const current=approval.entityId?store.get(approval.payload.collection,approval.entityId):null;
    if(approval.entityId&&(!current||fingerprint(current)!==approval.payload.originalFingerprint))throw new Error('This record changed after review was requested. Decline this request and submit the updated version.');
  }
  function apply(approval) {
    assertCurrent(approval);
    const result=saveRecord(store,approval.payload.collection,approval.payload.record,approval.entityId||undefined,'You · approved review');
    store.log(`Approved review: ${approval.title}`,'You',result.id);return result;
  }
  async function resolve(id,{approve,note=''},executors={}) {
    const approval=store.get('approvals',id);if(!approval||approval.status!=='Pending')throw new Error('This request has already been resolved');
    if(typeof approve!=='boolean')throw new Error('Choose approve or decline');
    if(typeof note!=='string'||note.length>4000)throw new Error('Keep the review note under 4,000 characters');
    if(!approve){const result=store.put('approvals',{...approval,status:'Declined',reviewNote:note,resolvedAt:new Date().toISOString(),resolvedBy:'You'});store.log(`Declined review: ${approval.title}`,'You',approval.entityId);emit();return result;}
    assertCurrent(approval);
    // Claim synchronously before any network wait: repeated clicks cannot run an action twice.
    store.put('approvals',{...approval,status:'Running',reviewNote:note});emit();
    try {
      let result;
      if(approval.kind==='record')result=apply(approval);
      else if(approval.kind==='undo'&&executors.undo)result=await executors.undo(approval);
      else if(approval.kind==='email'&&executors.email)result=await executors.email(approval);
      else if(approval.kind==='connector'&&executors.connector)result=await executors.connector(approval);
      else throw new Error('Unsupported approval');
      const saved=store.put('approvals',{...approval,status:'Approved',reviewNote:note,resultId:result?.id||approval.entityId||'',resolvedAt:new Date().toISOString(),resolvedBy:'You'});emit();return saved;
    }catch(error){store.put('approvals',{...approval,status:'Failed',error:error.message,reviewNote:note,resolvedAt:new Date().toISOString()});emit();throw error;}
  }
  return {request,revise,resolve,assertCurrent};
}
