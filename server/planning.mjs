import {z} from 'zod';
import {financeSummary,cents} from './finance.mjs';
import {brisbaneDay,recordDay} from '../public/operations-data.js';
export const plusDays=(day,n)=>brisbaneDay(new Date(Date.parse(day+'T12:00:00+10:00')+n*86400000));
export const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')&&!Number.isNaN(Date.parse(day))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
const monthDay=(day,n)=>{const [y,m,d]=day.split('-').map(Number),first=new Date(Date.UTC(y,m-1+n,1)),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;};
export function createPlanning(store){
 function calendar({start=brisbaneDay(),view='week',clientId=''}={}){
  if(!validDay(start)||!['week','month'].includes(view))throw new Error('Choose a calendar date and week or month');
  const day=new Date(start+'T12:00:00Z'),weekday=(day.getUTCDay()+6)%7,first=view==='week'?plusDays(start,-weekday):start.slice(0,8)+'01';
  const begin=view==='month'?plusDays(first,-((new Date(first+'T12:00:00Z').getUTCDay()+6)%7)):first,count=view==='month'?42:7,end=plusDays(begin,count-1),projects=store.list('projects').filter(p=>!clientId||p.clientId===clientId),ids=new Set(projects.map(p=>p.id));
  const matches=r=>!clientId||r.clientId===clientId||ids.has(r.projectId),items=[];
  const add=(collection,r,date,title,kind)=>{date=recordDay(date);if(date&&date>=begin&&date<=end&&matches(r))items.push({collection,id:r.id,title,date,kind,status:r.status||'',clientId:r.clientId||store.get('projects',r.projectId)?.clientId||'',projectId:r.projectId||'',startAt:r.startAt||r.scheduledAt||'',endAt:r.endAt||'',estimatedHours:Number(r.estimatedHours||0)});};
  for(const m of store.list('meetings')){const from=recordDay(m.startAt),to=recordDay(new Date(Date.parse(m.endAt)-1));for(let d=from;d&&d<=to&&d<=end;d=plusDays(d,1))if(d>=begin)add('meetings',m,d,m.title,m.kind);}
  for(const t of store.list('tasks').filter(t=>!['Done','Cancelled'].includes(t.status))){add('tasks',t,t.scheduledDate||t.dueDate,t.title,'Task');if(t.scheduledDate&&t.dueDate&&recordDay(t.scheduledDate)!==recordDay(t.dueDate))add('tasks',{...t,estimatedHours:0},t.dueDate,t.title,'Task due');}
  for(const p of projects.filter(p=>p.status!=='Complete'))add('projects',{...p,projectId:p.id},p.dueDate,p.name,'Deadline');
  for(const c of store.list('contracts').filter(c=>!['Signed','Declined','Expired'].includes(c.status)))add('contracts',c,c.dueDate,c.title,'Contract');
  for(const p of store.list('posts').filter(p=>p.status==='Scheduled'))add('posts',p,p.scheduledAt,p.title,'Content');
  for(const i of financeSummary(store,{clientId}).invoices.filter(i=>i.outstanding>0))add('invoices',i,i.dueDate,i.number||i.title,'Invoice');
  const settings=store.get('workloadSettings','current')||{dailyHours:8,workdays:[1,2,3,4,5]},days=Array.from({length:count},(_,i)=>{const date=plusDays(begin,i),records=items.filter(x=>x.date===date),meetings=records.filter(r=>r.collection==='meetings'),taskHours=records.filter(r=>r.kind==='Task').reduce((n,r)=>n+r.estimatedHours,0),meetingHours=meetings.reduce((n,m)=>n+Math.max(0,Math.min(Date.parse(m.endAt),Date.parse(date+'T00:00:00+10:00')+86400000)-Math.max(Date.parse(m.startAt),Date.parse(date+'T00:00:00+10:00')))/3600000,0),capacity=settings.workdays.includes(new Date(date+'T12:00:00Z').getUTCDay())?settings.dailyHours:0,conflicts=[];
    for(let a=0;a<meetings.length;a++)for(let b=a+1;b<meetings.length;b++)if(Date.parse(meetings[a].startAt)<Date.parse(meetings[b].endAt)&&Date.parse(meetings[b].startAt)<Date.parse(meetings[a].endAt))conflicts.push([meetings[a].id,meetings[b].id]);
    return {date,items:records.sort((a,b)=>Date.parse(a.startAt||a.date+'T00:00:00+10:00')-Date.parse(b.startAt||b.date+'T00:00:00+10:00')),capacity,taskHours,meetingHours,plannedHours:taskHours+meetingHours,overbooked:taskHours+meetingHours>capacity,conflicts,unestimated:records.filter(r=>r.kind==='Task'&&!r.estimatedHours).length};});
  return {view,start:begin,end,days,settings,unplacedTasks:store.list('tasks').filter(t=>!['Done','Cancelled'].includes(t.status)&&!t.scheduledDate&&!t.dueDate&&matches(t)).length,timezone:'Australia/Brisbane'};
 }
 function capacity(input){const values=z.object({dailyHours:z.coerce.number().min(0).max(24),workdays:z.array(z.number().int().min(0).max(6)).max(7)}).parse(input);return store.put('workloadSettings',{id:'current',...values},{actor:'You'});}
 function opening(input){const data=z.object({amount:z.coerce.number().finite().min(-1e10).max(1e10).refine(v=>Math.abs(v*100-Math.round(v*100))<0.0001),date:z.string().refine(validDay)}).parse(input);return store.put('forecastSettings',{id:'current',...data},{actor:'You'});}
 function forecast({days=90,scenario='Expected',now=new Date()}={}){
  if(![30,60,90].includes(days)||!['Expected','Late payments'].includes(scenario))throw new Error('Choose 30, 60 or 90 days and a forecast scenario');
  const start=brisbaneDay(now),end=plusDays(start,days-1),events=[],undated=[],finance=financeSummary(store,{now}),delay=scenario==='Late payments'?14:0;
  const add=(date,amount,title,source,id,kind,overdue=false)=>{if(!date){undated.push({title,source,id,amount:amount/100});return;}let day=recordDay(date);if(!day)return;if(day<start){day=start;overdue=true;}if(kind==='Income'&&delay)day=plusDays(day,delay);if(day>end)return;events.push({date:day,amount:amount/100,title,source,id,kind,overdue});};
  for(const i of finance.invoices.filter(i=>i.outstanding>0))add(i.dueDate,cents(i.outstanding),i.number||i.title,'invoices',i.id,'Income');
  for(const e of finance.expenses.filter(e=>!e.paid))add(e.date,-cents(e.amount),e.title,'expenses',e.id,'Expense');
  for(const p of store.list('forecastItems').filter(p=>p.enabled!==false)){
    if(!validDay(p.date))continue;const sign=p.kind==='Income'?1:-1,limit=p.endDate?recordDay(p.endDate):end;
    if(p.frequency==='Once'){if(p.date<=limit)add(p.date,cents(p.amount)*sign,p.title,'forecastItems',p.id,p.kind);continue;}
    // Recurring plans begin at their anchor and skip past occurrences, preserving month-end anchors.
    let n=p.frequency==='Weekly'?Math.max(0,Math.floor((Date.parse(start)-Date.parse(p.date))/604800000)):Math.max(0,(+start.slice(0,4)-+p.date.slice(0,4))*12+(+start.slice(5,7)-+p.date.slice(5,7))-1);
    for(let tries=0;tries<1000;tries++,n++){const date=p.frequency==='Weekly'?plusDays(p.date,n*7):monthDay(p.date,n);if(date>end||date>limit)break;if(date>=start)add(date,cents(p.amount)*sign,p.title,'forecastItems',p.id,p.kind);}
  }
  events.sort((a,b)=>a.date.localeCompare(b.date));const base=store.get('forecastSettings','current'),openingCents=base?cents(base.amount):null;let balance=openingCents,totalIn=0,totalOut=0;
  const series=Array.from({length:days},(_,i)=>{const date=plusDays(start,i),entries=events.filter(e=>e.date===date),income=entries.filter(e=>e.amount>0).reduce((n,e)=>n+cents(e.amount),0),outgoing=-entries.filter(e=>e.amount<0).reduce((n,e)=>n+cents(e.amount),0);totalIn+=income;totalOut+=outgoing;if(balance!==null)balance+=income-outgoing;return {date,income:income/100,outgoing:outgoing/100,balance:balance===null?null:balance/100};});
  const checkpoints=[30,60,90].filter(n=>n<=days).map(n=>({days:n,date:series[n-1].date,balance:series[n-1].balance}));
  return {start,end,days,scenario,opening:base||null,openingNeedsRefresh:!!base&&base.date!==start,series,events,undated,checkpoints,income:totalIn/100,outgoing:totalOut/100,net:(totalIn-totalOut)/100,closing:balance===null?null:balance/100,currency:'AUD',assumptions:'Estimates from unpaid issued invoices, unpaid recorded costs and your planned items. Overdue dated items are assumed today. Recurring plans include future occurrences only. Late payments shifts estimated income by 14 days. Avoid entering the same invoice or cost again as a planned item. No bank connection; project budgets and hosting estimates are excluded unless entered as planned cash flow.'};
 }
 return {calendar,capacity,forecast,opening};
}
