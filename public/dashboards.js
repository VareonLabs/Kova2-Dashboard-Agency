// Dashboards you assemble yourself from a catalogue of business figures. Every figure is computed from records already in the workspace.
import {dealStats,DEAL_STAGES} from './deals.js';
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

export function dashboardCashFlow(d,months=6,now=new Date()){
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+1,1));
  return Array.from({length:months},(_,index)=>{
    const date=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+index,1));
    const key=date.toISOString().slice(0,7);
    return {key,label:new Intl.DateTimeFormat('en-AU',{month:'short',timeZone:'UTC'}).format(date),
      received:sum((d.payments||[]).filter(p=>p.paidDate?.startsWith(key)).map(p=>Number(p.amount)||0)),
      costs:sum((d.expenses||[]).filter(e=>e.paid&&e.date?.startsWith(key)).map(e=>Number(e.amount)||0))};
  });
}

export function createDashboardsUI(ctx){
  const {esc,api,currency}=ctx;
  const data=()=>ctx.getData();
  let selected='',editing=false,period=6;
  const dashboards=()=>{const list=data().dashboards||[];return list.length?list:[{id:'',name:'Business at a glance',widgets:DEFAULT_WIDGETS}];};
  const current=()=>{const list=dashboards();return list.find(d=>d.id===selected)||list[0];};

  function tiles(dash){
    const items=dash.widgets.map(k=>METRICS.find(m=>m.key===k)).filter(Boolean);
    if(!items.length)return ctx.empty('chart','This dashboard is empty','Choose Customise and tick the figures you want to see here.');
    return `<div class="dash-grid">${items.map(m=>`<button type="button" class="dash-tile" data-page="${m.page}"><small>${esc(m.label)}</small><strong>${esc(formatMetric(m,m.value(data()),currency))}</strong></button>`).join('')}</div>`;
  }

  function salesOverview(){
    const deals=data().deals||[],stats=dealStats(deals),won=deals.filter(x=>x.stage==='Won'),lost=deals.filter(x=>x.stage==='Lost'),openDeals=deals.filter(x=>!['Won','Lost'].includes(x.stage));
    const value=list=>sum(list.map(x=>Number(x.value)||0));
    const openValue=value(openDeals),wonValue=value(won),lostValue=value(lost),totalValue=openValue+wonValue+lostValue;
    const total=Math.max(1,deals.length),openPct=openDeals.length/total*100,wonPct=won.length/total*100;
    const ring=`conic-gradient(#c6f432 0 ${openPct}%,#24313a ${openPct}% ${openPct+wonPct}%,#c7ced5 ${openPct+wonPct}% 100%)`;
    const wonRate=stats.winRate??0;
    const stages=DEAL_STAGES.filter(x=>x!=='Lost').map(stage=>({stage,items:deals.filter(x=>x.stage===stage)}));
    const maxStage=Math.max(1,...stages.map(x=>x.items.length));
    const statusRows=[['Open',openDeals.length,'#c6f432'],['Won',won.length,'#24313a'],['Lost',lost.length,'#c7ced5']];
    return `<div class="hl-grid" aria-label="Sales dashboard">
      <section class="hl-widget"><div class="hl-widget-head"><div><h2>Opportunity status</h2><p>All recorded deals</p></div><button type="button" data-page="deals" aria-label="Open deals">↗</button></div><div class="hl-status-body"><div class="hl-donut" style="background:${ring}" role="img" aria-label="${deals.length} opportunities: ${openDeals.length} open, ${won.length} won, ${lost.length} lost"><div><strong>${deals.length}</strong><small>deals</small></div></div><div class="hl-status-list">${statusRows.map(([label,count,color])=>`<div><i style="background:${color}"></i><span>${label}</span><strong>${count}</strong></div>`).join('')}</div></div></section>
      <section class="hl-widget"><div class="hl-widget-head"><div><h2>Opportunity value</h2><p>Potential and closed revenue</p></div><button type="button" data-page="deals" aria-label="Open deals">↗</button></div><div class="hl-value-total"><strong>${esc(currency(totalValue))}</strong><span>total value</span></div><div class="hl-value-bar" role="img" aria-label="${esc(currency(openValue))} open, ${esc(currency(wonValue))} won, ${esc(currency(lostValue))} lost"><i style="width:${totalValue?openValue/totalValue*100:0}%"></i><i style="width:${totalValue?wonValue/totalValue*100:0}%"></i><i style="width:${totalValue?lostValue/totalValue*100:0}%"></i></div><div class="hl-value-rows"><div><span>Open</span><strong>${esc(currency(openValue))}</strong></div><div><span>Won</span><strong>${esc(currency(wonValue))}</strong></div><div><span>Lost</span><strong>${esc(currency(lostValue))}</strong></div></div></section>
      <section class="hl-widget"><div class="hl-widget-head"><div><h2>Conversion rate</h2><p>Won out of closed deals</p></div><button type="button" data-page="deals" aria-label="Open deals">↗</button></div><div class="hl-conversion"><div class="hl-gauge" style="--rate:${wonRate}%" role="img" aria-label="${wonRate}% win rate"><div><strong>${stats.winRate===null?'—':wonRate+'%'}</strong><small>win rate</small></div></div><div class="hl-conversion-foot"><span>${won.length} won</span><span>${lost.length} lost</span></div></div></section>
      <section class="hl-widget hl-funnel"><div class="hl-widget-head"><div><h2>Sales funnel</h2><p>Deals across your pipeline</p></div><button type="button" data-page="deals">View deals →</button></div><div class="hl-funnel-body">${stages.map((row,index)=>`<div class="hl-funnel-row"><span>${esc(row.stage)}</span><div><i style="width:${row.items.length/maxStage*100}%;background:${index===stages.length-1?'#8bb411':'#c6f432'}"></i></div><strong>${row.items.length}</strong><small>${esc(currency(value(row.items)))}</small></div>`).join('')}</div></section>
      <section class="hl-widget hl-distribution"><div class="hl-widget-head"><div><h2>Stage distribution</h2><p>Where opportunities sit now</p></div><button type="button" data-page="deals">View pipeline →</button></div><div class="hl-dist-body">${DEAL_STAGES.map(stage=>{const n=deals.filter(x=>x.stage===stage).length;return `<div><span>${esc(stage)}</span><div class="hl-dist-track"><i style="width:${n/total*100}%"></i></div><strong>${n}</strong><small>${deals.length?Math.round(n/deals.length*100):0}%</small></div>`;}).join('')}</div></section>
    </div>`;
  }

  function insights(){
    const d=data(),flow=dashboardCashFlow(d,period),peak=Math.max(1,...flow.flatMap(m=>[m.received,m.costs]));
    const coord=(value,index)=>`${24+index*(432/Math.max(1,flow.length-1))},${142-(value/peak)*112}`;
    const received=flow.map((m,i)=>coord(m.received,i)).join(' '),costs=flow.map((m,i)=>coord(m.costs,i)).join(' ');
    const work=[...(d.tasks||[]).filter(open).map(x=>({title:x.title,type:'Task',detail:x.status||'Open',date:x.dueDate||'',page:'todo'})),
      ...(d.supportRequests||[]).filter(x=>x.status!=='Resolved').map(x=>({title:x.title,type:'Support',detail:x.status||'Open',date:x.dueDate||x.reportedOn||'',page:'support'}))]
      .sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).slice(0,4);
    return `<div class="dash-insights">
      <section class="dash-panel dash-chart-panel"><div class="dash-panel-head"><div><h2>Cash flow</h2><p>Recorded payments and paid costs</p></div><div class="dash-period" role="group" aria-label="Chart period"><button type="button" data-dash-period="6" aria-pressed="${period===6}">6 months</button><button type="button" data-dash-period="12" aria-pressed="${period===12}">12 months</button></div></div>
        <div class="dash-chart-total"><strong>${esc(currency(sum(flow.map(m=>m.received))))}</strong><span>received in this period</span></div>
        <div class="dash-legend"><span><i class="received"></i>Received</span><span><i class="costs"></i>Paid costs</span></div>
        <div class="dash-chart" role="img" aria-label="${esc(flow.map(m=>`${m.label}: ${currency(m.received)} received, ${currency(m.costs)} paid costs`).join('; '))}"><svg viewBox="0 0 480 160" preserveAspectRatio="none" aria-hidden="true">${[30,67,104,142].map(y=>`<path class="dash-gridline" d="M24 ${y}H456"/>`).join('')}<polyline class="dash-line-costs" points="${costs}"/><polyline class="dash-line-received" points="${received}"/>${flow.map((m,i)=>`<circle class="dash-dot" cx="${24+i*(432/Math.max(1,flow.length-1))}" cy="${142-(m.received/peak)*112}" r="3"/>`).join('')}</svg><div class="dash-chart-labels">${flow.map(m=>`<span>${m.label}</span>`).join('')}</div></div>
        ${flow.every(m=>!m.received&&!m.costs)?'<p class="dash-chart-empty">No recorded payments or paid costs for this period.</p>':''}
      </section>
      <section class="dash-panel dash-work-panel"><div class="dash-panel-head"><div><h2>Work requiring attention</h2><p>Open tasks and support requests, nearest date first</p></div><button type="button" class="dash-panel-link" data-page="todo">Open board →</button></div><div class="dash-table-wrap"><table class="dash-table"><thead><tr><th>Item</th><th>Type</th><th>Status</th><th>Date</th></tr></thead><tbody>${work.length?work.map(row=>`<tr><td><button type="button" class="dash-row-link" data-page="${row.page}">${esc(row.title)}</button></td><td>${row.type}</td><td>${esc(row.detail)}</td><td>${esc(row.date||'—')}</td></tr>`).join(''):'<tr><td colspan="4" class="dash-table-empty">No open work to show.</td></tr>'}</tbody></table></div></section>
    </div>`;
  }

  function editor(dash){
    return `<div class="dash-edit">${GROUPS.map(g=>`<fieldset><legend>${esc(g)}</legend>${METRICS.filter(m=>m.group===g).map(m=>`<label class="tick"><input type="checkbox" data-dash-metric="${m.key}" ${dash.widgets.includes(m.key)?'checked':''}> ${esc(m.label)}</label>`).join('')}</fieldset>`).join('')}<div class="dash-edit-actions"><input id="dash-name" aria-label="Dashboard name" value="${esc(dash.name)}" maxlength="80"><button type="button" class="btn small" id="dash-rename">Rename</button>${dash.id?'<button type="button" class="btn small danger" id="dash-delete">Delete dashboard</button>':''}</div></div>`;
  }

  function render(){
    const list=dashboards(),dash=current();
    const pills=`<div class="page-tabs" role="group" aria-label="Dashboards">${list.map(d=>`<button type="button" data-dash="${esc(d.id)}" class="${d===dash?'active':''}" aria-pressed="${d===dash}">${esc(d.name)}</button>`).join('')}<button type="button" id="dash-new">+ New dashboard</button></div>`;
    const action=`<button class="btn ${editing?'primary':''}" id="dash-edit">${editing?'Done':'Customise'}</button>`;
    const leadMetrics=['openDealValue','outstanding','activeProjects','pendingReviews'].map(key=>METRICS.find(m=>m.key===key));
    const summary=`<div class="hl-summary" aria-label="Business summary">${leadMetrics.map(m=>`<button type="button" class="hl-summary-item" data-page="${m.page}"><span>${esc(m.label)}</span><strong>${esc(formatMetric(m,m.value(data()),currency))}</strong><small>View ${esc(m.group.toLowerCase())} →</small></button>`).join('')}</div>`;
    const sales=(data().deals||[]).length
      ? `<div class="hl-section-title"><h2>Sales performance</h2><button type="button" data-page="deals">Open pipeline →</button></div>${salesOverview()}`
      : `<section class="hl-sales-empty"><div><small>SALES PERFORMANCE</small><h2>Your pipeline will appear here</h2><p>Record your first deal to see opportunity status, conversion and stage charts based on real data.</p></div><button type="button" class="btn" data-page="deals">Open pipeline →</button></section>`;
    return `<div class="hl-dashboard"><div class="hl-title-row"><div><h1>Dashboard</h1><p>A clear view of sales, money and work.</p></div>${action}</div><div class="hl-toolbar">${pills}<span class="hl-updated">Updated from your saved workspace</span></div>${editing?editor(dash):''}${dash.widgets.length?summary+insights()+sales+`<details class="hl-more-metrics"><summary>More business figures</summary>${tiles(dash)}</details>`:tiles(dash)}</div>`;
  }

  async function ensureSaved(){
    const dash=current();if(dash.id)return dash;
    const created=await api('/records/dashboards',{method:'POST',body:JSON.stringify({name:dash.name,widgets:dash.widgets})});
    await ctx.refresh();selected=created.id;return created;
  }

  function bind(){
    document.querySelectorAll('[data-dash-period]').forEach(button=>button.onclick=()=>{period=Number(button.dataset.dashPeriod);ctx.render();});
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
