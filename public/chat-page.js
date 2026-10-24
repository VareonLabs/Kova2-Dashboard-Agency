// Full-page chat, laid out like Linear's agent view: a blank chat is one centred composer with examples and recent
// chats under it; an open chat is the thread with the composer docked below. Every chat from GPT, Claude and Codex is
// reachable from the switcher in the top bar. Sending, files, models, stopping and streaming reuse the side assistant's
// composer and handlers, so this page changes where chats are shown, not how they work.
const ENGINES=['GPT','Claude','Codex'];
const EXAMPLES=[
  ['calendar','Plan my week','Turn due work, follow-ups and unpaid invoices into an order to work through','Plan my week. Look at due tasks, prospect follow-ups and unpaid invoices, and give me an order to work through them.'],
  ['mail','Draft a client follow-up','Write a reply that picks up from a client’s latest emails','Help me draft a follow-up to a client. Ask me which client first, then use their latest emails.'],
  ['chart','Check cash flow','See what’s owed to you, what’s due and what’s overdue','Summarise my cash flow: what’s owed to me, what’s due soon and what’s overdue.']
];
const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const storage={get:k=>{try{return localStorage.getItem(k);}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,v);}catch{}}};

export function groupConversations(chats,now=new Date()){
  const today=day(now),dayMs=86400000,yesterday=day(now.getTime()-dayMs),weekAgo=now.getTime()-7*dayMs;
  const groups=[['Today',[]],['Yesterday',[]],['Previous 7 days',[]],['Older',[]]];
  for(const chat of chats){const at=Date.parse(chat.lastMessageAt||chat.createdAt)||0,d=day(at);groups[d===today?0:d===yesterday?1:at>=weekAgo?2:3][1].push(chat);}
  return groups.filter(([,list])=>list.length);
}

export function relativeTime(value,now=new Date()){
  const minutes=Math.max(0,Math.round((now-new Date(value))/60000));
  if(minutes<1)return 'now';if(minutes<60)return minutes+'m';if(minutes<1440)return Math.round(minutes/60)+'h';if(minutes<10080)return Math.round(minutes/1440)+'d';
  return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Brisbane',day:'numeric',month:'short'}).format(new Date(value));
}

