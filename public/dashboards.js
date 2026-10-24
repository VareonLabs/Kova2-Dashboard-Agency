// Dashboards you assemble yourself from a catalogue of business figures. Every figure is computed from records already in the workspace.
import {dealStats} from './deals.js';
import {unbilledByClient} from './retainers.js';
import {supportState} from './service-desk.js';
import {teamLoad} from './people.js';

const today=(now=new Date())=>now.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});
const sum=list=>list.reduce((n,x)=>n+x,0);
const open=t=>!['Done','Cancelled'].includes(t.status);

export const METRICS=[
  {key:'openDealValue',group:'Sales',label:'Open deal value',format:'money',page:'deals',value:d=>dealStats(d.deals||[]).openValue},
  {key:'weightedForecast',group:'Sales',label:'Weighted forecast',format:'money',page:'deals',value:d=>dealStats(d.deals||[]).weighted},
  {key:'wonThisMonth',group:'Sales',label:'Won this month',format:'money',page:'deals',value:(d,now)=>dealStats(d.deals||[],now).wonThisMonth},
  {key:'winRate',group:'Sales',label:'Win rate',format:'percent',page:'deals',value:d=>dealStats(d.deals||[]).winRate},
  {key:'outstanding',group:'Money',label:'Outstanding invoices',format:'money',page:'finance',value:d=>d.finance?.totals?.outstanding||0},
  {key:'overdueAmount',group:'Money',label:'Overdue invoices',format:'money',page:'finance',value:d=>d.finance?.totals?.overdue||0},
  {key:'unbilled',group:'Money',label:'Unbilled work',format:'money',page:'retainers',value:d=>sum(unbilledByClient(d).map(g=>g.value))},
  {key:'retainerMonthly',group:'Money',label:'Monthly retainers',format:'money',page:'retainers',value:d=>sum((d.retainers||[]).filter(r=>r.status==='Active').map(r=>r.monthlyAmount))},
  {key:'activeClients',group:'Clients',label:'Active clients',format:'number',page:'clients',value:d=>(d.clients||[]).filter(c=>c.status==='Active').length},
  {key:'openSupport',group:'Clients',label:'Open support requests',format:'number',page:'support',value:d=>(d.supportRequests||[]).filter(r=>r.status!=='Resolved').length},
  {key:'overdueSupport',group:'Clients',label:'Overdue support requests',format:'number',page:'support',value:(d,now)=>(d.supportRequests||[]).filter(r=>supportState(r,today(now))==='Overdue').length},
  {key:'activeProjects',group:'Delivery',label:'Active projects',format:'number',page:'projects',value:d=>(d.projects||[]).filter(p=>p.status==='Active').length},
  {key:'openTickets',group:'Delivery',label:'Open tickets',format:'number',page:'todo',value:d=>(d.tasks||[]).filter(open).length},
  {key:'pendingReviews',group:'Delivery',label:'Reviews waiting',format:'number',page:'reviews',value:d=>(d.approvals||[]).filter(a=>a.status==='Pending').length},
  {key:'overCapacityWeeks',group:'Team',label:'Over-capacity weeks ahead',format:'number',page:'team',value:(d,now)=>sum(teamLoad(d,{now}).rows.map(r=>r.weekly.filter(h=>r.capacity&&h>r.capacity).length))}
];
export const METRIC_KEYS=METRICS.map(m=>m.key);
export const DEFAULT_WIDGETS=['openDealValue','weightedForecast','outstanding','overdueAmount','unbilled','openSupport','activeProjects','pendingReviews'];
export const GROUPS=[...new Set(METRICS.map(m=>m.group))];

export function formatMetric(metric,value,currency){
  if(value===null||value===undefined)return '–';
  if(metric.format==='money')return currency(value);
  if(metric.format==='percent')return value+'%';
  return String(value);
}

