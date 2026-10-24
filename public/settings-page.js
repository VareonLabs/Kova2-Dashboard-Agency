// Settings: one place, grouped on the left, with the business's own details and branding on the right.
export const SETTINGS_GROUPS=[
  ['Workspace',[['profile','Business details'],['branding','Branding'],['setup','Areas on or off']]],
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

  const readFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Could not read that file'));r.readAsDataURL(file);});
  const contrast=hex=>{const n=parseInt(hex.slice(1),16),l=((n>>16)*299+((n>>8)&255)*587+(n&255)*114)/1000;return l>150?'#1a1a1a':'#ffffff';};

  function bind(){
    const save=async(form,errorId,body)=>{const err=document.querySelector(errorId);err.classList.add('hidden');try{await api('/profile',{method:'PUT',body:JSON.stringify(body)});await ctx.refresh();ctx.toast('Saved');}catch(e){err.textContent=e.message;err.classList.remove('hidden');}};
    document.querySelector('#profile-form')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);save(e.target,'#profile-error',Object.fromEntries(['businessName','legalName','abn','email','phone','website','address'].map(k=>[k,f.get(k)||''])));});
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

  return {profile:profilePage,branding:brandingPage,wrap,bind};
}