export function createChatPage(ctx){
  const {esc,icon}=ctx;let query='',engineFilter='All',lastOpened='';
  const at=c=>c.lastMessageAt||c.createdAt;
  const projectLabel=id=>id?ctx.projectName(id):'Whole business';
  const engineName=e=>e==='GPT'?'ChatGPT':e;
  const tag=e=>`<span class="cp-engine">${esc(e)}</span>`;
  const blank=()=>!ctx.messages().length&&!ctx.isBusy();
  const history=()=>(ctx.getData().conversations||[]).filter(c=>c.hasMessages).sort((a,b)=>(Date.parse(at(b))||0)-(Date.parse(at(a))||0));

  // Top bar: the chat switcher replaces the breadcrumb on this page.
  function crumb(){
    const chat=ctx.currentConversation(),open=!blank()&&chat?.hasMessages;
    return `<div class="breadcrumb cp-crumb"><button type="button" class="cp-switcher" id="cp-switcher" aria-haspopup="dialog" aria-expanded="false" ${ctx.isBusy()?'disabled':''}><span>${esc(open?chat.title:'New chat')}</span>${icon('chevron')}</button>${open?`<span class="cp-crumb-meta">${tag(ctx.getEngine())}${esc(projectLabel(ctx.getProjectId()))}</span>`:''}<button type="button" class="icon-btn" id="new-chat" aria-label="New chat" title="New chat" ${ctx.isBusy()?'disabled':''}>${icon('plus')}</button></div>`;
  }
  function menuRows(){
    const current=ctx.currentConversation(),q=query.trim().toLowerCase();
    const list=history().filter(c=>engineFilter==='All'||c.engine===engineFilter).filter(c=>!q||[c.title,c.engine,projectLabel(c.projectId)].join(' ').toLowerCase().includes(q));
    return groupConversations(list).map(([label,chats])=>`<div class="cp-menu-group">${label}</div>`+chats.map(c=>`<button type="button" class="cp-menu-row ${c.id===current?.id?'active':''}" data-open-chat="${esc(c.id)}"><span class="cp-menu-title">${esc(c.title)}</span><span class="cp-menu-meta">${tag(c.engine)}<span class="cp-menu-project">${esc(projectLabel(c.projectId))}</span><time>${esc(relativeTime(at(c)))}</time></span></button>`).join('')).join('')||`<p class="cp-menu-empty">${q||engineFilter!=='All'?'No chats match.':'Your chats will appear here.'}</p>`;
  }
  function closeMenu(){document.querySelector('#cp-menu')?.remove();document.querySelector('#cp-switcher')?.setAttribute('aria-expanded','false');}
  function openMenu(){
    const button=document.querySelector('#cp-switcher');if(!button||document.querySelector('#cp-menu'))return closeMenu();
    const menu=document.createElement('div');menu.id='cp-menu';menu.className='cp-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Chats');
    menu.innerHTML=`<div class="cp-menu-tools"><div class="search">${icon('search')}<input id="cp-search" type="search" placeholder="Search chats" aria-label="Search chats" value="${esc(query)}" autocomplete="off"></div><div class="view-toggle cp-filter" role="group" aria-label="Filter by assistant">${['All',...ENGINES].map(e=>`<button type="button" data-chat-filter="${e}" class="${engineFilter===e?'active':''}" aria-pressed="${engineFilter===e}">${e}</button>`).join('')}</div></div><div class="cp-menu-list" id="cp-menu-list">${menuRows()}</div>`;
    document.body.append(menu);const box=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(box.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=(box.bottom+6)+'px';button.setAttribute('aria-expanded','true');
    const search=menu.querySelector('#cp-search'),paint=()=>{menu.querySelector('#cp-menu-list').innerHTML=menuRows();bindRows(menu);};
    search.addEventListener('input',()=>{query=search.value;paint();});
    menu.querySelectorAll('[data-chat-filter]').forEach(el=>el.onclick=()=>{engineFilter=el.dataset.chatFilter;menu.querySelectorAll('[data-chat-filter]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',String(b===el));});paint();});
    menu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeMenu();button.focus();}});
    bindRows(menu);search.focus();
  }
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#cp-menu,#cp-switcher,#cp-all'))closeMenu();});
  function bindRows(root=document){root.querySelectorAll('[data-open-chat]').forEach(el=>el.onclick=()=>ctx.perform(async()=>{const chat=(ctx.getData().conversations||[]).find(c=>c.id===el.dataset.openChat);closeMenu();if(chat?.id===ctx.currentConversation()?.id)return;await ctx.open(chat);}));}

  // Blank chat
  function pickers(){
    const d=ctx.getData(),engine=ctx.getEngine(),projectId=ctx.getProjectId(),busy=ctx.isBusy()?'disabled':'';
    const projects=[['','Whole business'],...(d.projects||[]).filter(p=>p.status!=='Archived').map(p=>[p.id,p.name])];
    return `<label class="cp-pick"><span class="sr-only">Assistant</span><select id="cp-engine" ${busy}>${ENGINES.map(e=>`<option value="${e}" ${e===engine?'selected':''}>${engineName(e)}</option>`).join('')}</select></label><label class="cp-pick"><span class="sr-only">Working in</span><select id="cp-project" ${busy}>${projects.map(([v,l])=>`<option value="${esc(v)}" ${v===projectId?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  }
  function signInNote(){
    const d=ctx.getData(),engine=ctx.getEngine();
    if(engine==='Codex'||(engine==='Claude'?d.connections.claude?.connected:d.connections.gpt))return '';
    return `<p class="cp-note">${engine==='Claude'?'Claude isn’t signed in on this Mac yet.':'ChatGPT isn’t connected yet.'} <button type="button" class="link" data-action="${engine==='Claude'?'setup-claude':'setup-gpt'}">${engine==='Claude'?'Sign in with Claude':'Continue with ChatGPT'}</button></p>`;
  }
  function examples(){
    if(storage.get('vareon-chat-examples')==='hidden')return '';
    return `<section class="cp-examples" aria-label="Examples"><div class="cp-section-head"><span>Get started with some examples</span><button type="button" class="icon-btn" id="cp-hide-examples" aria-label="Hide examples" title="Hide examples">${icon('x')}</button></div><div class="cp-example-grid">${EXAMPLES.map(([symbol,title,text,prompt])=>`<button type="button" class="cp-example" data-suggest="${esc(prompt)}">${icon(symbol)}<strong>${esc(title)}</strong><span>${esc(text)}</span></button>`).join('')}</div></section>`;
  }
  function recent(){
    const list=history().slice(0,5);if(!list.length)return '';
    return `<section class="cp-recent" aria-label="Recent chats"><div class="cp-section-head"><span>Recent chats</span>${history().length>list.length?`<button type="button" class="text-btn" id="cp-all">All chats</button>`:''}</div>${list.map(c=>`<button type="button" class="cp-recent-row" data-open-chat="${esc(c.id)}"><span class="cp-recent-title">${esc(c.title)}</span><span class="cp-recent-meta">${tag(c.engine)}${esc(projectLabel(c.projectId))}</span><time>${esc(relativeTime(at(c)))}</time></button>`).join('')}</section>`;
  }

  // Open chat
  function messageHTML(m){
    const user=m.role==='user',engine=m.engine||ctx.getEngine();
    return `<article data-message-id="${esc(m.id||'')}" class="cp-msg ${user?'cp-msg-user':'cp-msg-ai'} ${m.failed?'cp-msg-error':''}"><header class="cp-msg-head"><span class="cp-avatar" aria-hidden="true">${user?'Y':esc(engine[0])}</span><strong>${user?'You':esc(engineName(engine))}</strong>${m.createdAt?`<time>${esc(relativeTime(m.createdAt))}</time>`:''}</header><div class="cp-msg-body">${ctx.attachments(m)}${ctx.content(m)}</div></article>`;
  }

  function render(){
    const engine=ctx.getEngine();
    if(blank())return `<div class="cp cp-blank"><div class="cp-scroll" id="chat-scroll"><div class="cp-column"><img class="cp-mark" src="/vareon-mark.svg" alt="" aria-hidden="true"><div class="cp-compose">${ctx.composer({placeholder:`Ask ${engineName(engine)}…`,lead:pickers()})}</div>${signInNote()}${examples()}${recent()}</div></div></div>`;
    return `<div class="cp cp-open"><div class="cp-scroll" id="chat-scroll"><div class="cp-column">${ctx.messages().map(messageHTML).join('')}${ctx.progress()}${ctx.isBusy()?'<div class="cp-working">Working on it…</div>':''}</div></div><div class="cp-dock"><div class="cp-column"><div class="cp-compose">${ctx.composer({placeholder:`Reply to ${engineName(engine)}…`})}</div></div></div></div>`;
  }
  // The app redraws in the background (usage, streaming), so an open switcher is re-anchored rather than closed.
  function keepMenu(){
    const menu=document.querySelector('#cp-menu'),button=document.querySelector('#cp-switcher');if(!menu)return;
    if(!button){closeMenu();return;}
    const box=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(box.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=(box.bottom+6)+'px';button.setAttribute('aria-expanded','true');
    menu.querySelector('#cp-menu-list').innerHTML=menuRows();bindRows(menu);
  }
  function bind(){
    keepMenu();bindRows();
    document.querySelector('#cp-switcher')?.addEventListener('click',openMenu);
    document.querySelector('#cp-all')?.addEventListener('click',openMenu);
    document.querySelector('#cp-hide-examples')?.addEventListener('click',()=>{storage.set('vareon-chat-examples','hidden');document.querySelector('.cp-examples')?.remove();});
    // Changing the assistant or project on a blank chat keeps it blank, rather than reopening that pair's last chat.
    document.querySelector('#cp-engine')?.addEventListener('change',e=>ctx.perform(()=>ctx.startChat(e.target.value,ctx.getProjectId())));
    document.querySelector('#cp-project')?.addEventListener('change',e=>ctx.perform(()=>ctx.startChat(ctx.getEngine(),e.target.value)));
    // Land at the latest message when a different chat opens; otherwise the app keeps the reader's scroll position.
    const id=ctx.currentConversation()?.id||'',scroll=document.querySelector('#chat-scroll');
    if(id!==lastOpened&&scroll){if(!blank())scroll.scrollTop=scroll.scrollHeight;lastOpened=id;}
  }
  return {render,crumb,bind,closeMenu};
}
