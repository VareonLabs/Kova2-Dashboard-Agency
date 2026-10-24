import { financeSummary, cents } from './finance.mjs';
import { createPlanning, plusDays } from './planning.mjs';
import { brisbaneDay, recordDay } from '../public/operations-data.js';

// Owner view across every client and project. Health is rule-based and every rating lists the reasons behind it,
// so nothing is a black-box score. Money is recorded ledger data in AUD, not bank-verified cash.
const OPEN=t=>!['Done','Cancelled'].includes(t.status);
const rank={'Off track':0,'At risk':1,'On track':2,'Not started':3};

export function projectHealth(project,{tasks,evidence,labour,expenses,activityAt,today}){
  const reasons=[],add=(level,text)=>reasons.push({level,text});
  const open=tasks.filter(OPEN),done=tasks.filter(t=>t.status==='Done').length,total=tasks.filter(t=>t.status!=='Cancelled').length;
  const overdue=open.filter(t=>recordDay(t.dueDate)&&recordDay(t.dueDate)<today),blocked=open.filter(t=>t.status==='Blocked');
  const latestChecks=new Map();for(const e of [...evidence].filter(e=>e.kind==='Check').sort((a,b)=>(a.sequence||0)-(b.sequence||0)))latestChecks.set(e.taskId+'|'+String(e.title).trim().toLowerCase(),e);
  const failing=[...latestChecks.values()].filter(e=>e.result==='Failed'&&open.some(t=>t.id===e.taskId));
  const cost=(cents(labour)+expenses.reduce((n,e)=>n+cents(e.amount),0))/100,budget=Number(project.budget||0),used=budget?cost/budget:0;
  const due=recordDay(project.dueDate),daysLeft=due?Math.round((Date.parse(due+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000):null,progress=total?done/total:0;
  const idle=activityAt?Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(activityAt))/86400000):null;
  if(project.status==='Complete')return {health:'Complete',reasons:[],progress:{done,total},cost,budget,used,daysLeft,idle,overdue:0,blocked:0,failing:0};
  if(due&&daysLeft<0)add('Off track',`Past its due date by ${-daysLeft} day${daysLeft===-1?'':'s'} with ${open.length} open`);
  else if(due&&daysLeft<=7&&total&&progress<0.8)add('At risk',`Due in ${daysLeft} day${daysLeft===1?'':'s'} at ${Math.round(progress*100)}% done`);
  if(budget&&used>1)add('Off track',`Recorded cost is ${Math.round(used*100)}% of budget`);else if(budget&&used>=0.85)add('At risk',`Recorded cost is ${Math.round(used*100)}% of budget`);
  if(overdue.length>=3)add('Off track',`${overdue.length} overdue tasks`);else if(overdue.length)add('At risk',`${overdue.length} overdue task${overdue.length===1?'':'s'}`);
  if(blocked.length)add('At risk',`${blocked.length} blocked: ${blocked.slice(0,2).map(t=>t.ticketKey||t.title).join(', ')}`);
  if(failing.length)add('At risk',`${failing.length} failing check${failing.length===1?'':'s'}`);
  if(project.status==='Active'&&idle!==null&&idle>=14)add('At risk',`No recorded activity for ${idle} days`);
  const health=reasons.some(r=>r.level==='Off track')?'Off track':reasons.length?'At risk':project.status==='Planning'&&!done?'Not started':'On track';
  if(!due&&project.status==='Active')reasons.push({level:'Note',text:'No due date, so schedule risk is unknown'});
  if(!budget&&project.status==='Active')reasons.push({level:'Note',text:'No budget, so cost risk is unknown'});
  return {health,reasons,progress:{done,total},cost,budget,used,daysLeft,idle,overdue:overdue.length,blocked:blocked.length,failing:failing.length};
}

