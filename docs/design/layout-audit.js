// Layout audit for VareonHQ. Paste into the browser console on a running app (or run through the browser tool).
// It visits every page through the ⌘K menu with the desktop title strip simulated, and reports:
//   centre  text not centred in its own box (buttons, pills, badges, counts, tabs) by more than 1.5px
//   select  dropdowns with uneven vertical padding or a line height that does not fit the box
//   double  two parallel lines (borders or 1px rings) 1-6px apart over most of their length
//   clip    text cut off by its box without an ellipsis
//   overlap two controls (buttons, links, fields, breadcrumb names) drawn on top of each other
//   offscreen a control pushed past the edge of the window
// Returns {pages, total, findings:[{check, where, detail, count, pages}]}.
window.layoutAudit = async function layoutAudit({pages=null, settle=550}={}){
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  if(!document.querySelector('#audit-titlebar')){const st=document.createElement('style');st.id='audit-titlebar';st.textContent='body{--desktop-titlebar:36px;padding-top:36px}body:before{content:"";height:36px;position:fixed;top:0;left:0;right:0;z-index:200;background:#f3f5f7}';document.head.append(st);}
  const go=async label=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}));await wait(120);const i=document.querySelector('#cmd-input');if(!i)return false;i.value=label;i.dispatchEvent(new Event('input'));await wait(60);let g='',t;for(const li of document.querySelectorAll('.cmd-list li')){if(li.classList.contains('cmd-group'))g=li.textContent;else if(g==='Go to'&&li.querySelector('.cmd-label')?.textContent===label){t=li;break;}}if(!t){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('#command-root')?.remove();return false;}t.click();await wait(settle);return true;};
  const visible=el=>{const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;const cs=getComputedStyle(el);return cs.visibility!=='hidden'&&+cs.opacity>0.05&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;};
  const alpha=c=>{if(!c||c==='transparent')return 0;const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return 1;const p=m[1].split(/[ ,/]+/).filter(Boolean);return p.length>3?parseFloat(p[3]):1;};
  const sig=el=>{const cls=[...el.classList].filter(c=>!/^(active|on|open|done)$/.test(c)).slice(0,2).join('.');const parent=el.parentElement;const pc=parent?[...parent.classList].slice(0,1).join('.'):'';return `${pc?'.'+pc+' > ':''}${el.tagName.toLowerCase()}${cls?'.'+cls:''}`;};
  const shaped=el=>{const cs=getComputedStyle(el);return alpha(cs.backgroundColor)>0.05||parseFloat(cs.borderTopWidth)>0&&alpha(cs.borderTopColor)>0.05||cs.boxShadow!=='none';};
  const findings=new Map(),add=(check,el,detail,page)=>{const k=check+'|'+sig(el);const f=findings.get(k)||{check,where:sig(el),detail,count:0,pages:new Set()};f.count++;f.pages.add(page);findings.set(k,f);};
  const textRect=el=>{let L=1e9,T=1e9,R=-1e9,B=-1e9;const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.textContent.trim())continue;let p=n.parentElement,own=true;while(p&&p!==el){const cs=getComputedStyle(p);if(cs.position==='absolute'||cs.position==='fixed'||(shaped(p)&&p.getBoundingClientRect().height<el.getBoundingClientRect().height-2)||cs.display==='none'){own=false;break;}p=p.parentElement;}if(!own)continue;const rg=document.createRange();rg.selectNodeContents(n);for(const r of rg.getClientRects()){if(!r.width)continue;L=Math.min(L,r.left);T=Math.min(T,r.top);R=Math.max(R,r.right);B=Math.max(B,r.bottom);}}return L<1e8?{L,T,R,B}:null;};
  function scan(page){
    const root=document;
    // centre
    for(const el of root.querySelectorAll('button,summary,a.btn,.badge,.count,.ops-notification,.pf-pill,.local-pill,.req-pending,.env-health,.tree-flag,.tree-count,.cp-engine,.l-mark,.nav-client-mark,.avatar,kbd,.page-tabs>*,.view-toggle>*,.tabs>*')){
      if(!visible(el))continue;
      const r=el.getBoundingClientRect();if(r.height>48)continue;const cs=getComputedStyle(el);if(cs.display==='inline'||cs.display==='contents')continue;
      const t=textRect(el);if(!t||t.B-t.T>r.height+1)continue;
      const bt=parseFloat(cs.borderTopWidth),bb=parseFloat(cs.borderBottomWidth),pt=parseFloat(cs.paddingTop),pb=parseFloat(cs.paddingBottom);
      if(t.B-t.T>(r.height-bt-bb-pt-pb)*1.6)continue; // multi-line content: not a single-line control
      const dy=(t.T+t.B)/2-(r.top+bt+pt+(r.height-bt-bb-pt-pb)/2);
      if(Math.abs(dy)>1.5)add('centre',el,`text ${dy>0?'low':'high'} by ${Math.abs(dy).toFixed(1)}px in ${Math.round(r.height)}px box`,page);
      const small=r.width<=40&&shaped(el);
      if(small){const dx=(t.L+t.R)/2-(r.left+r.right)/2;if(Math.abs(dx)>1.5)add('centre',el,`text ${dx>0?'right':'left'} by ${Math.abs(dx).toFixed(1)}px in ${Math.round(r.width)}px bubble`,page);}
    }
    // select
    for(const el of root.querySelectorAll('select')){
      if(!visible(el))continue;const cs=getComputedStyle(el),r=el.getBoundingClientRect();
      const pt=parseFloat(cs.paddingTop),pb=parseFloat(cs.paddingBottom),bt=parseFloat(cs.borderTopWidth),bb=parseFloat(cs.borderBottomWidth),lh=cs.lineHeight==='normal'?parseFloat(cs.fontSize)*1.25:parseFloat(cs.lineHeight),inner=r.height-pt-pb-bt-bb;
      if(Math.abs(pt-pb)>1)add('select',el,`padding top ${pt}px vs bottom ${pb}px`,page);
      else if(inner<lh-1)add('select',el,`line ${lh}px does not fit ${inner.toFixed(0)}px inside ${Math.round(r.height)}px box`,page);
    }
    // double lines
    const segs=[];
    for(const el of root.querySelectorAll('body *')){
      if(el.closest('#zoomlab'))continue;if(!visible(el))continue;const cs=getComputedStyle(el),r=el.getBoundingClientRect();if(r.width<24&&r.height<24)continue;
      const ring=/0px 0px 0px 1px/.test(cs.boxShadow); // outer and inset 1px rings both draw a visible line
      const edge=(side,on)=>on&&segs.push({el,side,h:side==='top'||side==='bottom',pos:side==='top'?r.top:side==='bottom'?r.bottom:side==='left'?r.left:r.right,a:side==='top'||side==='bottom'?r.left:r.top,b:side==='top'||side==='bottom'?r.right:r.bottom});
      for(const side of ['top','bottom','left','right']){const w=parseFloat(cs[`border-${side}-width`]||cs['border'+side[0].toUpperCase()+side.slice(1)+'Width']);const c=cs['border'+side[0].toUpperCase()+side.slice(1)+'Color'];edge(side,w>0&&alpha(c)>0.05||ring);}
    }
    // A line only counts if it is actually on screen: not covered by an overlay or another layer, and not scrolled out of a clipping parent.
    const seen=sg=>{const mid=(Math.max(sg.a,0)+Math.min(sg.b,sg.h?innerWidth:innerHeight))/2,inward=sg.side==='top'||sg.side==='left'?0.5:-0.5;const x=sg.h?mid:sg.pos+inward,y=sg.h?sg.pos+inward:mid;if(x<0||y<0||x>=innerWidth||y>=innerHeight)return false;const hit=document.elementFromPoint(x,y);return !!hit&&(hit===sg.el||sg.el.contains(hit));};
    const onScreen=segs.filter(seen);segs.length=0;segs.push(...onScreen);
    for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const s=segs[i],t=segs[j];if(s.h!==t.h||s.el===t.el)continue;const d=Math.abs(s.pos-t.pos);if(d<1||d>6)continue;const ov=Math.min(s.b,t.b)-Math.max(s.a,t.a),short=Math.min(s.b-s.a,t.b-t.a);if(ov<24||ov<short*0.6)continue;const k=[sig(s.el),sig(t.el)].sort().join('  +  ');const f=findings.get('double|'+k)||{check:'double',where:k,detail:`${d.toFixed(1)}px apart, ${s.h?'horizontal':'vertical'}`,count:0,pages:new Set()};f.count++;f.pages.add(page);findings.set('double|'+k,f);}
    // overlap: controls that sit on top of one another (neither inside the other)
    const ctrls=[...root.querySelectorAll('button,a,select,input,textarea,summary,.breadcrumb strong,.breadcrumb > span')].filter(el=>visible(el)&&!el.closest('#zoomlab,.usage-card,.page-tabs-menu,.composer-popover,.nav-flyout,#cp-menu'));
    // Trim each box to what its scrolling/clipping parents actually show, so content scrolled out of view does not count.
    const clipped=el=>{let r=el.getBoundingClientRect(),L=r.left,T=r.top,R=r.right,B=r.bottom;for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const cs=getComputedStyle(p);if(cs.overflowX!=='visible'||cs.overflowY!=='visible'){const q=p.getBoundingClientRect();if(cs.overflowX!=='visible'){L=Math.max(L,q.left);R=Math.min(R,q.right);}if(cs.overflowY!=='visible'){T=Math.max(T,q.top);B=Math.min(B,q.bottom);}}if(cs.position==='fixed')break;}return {left:L,top:T,right:R,bottom:B};};
    const boxes=ctrls.map(el=>({el,r:clipped(el)})).filter(b=>b.r.right-b.r.left>1&&b.r.bottom-b.r.top>1);
    // Dialogs, drawers and menus are meant to sit over the page, so only controls on the same layer are compared.
    // Pinned (sticky) bars are their own layer too: content is meant to scroll underneath them.
    const layer=el=>{for(let e=el;e&&e!==document.body;e=e.parentElement){if(e.matches('.modal-overlay,#command-root,#cp-menu,.nav-flyout,.page-tabs-menu,.usage-card'))return e;const p=getComputedStyle(e).position;if(p==='sticky'||p==='fixed')return e;}return document.body;};
    // offscreen: a visible control pushed past the window edge (the top bar overflowing on a phone, for example).
    for(const b of boxes){if(layer(b.el)===document.body&&(b.r.right>innerWidth+1||b.r.left<-1))add('offscreen',b.el,`${Math.round(Math.max(b.r.right-innerWidth,-b.r.left))}px outside the window`,page);}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const A=boxes[i],B=boxes[j];if(A.el.contains(B.el)||B.el.contains(A.el)||layer(A.el)!==layer(B.el))continue;const w=Math.min(A.r.right,B.r.right)-Math.max(A.r.left,B.r.left),h=Math.min(A.r.bottom,B.r.bottom)-Math.max(A.r.top,B.r.top);if(w>2&&h>2){const k=[sig(A.el),sig(B.el)].sort().join('  ×  ');const f=findings.get('overlap|'+k)||{check:'overlap',where:k,detail:`${Math.round(w)}×${Math.round(h)}px on top of each other`,count:0,pages:new Set()};f.count++;f.pages.add(page);findings.set('overlap|'+k,f);}}
    // clip
    for(const el of root.querySelectorAll('button,a,span,strong,small,label,h1,h2,h3,p,td,th,summary,.nav-label')){
      if(!visible(el))continue;const cs=getComputedStyle(el);if(cs.overflow==='visible'||cs.textOverflow==='ellipsis')continue;if(el.scrollWidth>el.clientWidth+1&&el.clientWidth>0&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))add('clip',el,`${el.scrollWidth-el.clientWidth}px of text hidden`,page);
    }
  }
  const all=pages||['Chat','Inbox','My work','Tasks','Reviews','Clients','Pipeline','Projects','Calendar & workload','Budgets & invoices','Contracts','Client reports','Automations','Marketing','Website analytics','Media library','Prospect follow-ups','Client onboarding','Time & profitability','Meeting notes','Notepad','Live coding preview','Codex workspace','Portfolio','Overview','Cash-flow forecast','Document library','Renewals & reviews','Notifications','Technology','Connections','AI project','Action history','Backups & restore','Workspace setup','Proposals','Retainers','Team & capacity','Assets & handover','Support','Deals','Contacts','Dashboards','Start here','Business details','Branding','Forms','SEO & AEO','Ads','Social','Calls','Texts'];
  let visited=0;
  for(const label of all){if(await go(label)){visited++;scan(label);}}
  // one client page, one project page, the editor drawer and the command menu
  document.querySelector('[data-client-nav-tab="Overview"]')?.click();await wait(settle);scan('Client overview');visited++;
  document.querySelector('[data-client-nav-tab="Tickets"]')?.click();await wait(settle);scan('Client tickets');visited++;
  for(const tab of ['Communication','Sales','Finances','Support','People','Documents','Content','Files','Notes','Websites','Reports','Activity','Projects']){const b=document.querySelector(`[data-client-tab="${tab}"]`);if(!b)continue;b.click();await wait(settle);scan('Client '+tab.toLowerCase());visited++;}
  if(await go('Projects')){const open=[...document.querySelectorAll('.content [data-goto-project],.content .project-card button,.content [data-open-project]')][0];open?.click();await wait(settle);scan('Project page');visited++;}
  const edit=document.querySelector('[data-edit^="tasks:"],[data-edit^="projects:"]');if(edit){edit.click();await wait(settle);scan('Editor drawer');visited++;document.querySelector('#close-modal')?.click();await wait(200);}
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}));await wait(200);scan('Command menu');visited++;document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}));
  const list=[...findings.values()].map(f=>({...f,pages:[...f.pages].slice(0,4).join(', ')+(f.pages.size>4?` +${f.pages.size-4}`:'')})).sort((a,b)=>a.check.localeCompare(b.check)||b.count-a.count);
  return {pages:visited,total:list.reduce((n,f)=>n+f.count,0),findings:list};
};