export function createDashboardsUI(ctx){
  const {esc,api,currency}=ctx;
  const data=()=>ctx.getData();
  let selected='',editing=false;
  const dashboards=()=>{const list=data().dashboards||[];return list.length?list:[{id:'',name:'Business at a glance',widgets:DEFAULT_WIDGETS}];};
  const current=()=>{const list=dashboards();return list.find(d=>d.id===selected)||list[0];};

  function tiles(dash){
    const items=dash.widgets.map(k=>METRICS.find(m=>m.key===k)).filter(Boolean);
    if(!items.length)return ctx.empty('chart','This dashboard is empty','Choose Customise and tick the figures you want to see here.');
    return `<div class="dash-grid">${items.map(m=>`<button type="button" class="dash-tile" data-page="${m.page}"><small>${esc(m.label)}</small><strong>${esc(formatMetric(m,m.value(data()),currency))}</strong></button>`).join('')}</div>`;
  }

  function editor(dash){
    return `<div class="dash-edit">${GROUPS.map(g=>`<fieldset><legend>${esc(g)}</legend>${METRICS.filter(m=>m.group===g).map(m=>`<label class="check"><input type="checkbox" data-dash-metric="${m.key}" ${dash.widgets.includes(m.key)?'checked':''}> ${esc(m.label)}</label>`).join('')}</fieldset>`).join('')}<div class="dash-edit-actions"><input id="dash-name" aria-label="Dashboard name" value="${esc(dash.name)}" maxlength="80"><button type="button" class="btn small" id="dash-rename">Rename</button>${dash.id?'<button type="button" class="btn small danger" id="dash-delete">Delete dashboard</button>':''}</div></div>`;
  }

  function render(){
    const list=dashboards(),dash=current();
    const pills=`<div class="page-tabs" role="group" aria-label="Dashboards">${list.map(d=>`<button type="button" data-dash="${esc(d.id)}" class="${d===dash?'active':''}" aria-pressed="${d===dash}">${esc(d.name)}</button>`).join('')}<button type="button" id="dash-new">+ New dashboard</button></div>`;
    const action=`<button class="btn ${editing?'primary':''}" id="dash-edit">${editing?'Done':'Customise'}</button>`;
    return ctx.heading('INSIGHTS','Dashboards','Pick the figures that matter to you. Each one opens the page behind it.',action)+pills+(editing?editor(dash):'')+tiles(dash);
  }

  async function ensureSaved(){
    const dash=current();if(dash.id)return dash;
    const created=await api('/records/dashboards',{method:'POST',body:JSON.stringify({name:dash.name,widgets:dash.widgets})});
    await ctx.refresh();selected=created.id;return created;
  }

  function bind(){
    document.querySelectorAll('[data-dash]').forEach(b=>b.onclick=()=>{selected=b.dataset.dash;ctx.render();});
    document.querySelector('#dash-edit')?.addEventListener('click',()=>ctx.perform(async()=>{if(!editing)await ensureSaved();editing=!editing;ctx.render();}));
    document.querySelector('#dash-new')?.addEventListener('click',()=>ctx.perform(async()=>{const created=await api('/records/dashboards',{method:'POST',body:JSON.stringify({name:'New dashboard',widgets:[]})});await ctx.refresh();selected=created.id;editing=true;ctx.render();}));
    document.querySelectorAll('[data-dash-metric]').forEach(box=>box.onchange=()=>ctx.perform(async()=>{
      const dash=current(),on=box.checked,widgets=on?[...dash.widgets,box.dataset.dashMetric]:dash.widgets.filter(k=>k!==box.dataset.dashMetric);
      await api(`/records/dashboards/${dash.id}`,{method:'PUT',body:JSON.stringify({widgets})});await ctx.refresh();
    }));
    document.querySelector('#dash-rename')?.addEventListener('click',()=>ctx.perform(async()=>{const dash=current();await api(`/records/dashboards/${dash.id}`,{method:'PUT',body:JSON.stringify({name:document.querySelector('#dash-name').value})});await ctx.refresh();}));
    document.querySelector('#dash-delete')?.addEventListener('click',()=>ctx.perform(async()=>{const dash=current();await api(`/records/dashboards/${dash.id}`,{method:'DELETE'});selected='';editing=false;await ctx.refresh();}));
  }

  return {render,bind};
}
