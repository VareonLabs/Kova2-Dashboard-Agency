// ⌘K command menu: jump to any page or record and run common actions from the keyboard. Everything it opens goes
// through the same editors and routes as clicking, so no action here bypasses a rule.
export function score(text,query){
  const t=String(text).toLowerCase(),q=query.trim().toLowerCase();if(!q)return 1;
  const at=t.indexOf(q);if(at>=0)return 100-Math.min(at,50)+(at===0?20:0);
  let i=0,gaps=0,last=-1;for(const ch of q){const next=t.indexOf(ch,i);if(next<0)return 0;if(last>=0)gaps+=next-last-1;last=next;i=next+1;}
  return Math.max(1,40-gaps);
}

export function createCommandMenu(ctx){
  const {esc,icon}=ctx;let open=false,query='',active=0,items=[],returnFocus=null;
  function commands(){
    const d=ctx.getData(),list=[];
    const add=(group,label,hint,run,iconName='arrow',keywords='')=>list.push({group,label,hint,run,icon:iconName,text:label+' '+hint+' '+keywords});
    for(const [collection,label,iconName] of [['tasks','task','check'],['clients','client','users'],['projects','project','folder'],['meetingNotes','meeting notes','mic'],['notes','note','file'],['contracts','contract','file'],['documents','document','file'],['prospects','prospect','users'],['invoices','invoice','file']])add('Create',`New ${label}`,'Opens the editor',()=>ctx.newRecord(collection),'plus','add create');
    for(const [page,iconName,label] of ctx.pages())add('Go to',label,'Page',()=>ctx.go(page),iconName,page);
    for(const p of d.projects||[])add('Projects',p.name,[p.status,p.workflow==='Software'?'software':''].filter(Boolean).join(' · '),()=>ctx.openProject(p.id),'folder');
    for(const c of d.clients||[])add('Clients',c.name,c.company||c.status||'',()=>ctx.openClient(c.id),'users',c.email||'');
    for(const t of (d.tasks||[]).slice(0,800))add('Tickets',(t.ticketKey?t.ticketKey+' ':'')+t.title,[t.status,ctx.projectName(t.projectId)].filter(Boolean).join(' · '),()=>ctx.openRecord('tasks',t),'check',t.requirement||'');
    for(const p of d.prospects||[])add('Prospects',p.name,p.company||p.status||'',()=>ctx.openRecord('prospects',p),'users');
    for(const e of ['GPT','Claude','Codex'])add('Assistant',`Use ${e}`,'Switch the assistant engine',()=>ctx.setEngine(e),'chat','assistant engine switch');
    add('Assistant','Show or hide the assistant','Toggle the chat panel',()=>ctx.toggleAssistant(),'chat');
    return list;
  }
  function results(){
    const q=query.trim(),all=commands().map(c=>({...c,score:score(c.text,q)})).filter(c=>c.score>0);
    const ranked=q?all.sort((a,b)=>b.score-a.score):all.filter(c=>['Create','Go to','Assistant'].includes(c.group));
    const top=ranked.slice(0,q?14:18);
    if(q)top.push({group:'Search',label:`Search everything for “${q}”`,hint:'Emails, notes, memory and files',run:()=>ctx.search(q),icon:'search'});
    return top;
  }
  function paint(){
    const root=document.querySelector('#command-root');if(!root)return;items=results();active=Math.min(active,Math.max(items.length-1,0));
    let group='';const rows=items.map((c,i)=>{const head=c.group!==group?`<li class="cmd-group" role="presentation">${esc(c.group)}</li>`:'';group=c.group;return head+`<li role="option" id="cmd-${i}" class="cmd-item ${i===active?'active':''}" aria-selected="${i===active}" data-cmd="${i}">${icon(c.icon)}<span class="cmd-label">${esc(c.label)}</span><span class="cmd-hint">${esc(c.hint)}</span></li>`;}).join('');
    root.querySelector('.cmd-list').innerHTML=rows||'<li class="cmd-empty">Nothing matches. Press Enter to search everything.</li>';
    root.querySelector('#cmd-input').setAttribute('aria-activedescendant',items.length?'cmd-'+active:'');
    root.querySelectorAll('[data-cmd]').forEach(el=>{el.onmousemove=()=>{if(active!==Number(el.dataset.cmd)){active=Number(el.dataset.cmd);paint();}};el.onclick=()=>run(Number(el.dataset.cmd));});
    root.querySelector('.cmd-item.active')?.scrollIntoView({block:'nearest'});
  }
  function run(index){const item=items[index];if(!item)return;close();item.run();}
  function show(){
    if(open)return;if(document.querySelector('.modal')){ctx.toast('Close the open form first.');return;}
    open=true;query='';active=0;returnFocus=document.activeElement;
    const root=document.createElement('div');root.id='command-root';
    root.innerHTML=`<div class="cmd-overlay"><div class="cmd-panel" role="dialog" aria-modal="true" aria-label="Command menu"><label class="cmd-search">${icon('search')}<input id="cmd-input" role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-autocomplete="list" placeholder="Jump to, create or search…" autocomplete="off" spellcheck="false"><kbd>esc</kbd></label><ul class="cmd-list" id="cmd-list" role="listbox"></ul><div class="cmd-foot"><span>↑↓ to move</span><span>↵ to open</span><span>⌘K anywhere</span></div></div></div>`;
    document.body.append(root);const input=root.querySelector('#cmd-input');
    root.querySelector('.cmd-overlay').onclick=e=>{if(e.target.classList.contains('cmd-overlay'))close();};
    input.oninput=()=>{query=input.value;active=0;paint();};
    input.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();active=Math.min(active+1,items.length-1);paint();}else if(e.key==='ArrowUp'){e.preventDefault();active=Math.max(active-1,0);paint();}else if(e.key==='Enter'){e.preventDefault();run(active);}else if(e.key==='Escape'){e.preventDefault();close();}else if(e.key==='Tab')e.preventDefault();};
    paint();input.focus();
  }
  function close(){open=false;document.querySelector('#command-root')?.remove();if(returnFocus?.isConnected)returnFocus.focus();}
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopImmediatePropagation();open?close():show();}},true);
  return {show,close,isOpen:()=>open};
}
