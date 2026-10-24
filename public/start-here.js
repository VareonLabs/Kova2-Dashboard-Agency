// "Start here": every area of the workspace in plain words, with the jobs people do most one click away.
export function createStartUI(ctx){
  const {esc,icon}=ctx;
  const JOBS=[
    ['New client','clients','users'],['New lead','prospects','users'],['New proposal','proposals','file'],['New invoice','invoices','file'],
    ['Log time','timeEntries','clock'],['New project','projects','folder'],['Log a support request','supportRequests','shield'],['New note','notes','file']
  ];
  function render(){
    const jobs=`<section class="panel start-jobs"><div class="panel-head"><div><h2>Do something now</h2><small>The jobs people start most</small></div></div><div class="start-job-row">${JOBS.map(([label,collection,symbol])=>`<button type="button" class="btn" data-new="${collection}">${icon(symbol)}${esc(label)}</button>`).join('')}<button type="button" class="btn" data-page="chat">${icon('chat')}Ask the assistant</button></div></section>`;
    const areas=ctx.sections().filter(sec=>!sec.top&&ctx.sectionTabs(sec).length).map(sec=>{
      const tabs=ctx.sectionTabs(sec);
      return `<section class="panel start-area"><div class="panel-head"><div><h2>${esc(sec.label)}</h2><small>${esc(sec.blurb||'')}</small></div></div><div class="start-pages">${tabs.map(([id,label,hint])=>`<button type="button" class="start-page" data-page="${id}"><strong>${esc(label)}</strong><span>${esc(hint||'')}</span></button>`).join('')}</div></section>`;
    }).join('');
    return ctx.heading('START HERE','Start here','Everything in VareonHQ and what it is for. Press ⌘K at any time to search for anything.')+(ctx.attention?.()||'')+jobs+`<div class="start-grid">${areas}</div>`;
  }
  return {render};
}
