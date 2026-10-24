// Handover of client-owned assets, and the support queue that follows launch.
export const supportState=(request,today)=>{
  if(request.status==='Resolved')return 'Resolved';
  if(request.status==='Waiting on client')return 'Waiting';
  if(request.dueBy&&request.dueBy<today)return 'Overdue';
  if(request.dueBy===today)return 'Due today';
  return 'On track';
};
export const handoverProgress=assets=>{
  const counted=assets.filter(a=>a.status!=='Not applicable'),done=counted.filter(a=>a.status==='Handed over').length;
  return {total:counted.length,done,remaining:counted.length-done,complete:counted.length>0&&done===counted.length};
};

export function createServiceDeskUI(ctx){
  const {esc,api,fmt,badge}=ctx;
  const data=()=>ctx.getData();
  const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Australia/Brisbane'});
  const clientName=id=>data().clients.find(c=>c.id===id)?.name||'No client';

  function handoverPage(){
    const assets=ctx.viewRecords('clientAssets',data().clientAssets||[]);
    const byClient=new Map();
    for(const a of assets)byClient.set(a.clientId,[...(byClient.get(a.clientId)||[]),a]);
    const sections=[...byClient.entries()].map(([id,list])=>{
      const p=handoverProgress(list);
      return ctx.panel(esc(clientName(id)),p.total?(p.complete?'All assets handed over':`${p.done} of ${p.total} handed over`):'Nothing to hand over',`<div><div class="table-wrap"><table class="table"><thead><tr><th>Asset</th><th>Owner</th><th>Where the login is kept</th><th>Stage</th><th></th></tr></thead><tbody>${list.map(a=>`<tr><td><button class="link title-cell" data-edit="clientAssets:${esc(a.id)}">${esc(a.name)}</button><small>${esc(a.kind)}${a.renewalDate?' · renews '+fmt(a.renewalDate):''}</small></td><td>${esc(a.owner)}</td><td>${esc(a.accessNote||'Not recorded')}</td><td>${badge(a.status)}${a.handoverDate?`<small>${fmt(a.handoverDate)}</small>`:''}</td><td>${a.status==='Agency-held'?`<button class="btn small" data-handover="${esc(a.id)}">Mark handed over</button>`:''}</td></tr>`).join('')}</tbody></table></div></div>`,ctx.addButton('clientAssets','Add an asset'));
    }).join('');
    return ctx.heading('HANDOVER','Assets & handover','Who owns each domain, login and file, and what is still with you.',ctx.addButton('clientAssets','Add an asset'))+ctx.toolbar(['All','Agency-held','Handed over'])+(sections||ctx.panel('Assets','',ctx.empty('folder','Nothing recorded yet','List each client’s domains, hosting, repositories and accounts, who owns them, and where the login is kept. Never store the password here.',ctx.addButton('clientAssets','Add an asset'))));
  }

  function supportPage(){
    const t=today(),list=ctx.viewRecords('supportRequests',data().supportRequests||[]).map(r=>({r,state:supportState(r,t)})).sort((a,b)=>(a.r.status==='Resolved')-(b.r.status==='Resolved')||String(a.r.dueBy).localeCompare(String(b.r.dueBy)));
    const open=list.filter(x=>x.r.status!=='Resolved'),overdue=open.filter(x=>x.state==='Overdue').length;
    const body=list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Request</th><th>Client</th><th>Priority</th><th>Stage</th><th>Due</th><th></th></tr></thead><tbody>${list.map(({r,state})=>`<tr><td><button class="link title-cell" data-edit="supportRequests:${esc(r.id)}">${esc(r.title)}</button><small>${esc(r.channel)} · reported ${fmt(r.reportedOn)}</small></td><td>${esc(clientName(r.clientId))}</td><td><span class="badge ${r.priority==='Urgent'?'red':r.priority==='Low'?'gray':''}">${esc(r.priority)}</span></td><td>${badge(r.status)}</td><td>${r.status==='Resolved'?'':fmt(r.dueBy)}${state==='Overdue'?' <span class="badge red">Overdue</span>':state==='Due today'?' <span class="badge amber">Today</span>':''}</td><td>${r.status!=='Resolved'?`<button class="btn small" data-resolve-support="${esc(r.id)}">Resolve</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:ctx.empty('shield','No support requests','Log a request when a client reports a problem or asks for a change after launch. Urgent is due in a day, normal in three, low in a week.',ctx.addButton('supportRequests','Log a request'));
    return ctx.heading('AFTER LAUNCH','Support','Everything clients have asked for since go-live, oldest due first.',ctx.addButton('supportRequests','Log a request'))+ctx.toolbar(['All','New','In progress','Waiting on client','Resolved'])+ctx.panel('Queue',`${open.length} open${overdue?` · ${overdue} overdue`:''}`,list.length?`<div>${body}</div>`:body);
  }

  function bind(){
    document.querySelectorAll('[data-handover]').forEach(b=>b.onclick=()=>ctx.perform(async()=>{await api(`/records/clientAssets/${b.dataset.handover}`,{method:'PUT',body:JSON.stringify({status:'Handed over'})});await ctx.refresh();}));
    document.querySelectorAll('[data-resolve-support]').forEach(b=>b.onclick=()=>ctx.perform(async()=>{await api(`/records/supportRequests/${b.dataset.resolveSupport}`,{method:'PUT',body:JSON.stringify({status:'Resolved'})});await ctx.refresh();}));
  }

  return {handover:handoverPage,support:supportPage,bind};
}
