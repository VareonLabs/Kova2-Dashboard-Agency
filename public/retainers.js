// Monthly retainers and billable time that has not been invoiced yet.
const brisbaneMonth=(d=new Date())=>d.toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'}).slice(0,7);
const monthLabel=m=>new Date(m+'-01T00:00:00Z').toLocaleDateString('en-AU',{month:'long',year:'numeric',timeZone:'UTC'});
const cents=n=>Math.round(Number(n||0)*100);

export function unbilledByClient(data){
  const projectClient=Object.fromEntries((data.projects||[]).map(p=>[p.id,p.clientId]));
  const groups=new Map();
  for(const e of data.timeEntries||[]){
    if(!e.billable||e.invoiceId)continue;
    const clientId=e.clientId||projectClient[e.projectId]||'';
    const g=groups.get(clientId)||{clientId,minutes:0,value:0,entries:0,noRate:0};
    if(e.billRate>0){g.minutes+=e.minutes;g.value+=Math.round(e.minutes*cents(e.billRate)/60);g.entries++;}else g.noRate++;
    groups.set(clientId,g);
  }
  return [...groups.values()].filter(g=>g.entries||g.noRate).map(g=>({...g,value:g.value/100})).sort((a,b)=>b.value-a.value);
}

export function retainerUsage(data,retainer,month=brisbaneMonth()){
  const projects=new Set((data.projects||[]).filter(p=>p.clientId===retainer.clientId).map(p=>p.id));
  const minutes=(data.timeEntries||[]).filter(e=>e.billable&&String(e.date).startsWith(month)&&(e.clientId===retainer.clientId||projects.has(e.projectId))).reduce((n,e)=>n+e.minutes,0);
  return {hours:Math.round(minutes/6)/10,included:retainer.includedHours,over:retainer.includedHours>0&&minutes/60>retainer.includedHours};
}

export function createRetainersUI(ctx){
  const {esc,api,currency,fmt,badge}=ctx;
  const data=()=>ctx.getData();
  const clientName=id=>data().clients.find(c=>c.id===id)?.name||'No client';

  function retainersPanel(){
    const list=ctx.viewRecords('retainers',data().retainers||[]),month=brisbaneMonth();
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Retainer</th><th>Monthly</th><th>${monthLabel(month)} hours</th><th>Stage</th><th></th></tr></thead><tbody>${list.map(r=>{const u=retainerUsage(data(),r,month),done=r.invoicedMonths.includes(month),last=r.invoicedMonths.at(-1);return `<tr><td><button class="link title-cell" data-edit="retainers:${r.id}">${esc(r.name)}</button><small>${esc(clientName(r.clientId))}${last?' · last invoiced '+monthLabel(last):''}</small></td><td>${currency(r.monthlyAmount)}</td><td>${u.hours}${u.included?` of ${u.included}`:''}${u.over?' <span class="badge red">Over</span>':''}</td><td>${badge(r.status)}</td><td>${r.status==='Active'?(done?'<span class="sub">Invoiced</span>':`<button class="btn small" data-invoice-retainer="${r.id}">Invoice ${monthLabel(month).split(' ')[0]}</button>`):''}</td></tr>`;}).join('')}</tbody></table></div>`:ctx.empty('clock','No retainers yet','Set a monthly amount and included hours for a client, then raise each month’s draft invoice in one click.',ctx.addButton('retainers','Add a retainer'));
    return ctx.panel('Retainers',`${list.length} retainers`,body,list.length?ctx.addButton('retainers','Add a retainer'):'');
  }

  function unbilledPanel(){
    const groups=unbilledByClient(data());
    const body=groups.length?`<div><div class="table-wrap"><table class="table"><thead><tr><th>Client</th><th>Billable hours</th><th>Value</th><th>Needs a rate</th><th></th></tr></thead><tbody>${groups.map(g=>`<tr><td>${esc(clientName(g.clientId))}</td><td>${Math.round(g.minutes/6)/10}</td><td>${currency(g.value)}</td><td>${g.noRate?`${g.noRate} entr${g.noRate>1?'ies':'y'}`:''}</td><td>${g.entries?`<button class="btn small" data-invoice-time="${esc(g.clientId)}">Invoice time</button>`:''}</td></tr>`).join('')}</tbody></table></div></div>`:ctx.empty('check','Everything billable is invoiced','Time you log as billable shows up here until it is on an invoice.');
    return ctx.panel('Unbilled work','Billable time not yet on an invoice',body);
  }

  function render(){
    return ctx.heading('BILLING','Retainers & unbilled work','Raise recurring invoices and bill the time that has not been billed.',ctx.addButton('retainers','Add a retainer'))+ctx.toolbar(['All','Active','Paused','Ended'])+retainersPanel()+unbilledPanel();
  }

  function bind(){
    document.querySelectorAll('[data-invoice-retainer]').forEach(b=>b.onclick=()=>ctx.perform(async()=>{const result=await api(`/retainers/${b.dataset.invoiceRetainer}/invoice`,{method:'POST',body:'{}'});await ctx.refresh();ctx.toast(`Draft invoice “${result.invoice.title}” raised.`);}));
    document.querySelectorAll('[data-invoice-time]').forEach(b=>b.onclick=()=>ctx.perform(async()=>{const invoice=await api(`/clients/${b.dataset.invoiceTime}/invoice-time`,{method:'POST',body:'{}'});await ctx.refresh();ctx.toast(`Draft invoice “${invoice.title}” raised for ${currency(invoice.amount)}.`);}));
  }

  return {render,bind};
}
