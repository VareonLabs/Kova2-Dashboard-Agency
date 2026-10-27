// Settings: one place, grouped on the left, with the business's own details and branding on the right.
import { INDUSTRY_CHOICES, INDUSTRY_STARTERS, moduleLabels } from './industry-profile.js';
export const SETTINGS_GROUPS=[
  ['Workspace',[['profile','Business details'],['industry','Industry & workflows'],['branding','Branding'],['setup','Areas on or off']]],
  ['Connections',[['connections','Connected accounts']]],
  ['Alerts and data',[['notifications','Notifications'],['backups','Backups'],['history','Action history']]]
];

export function createSettingsUI(ctx){
  const {esc,api}=ctx;
  const profile=()=>ctx.getData().settings?.profile||{};
  const val=k=>profile()[k]??(k==='businessName'?ctx.getData().settings?.businessName:k==='email'?ctx.getData().settings?.email:k==='accentColor'?'#C6F432':'')??'';

  function rail(page){
    return `<nav class="settings-rail" aria-label="Settings">${SETTINGS_GROUPS.map(([group,items])=>`<div class="settings-group"><small>${esc(group)}</small>${items.filter(([id])=>ctx.pageOn(id)).map(([id,label])=>`<button type="button" data-page="${id}" class="${id===page?'active':''}" ${id===page?'aria-current="page"':''}>${esc(label)}</button>`).join('')}</div>`).join('')}</nav>`;
  }
  const wrap=(html,page)=>`<div class="settings-layout">${rail(page)}<div class="settings-body">${html}</div></div>`;

  const field=(id,label,input,full)=>`<div class="field ${full?'full':''}"><label for="${id}">${label}</label>${input}</div>`;
  const text=(key,label,extra='',full=false)=>field('p-'+key,label,`<input id="p-${key}" name="${key}" value="${esc(val(key))}" ${extra}>`,full);

  function profilePage(){
    return ctx.heading('SETTINGS','Business details','Used on forms, documents and anywhere your business name appears.')+ctx.panel('Your business','',`<form id="profile-form" class="panel-body"><div class="form-grid">${text('businessName','Business name *','required maxlength="120"')}${text('legalName','Legal or trading name','maxlength="160"')}${text('abn','ABN','inputmode="numeric" placeholder="11 digits"')}${text('email','Contact email','type="email"')}${text('phone','Phone')}${text('website','Website','type="url" placeholder="https://"')}${text('address','Address','maxlength="300"',true)}<div class="field"><label>Timezone</label><input value="Australia/Brisbane" disabled></div><div class="field"><label>Currency</label><input value="AUD" disabled></div></div><div class="form-error hidden" id="profile-error"></div><div class="form-actions"><button class="btn primary" type="submit">Save details</button></div></form>`);
  }

  function brandingPage(){
    const accent=val('accentColor')||'#C6F432',logo=val('logo');
    return ctx.heading('SETTINGS','Branding','How your business looks on the forms you share and the documents you send.')+ctx.panel('Look and feel','',`<form id="branding-form" class="panel-body"><div class="form-grid">${field('b-accent','Accent colour',`<div class="color-row"><input id="b-accent" type="color" value="${esc(accent)}" aria-label="Accent colour"><input id="b-accent-hex" value="${esc(accent)}" maxlength="7" aria-label="Accent colour hex"></div>`)}${field('b-logo','Logo (PNG, JPEG or WebP, under 150 KB)',`<input id="b-logo" type="file" accept="image/png,image/jpeg,image/webp">${logo?'<button type="button" class="text-btn" id="b-logo-remove">Remove logo</button>':''}`)}${text('formFooter','Line at the bottom of forms','maxlength="300" placeholder="e.g. We reply within one business day."',true)}</div><div class="brand-preview" id="brand-preview" aria-label="Preview"><div class="brand-preview-head">${logo?`<img src="${esc(logo)}" alt="" class="brand-logo-preview">`:''}<strong>${esc(val('businessName')||'Your business')}</strong></div><div class="brand-preview-body"><span>Your name</span><div class="brand-preview-input"></div><button type="button" class="brand-preview-button" id="brand-preview-button" style="background:${esc(accent)}">Send</button></div><small>${esc(val('formFooter')||'')}</small></div><div class="form-error hidden" id="branding-error"></div><div class="form-actions"><button class="btn primary" type="submit">Save branding</button></div></form>`);
  }

  const workspaceProfile=()=>ctx.getData().settings?.workspaceProfile||{};
  const profileInput=(key,label)=>field('industry-'+key,label,`<input id="industry-${key}" name="${key}" value="${esc(workspaceProfile()[key]||'')}" maxlength="100" required>`);
  function industryPage({firstRun=false}={}){
    const p=workspaceProfile(),activeModules=ctx.getData().settings?.modules||p.modules||{},choice=INDUSTRY_CHOICES.includes(p.industry)?p.industry:p.industry?'Other':'';
    const business=ctx.getData().settings?.profile?.businessName||ctx.getData().settings?.businessName||'';
    const moduleChoices=Object.entries(moduleLabels);
    const fields=`${firstRun?field('industry-business','Business name',`<input id="industry-business" name="businessName" value="${esc(business==='VareonHQ'?'':business)}" maxlength="120" required>`):''}
      ${field('industry-choice','Industry',`<select id="industry-choice" name="industryChoice" required><option value="" ${!choice?'selected':''}>Choose an industry</option>${INDUSTRY_CHOICES.map(i=>`<option value="${esc(i)}" ${choice===i?'selected':''}>${esc(i)}</option>`).join('')}</select>`)}
      ${field('industry-custom','Your industry',`<input id="industry-custom" name="industry" value="${esc(choice==='Other'?p.industry:'')}" placeholder="e.g. Property management, healthcare, education" maxlength="100">`)}
      ${field('industry-description','What does your business do?',`<input id="industry-description" name="description" value="${esc(p.description||'')}" placeholder="A short description to guide the workspace and assistant" maxlength="500">`,true)}
      ${profileInput('customerSingular','A person or organisation you serve')}${profileInput('customerPlural','Plural name')}
      ${profileInput('workSingular','Main work item')}${profileInput('workPlural','Plural name')}
      ${profileInput('taskSingular','A step within that work')}${profileInput('taskPlural','Plural name')}
      ${profileInput('completionLabel','Label for finished work')}
      ${field('industry-stages','Workflow stages (one per line)',`<textarea id="industry-stages" name="stages" rows="6" required>${esc((p.stages||[]).join('\n'))}</textarea>`,true)}
      ${field('industry-guidance','Extra guidance for the assistant',`<textarea id="industry-guidance" name="assistantGuidance" rows="4" placeholder="Industry standards, terminology, checks or common constraints">${esc(p.assistantGuidance||'')}</textarea>`,true)}`;
    return ctx.heading('WORKSPACE PROFILE',firstRun?'Set up your workspace':'Industry & workflows',firstRun?'Choose the kind of business you run. The workspace will use this to tailor its areas, language, work stages and assistant. You can change it later.':'The industry profile shapes workspace language, recommended areas, new work stages and assistant guidance. Existing records stay as they are.')+ctx.panel('Make this fit your business','Your industry name is free text. Pick a starter for a head start, then change any label or stage.',`<form id="industry-form" class="panel-body"><div class="form-grid">${fields}</div><div class="form-grid module-picks"><div class="field full"><label>Areas for this workspace</label><p class="row-sub">Connections remain available to every industry. Choose which work areas appear in your everyday navigation.</p><div class="industry-module-grid">${moduleChoices.map(([key,label])=>`<label class="industry-module"><input type="checkbox" name="module-${key}" ${activeModules[key]!==false?'checked':''}><span>${esc(label)}</span></label>`).join('')}</div></div></div><div class="form-error hidden" id="industry-error"></div><div class="form-actions"><button class="btn primary" type="submit">${firstRun?'Finish workspace setup':'Save industry profile'}</button></div></form>`,`<button type="button" class="text-btn" data-page="connections">Connections stay shared across industries ↗</button>`);
  }

  const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read that file'));r.readAsDataURL(file);});
  const contrast=hex=>{const n=parseInt(hex.slice(1),16),l=((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000;return l>150?'#1a1a1a':'#ffffff';};

  function bind(){
    const save=async(form,errorId,body)=>{const err=document.querySelector(errorId);err.classList.add('hidden');try{await api('/profile',{method:'PUT',body:JSON.stringify(body)});await ctx.refresh();ctx.toast('Saved');}catch(e){err.textContent=e.message;err.classList.remove('hidden');}};
    document.querySelector('#profile-form')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);save(e.target,'#profile-error',Object.fromEntries(['businessName','legalName','abn','email','phone','website','address'].map(k=>[k,f.get(k)||''])));});
    const industryForm=document.querySelector('#industry-form');
    if(industryForm){
      const preset=document.querySelector('#industry-choice'),custom=document.querySelector('#industry-custom');
      const loadStarter=name=>{const item=INDUSTRY_STARTERS[name];if(!item)return;for(const [key,value] of Object.entries(item)){if(key==='modules')continue;const input=industryForm.elements.namedItem(key);if(input)input.value=Array.isArray(value)?value.join('\n'):value;}for(const key of Object.keys(moduleLabels)){const input=industryForm.elements.namedItem('module-'+key);if(input)input.checked=item.modules[key]!==false;}};
      preset?.addEventListener('change',()=>{const value=preset.value;if(value==='Other'){custom.closest('.field').hidden=false;custom.value='';custom.focus();}else if(value){custom.closest('.field').hidden=true;custom.value='';loadStarter(value);}else custom.closest('.field').hidden=true;});
      if(preset){custom.closest('.field').hidden=preset.value!=='Other';}
      industryForm.addEventListener('submit',async e=>{e.preventDefault();const error=document.querySelector('#industry-error');error.classList.add('hidden');const f=new FormData(industryForm),industry=preset.value==='Other'?String(f.get('industry')||'').trim():String(preset.value||'').trim();if(!industry){error.textContent='Choose a suggested industry or enter your own.';error.classList.remove('hidden');return;}const modules=Object.fromEntries(Object.keys(moduleLabels).map(key=>[key,f.get('module-'+key)==='on']));const body={industry,description:f.get('description')||'',workSingular:f.get('workSingular')||'',workPlural:f.get('workPlural')||'',taskSingular:f.get('taskSingular')||'',taskPlural:f.get('taskPlural')||'',customerSingular:f.get('customerSingular')||'',customerPlural:f.get('customerPlural')||'',stages:String(f.get('stages')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),completionLabel:f.get('completionLabel')||'',assistantGuidance:f.get('assistantGuidance')||'',modules,completeSetup:true};if(firstRun)body.businessName=f.get('businessName')||'';try{await api('/industry-profile',{method:'PUT',body:JSON.stringify(body)});await ctx.refresh();ctx.toast(firstRun?'Workspace set up':'Industry profile saved');}catch(err){error.textContent=err.message;error.classList.remove('hidden');}});
    }
    const branding=document.querySelector('#branding-form');
    if(branding){
      let logo=val('logo');const hex=document.querySelector('#b-accent-hex'),color=document.querySelector('#b-accent'),preview=document.querySelector('#brand-preview-button');
      const paint=v=>{preview.style.background=v;preview.style.color=contrast(v);};paint(color.value);
      color.oninput=()=>{hex.value=color.value;paint(color.value);};
      hex.oninput=()=>{if(/^#[0-9a-fA-F]{6}$/.test(hex.value)){color.value=hex.value;paint(hex.value);}};
      document.querySelector('#b-logo').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>150*1024){e.target.value='';ctx.toast('Keep the logo under 150 KB');return;}try{logo=await readFile(file);const head=document.querySelector('.brand-preview-head');head.querySelector('img')?.remove();head.insertAdjacentHTML('afterbegin',`<img src="${logo}" alt="" class="brand-logo-preview">`);}catch(err){ctx.toast(err.message);}};
      document.querySelector('#b-logo-remove')?.addEventListener('click',()=>ctx.perform(async()=>{await api('/profile',{method:'PUT',body:JSON.stringify({logo:''})});await ctx.refresh();}));
      branding.addEventListener('submit',e=>{e.preventDefault();save(branding,'#branding-error',{accentColor:hex.value,logo,formFooter:new FormData(branding).get('formFooter')||''});});
    }
  }

  return {profile:profilePage,industry:()=>industryPage(),workspaceSetup:()=>industryPage({firstRun:true}),branding:brandingPage,wrap,bind};
}
