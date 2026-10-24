export function createModelControls(ctx){
  const {api,esc,icon}=ctx,catalog={},errors={},pending={},times={};
  const modelKey=e=>e==='Codex'?'codexModel':e==='Claude'?'claudeModel':'gptModel';
  const key=()=>{const d=ctx.getData();return ctx.getEngine()==='Codex'?'Codex':ctx.getEngine()==='Claude'?'Claude':'GPT:'+String(d.connections.chatgpt?.clientId||'')+':'+String(d.connections.chatgpt?.email||'');};
  function contents(){
    const engine=ctx.getEngine(),d=ctx.getData(),id=key(),models=catalog[id]||[],value=d.settings[modelKey(engine)]||'',connected=engine==='Codex'||(engine==='Claude'?d.connections.claude?.connected:d.connections.gpt);
    const options=[...(engine==='Codex'?[{slug:'',name:'Codex default'}]:[]),...models];if(value&&!options.some(m=>m.slug===value))options.push({slug:value,name:value});
    return `<label for="assistant-model">Model</label><div class="model-picker-row"><select id="assistant-model" aria-label="${engine} model" ${ctx.isBusy()||!connected||!models.length?'disabled':''}>${options.length?options.map((m,i)=>`<option value="${esc(m.slug)}" ${value===m.slug||!value&&engine==='GPT'&&i===0?'selected':''}>${esc(m.name||m.slug)}</option>`).join(''):`<option>${connected?(errors[id]?'Models unavailable':'Loading models…'):engine==='Claude'?'Sign in to Claude first':'Connect ChatGPT first'}</option>`}</select><button type="button" class="icon-btn" id="refresh-assistant-models" aria-label="Refresh ${engine} models" ${pending[id]||!connected||ctx.isBusy()?'disabled':''}>${icon('refresh')}</button></div>${errors[id]?`<small class="model-error" role="status">${esc(errors[id])}</small>`:'<small>Applies to the next message and scheduled work.</small>'}`;
  }
  function html(){return `<div class="assistant-model-control" id="assistant-model-control">${contents()}</div>`;}
  function update(){const target=document.querySelector('#assistant-model-control');if(target){target.innerHTML=contents();bindEvents();}}
  async function load(force=false){
    const engine=ctx.getEngine(),id=key();if(engine==='GPT'&&!ctx.getData().connections.gpt||engine==='Claude'&&!ctx.getData().connections.claude?.connected)return;
    if(pending[id]||!force&&times[id]&&Date.now()-times[id]<300000)return;
    pending[id]=true;errors[id]='';update();
    try{catalog[id]=await api('/assistant/models?engine='+engine+(force?'&refresh=true':''));if(!catalog[id].length)errors[id]='No models were returned for this connection.';}
    catch(error){errors[id]=error.message;}
    finally{pending[id]=false;times[id]=Date.now();if(key()===id)update();}
  }
  function bindEvents(){
    document.querySelector('#refresh-assistant-models')?.addEventListener('click',()=>load(true));
    document.querySelector('#assistant-model')?.addEventListener('change',async event=>{
      const engine=ctx.getEngine(),input=event.target,previous=ctx.getData().settings[modelKey(engine)]||'';input.disabled=true;
      try{const result=await api('/assistant/model',{method:'PUT',body:JSON.stringify({engine,model:input.value})});ctx.getData().settings[modelKey(engine)]=result.model;ctx.toast(engine+' model saved');}
      catch(error){ctx.toast(error.message);input.value=previous;}
      finally{input.disabled=ctx.isBusy();}
    });
  }
  return {html,refresh:()=>load(true),bind(){bindEvents();load();}};
}
