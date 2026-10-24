import {z} from 'zod';
import {saveRecord} from './domain.mjs';
import {brisbaneDay,recordDay} from '../public/operations-data.js';
const address=value=>String(value||'').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g)||[];
const time=value=>Date.parse(value)||0;
const addDays=(day,count)=>brisbaneDay(new Date(new Date(day+'T12:00:00+10:00').getTime()+count*86400000));
export function createFollowUps(store) {
 function context(id,{now=new Date()}={}) {
  const prospect=store.get('prospects',id);if(!prospect)throw new Error('Prospect not found');
  const email=prospect.email?.toLowerCase().trim();
  const mail=store.list('emails').filter(m=>!m.deletedAt&&(!m.prospectId||m.prospectId===id)&&(m.prospectId===id||email&&[m.from,m.to,...(m.cc||[])].some(v=>address(v).includes(email))));
  const history=store.list('prospectTouches').filter(h=>h.prospectId===id&&time(h.occurredAt)<=+now).sort((a,b)=>time(b.occurredAt)-time(a.occurredAt));
  const sent=mail.filter(m=>m.status==='Sent'&&(!email||address(m.to).includes(email))).map(m=>({id:m.id,at:m.sentAt||m.receivedAt||m.createdAt,source:'Email'})).concat(history.filter(h=>['Contacted','Followed up'].includes(h.kind)).map(h=>({id:h.id,at:h.occurredAt,source:'Logged contact'}))).filter(h=>time(h.at)<=+now).sort((a,b)=>time(b.at)-time(a.at))[0];
  const replied=mail.filter(m=>m.status==='Received'&&email&&address(m.from).includes(email)).map(m=>({id:m.id,at:m.receivedAt||m.createdAt,source:'Email'})).concat(history.filter(h=>h.kind==='Replied').map(h=>({id:h.id,at:h.occurredAt,source:'Logged reply'}))).filter(h=>time(h.at)<=+now).sort((a,b)=>time(b.at)-time(a.at))[0];
  const hasReply=!!replied&&(!sent||time(replied.at)>time(sent.at)),today=brisbaneDay(now),explicit=recordDay(prospect.followUpDate),dueDate=explicit||sent&&!hasReply&&addDays(recordDay(sent.at),prospect.followUpAfterDays||7)||'';
  const draft=mail.filter(m=>m.status==='Draft'&&m.prospectId===id).sort((a,b)=>time(b.updatedAt||b.createdAt)-time(a.updatedAt||a.createdAt))[0],approval=draft&&store.list('approvals').find(a=>a.kind==='email'&&a.entityId===draft.id&&['Pending','Running'].includes(a.status));
  const state=['Won','Lost'].includes(prospect.status)?'Closed':prospect.followUpPaused?'Paused':dueDate&&dueDate<=today?'Due':dueDate?'Upcoming':hasReply?'Replied':'No date';
  return {prospect,history,draftId:draft?.id||'',pendingApprovalId:approval?.id||'',emails:mail.sort((a,b)=>time(b.receivedAt||b.sentAt||b.createdAt)-time(a.receivedAt||a.sentAt||a.createdAt)).slice(0,10).map(m=>({id:m.id,status:m.status,from:m.from,to:m.to,subject:m.subject,body:String(m.body||'').slice(0,4000),date:m.receivedAt||m.sentAt||m.createdAt})),state,dueDate,lastContactAt:sent?.at||'',lastReplyAt:replied?.at||'',hasReply,unanswered:!!sent&&!hasReply,overdue:state==='Due'&&dueDate<today,reason:explicit?'Scheduled reminder':sent&&!hasReply?`No saved reply after ${prospect.followUpAfterDays||7} days`:hasReply?'A reply has arrived':'Set a date or log your first contact',today};
 }
 function summary({now=new Date()}={}) {const items=store.list('prospects').map(p=>context(p.id,{now})).filter(r=>r.state!=='Closed').map(({emails,history,...r})=>r);items.sort((a,b)=>(a.state==='Due'?0:1)-(b.state==='Due'?0:1)||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')));return {items,due:items.filter(r=>r.state==='Due').length,unanswered:items.filter(r=>r.unanswered&&!['Paused','Closed'].includes(r.state)).length,timezone:'Australia/Brisbane'};}
 function update(id,input,actor='You') {
  const data=z.discriminatedUnion('action',[
   z.object({action:z.literal('schedule'),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))),note:z.string().max(4000).default('')}),
   z.object({action:z.enum(['pause','complete','resume']),note:z.string().max(4000).default('')}),
   z.object({action:z.literal('log'),kind:z.enum(['Contacted','Followed up','Replied']),occurredAt:z.string().refine(v=>time(v)>0&&time(v)<=Date.now(),'Choose a time up to now'),nextDate:z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(''),note:z.string().max(4000).default('')})
  ]).parse(input);
  const p=store.get('prospects',id);if(!p)throw new Error('Prospect not found');if(['Won','Lost'].includes(p.status))throw new Error('Reopen this prospect before scheduling follow-ups');
  const patch=data.action==='schedule'?{followUpDate:data.date,followUpPaused:false}:data.action==='resume'?{followUpPaused:false}:data.action==='log'?{followUpPaused:false,followUpDate:data.nextDate,...(p.status==='Found'&&data.kind!=='Replied'?{status:'Contacted'}:{})}:{followUpPaused:true,...(data.action==='complete'?{followUpDate:''}:{})};
  store.db.exec('BEGIN IMMEDIATE');try{saveRecord(store,'prospects',patch,id,actor);store.put('prospectTouches',{prospectId:id,kind:data.action==='log'?data.kind:data.action==='schedule'?'Scheduled':data.action==='complete'?'Completed':data.action==='pause'?'Paused':'Resumed',occurredAt:data.occurredAt||new Date().toISOString(),nextDate:data.date||data.nextDate||'',note:data.note,actor});store.db.exec('COMMIT');}catch(error){store.db.exec('ROLLBACK');throw error;}
  store.emit('ui',{action:'records_changed',collection:'prospects',id});return context(id);
 }
 return {context,summary,update};
}