export function portfolio(store,now=new Date()){
  const today=brisbaneDay(now),tasks=store.list('tasks'),evidence=store.list('ticketEvidence'),time=store.list('timeEntries'),finance=financeSummary(store,{now});
  const lastTouch=projectId=>[...tasks.filter(t=>t.projectId===projectId),...store.list('notes').filter(n=>n.projectId===projectId),...evidence.filter(e=>e.projectId===projectId),...store.list('documents').filter(d=>d.projectId===projectId),...time.filter(t=>t.projectId===projectId),...store.list('emails').filter(m=>m.projectId===projectId)].map(r=>r.updatedAt||r.createdAt).filter(Boolean).sort().at(-1)||'';
  const clientName=id=>store.get('clients',id)?.name||'No client';
  const projects=store.list('projects').map(p=>{
    const own=tasks.filter(t=>t.projectId===p.id),labour=time.filter(t=>t.projectId===p.id).reduce((n,t)=>n+t.minutes/60*(t.hourlyCost||0),0);
    const h=projectHealth(p,{tasks:own,evidence:evidence.filter(e=>e.projectId===p.id),labour,expenses:finance.expenses.filter(e=>e.projectId===p.id),activityAt:lastTouch(p.id)||p.updatedAt,today});
    return {id:p.id,name:p.name,clientId:p.clientId||'',client:clientName(p.clientId),status:p.status,workflow:p.workflow||'Simple',dueDate:p.dueDate||'',...h};
  }).sort((a,b)=>(rank[a.health]??4)-(rank[b.health]??4)||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')));
  const clients=store.list('clients').map(c=>{
    const own=projects.filter(p=>p.clientId===c.id),invoices=finance.invoices.filter(i=>i.clientId===c.id||own.some(p=>p.id===i.projectId)),money=key=>invoices.reduce((n,i)=>n+cents(i[key]),0)/100;
    const invoiced=invoices.filter(i=>!['Draft','Void'].includes(i.status)).reduce((n,i)=>n+cents(i.amount),0)/100,cost=own.reduce((n,p)=>n+cents(p.cost),0)/100,overdue=invoices.filter(i=>i.state==='Overdue').reduce((n,i)=>n+cents(i.outstanding),0)/100;
    const live=own.filter(p=>!['Complete'].includes(p.status)),worst=live.map(p=>p.health).sort((a,b)=>(rank[a]??4)-(rank[b]??4))[0];
    const reasons=[...(overdue?[`${new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(overdue)} overdue`]:[]),...live.filter(p=>['Off track','At risk'].includes(p.health)).map(p=>`${p.name}: ${p.health.toLowerCase()}`)];
    return {id:c.id,name:c.name,status:c.status,health:overdue&&worst!=='Off track'?'At risk':worst||'No active work',reasons,activeProjects:live.length,invoiced,paid:money('paid'),outstanding:money('outstanding'),overdue,cost,margin:Math.round((invoiced-cost)*100)/100};
  }).sort((a,b)=>b.invoiced-a.invoiced);
  const planning=createPlanning(store),weekday=(new Date(today+'T12:00:00Z').getUTCDay()+6)%7,monday=plusDays(today,-weekday);
  const capacity=[0,7,14,21].map(offset=>{const week=planning.calendar({start:plusDays(monday,offset),view:'week'}),hours=k=>Math.round(week.days.reduce((n,d)=>n+d[k],0)*10)/10;return {weekStart:week.start,capacity:hours('capacity'),planned:hours('plannedHours'),tasks:hours('taskHours'),meetings:hours('meetingHours'),unestimated:week.days.reduce((n,d)=>n+d.unestimated,0),overbookedDays:week.days.filter(d=>d.overbooked).length};});
  const counts=Object.fromEntries(['Off track','At risk','On track','Not started','Complete'].map(h=>[h,projects.filter(p=>p.health===h).length]));
  return {today,currency:'AUD',counts,projects,clients,capacity,unplaced:tasks.filter(t=>OPEN(t)&&!t.scheduledDate&&!t.dueDate).length,unestimated:tasks.filter(t=>OPEN(t)&&!Number(t.estimatedHours)).length,totals:finance.totals,note:'Health is rule-based from recorded tasks, dates, costs, checks and activity. Money is recorded ledger data, not bank-verified.'};
}
