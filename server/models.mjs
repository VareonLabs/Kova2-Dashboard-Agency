import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

export function normaliseModels(models){
  return models.filter(m=>!m.hidden&&typeof m.model==='string').map(m=>({slug:m.model,name:m.displayName||m.model,description:m.description||'',isDefault:!!m.isDefault}));
}
export function createCodexModelReader(root){
  let cached,pending,cachedAt=0;
  return {async read(force=false){
    if(!force&&cached&&Date.now()-cachedAt<300000)return cached;
    if(pending)return pending;
    pending=new Promise((resolveResult,reject)=>{
      const env={...process.env};for(const key of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL'])delete env[key];
      const child=spawn(process.execPath,[resolve(root,'node_modules/@openai/codex/bin/codex.js'),'app-server','--listen','stdio://'],{env,stdio:['pipe','pipe','pipe']});
      let done=false,models=[],requestId=2;const cursors=new Set();
      const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);child.stdin.end();child.kill('SIGTERM');if(error)reject(new Error(error));else{cached=normaliseModels(models);cachedAt=Date.now();resolveResult(cached);}};
      const timer=setTimeout(()=>finish('Codex models could not be loaded. Check your local Codex sign-in and try Refresh.'),15000);
      child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',()=>finish('The local Codex model reader could not start.'));child.on('exit',()=>{if(!done)finish('Codex closed before returning its model list.');});
      const list=cursor=>child.stdin.write(JSON.stringify({id:requestId,method:'model/list',params:{includeHidden:false,limit:100,...(cursor?{cursor}:{})}})+'\n');
      createInterface({input:child.stdout}).on('line',line=>{try{const message=JSON.parse(line);if(message.id===1){if(message.error)return finish(message.error.message);child.stdin.write(JSON.stringify({method:'initialized'})+'\n');list();}else if(message.id===requestId){if(message.error)return finish(message.error.message);models.push(...message.result.data);const cursor=message.result.nextCursor;if(cursor){if(cursors.has(cursor)||cursors.size>=20)return finish('Codex returned an incomplete model list. Refresh and try again.');cursors.add(cursor);requestId++;list(cursor);}else finish();}}catch{}});
      child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'vareonhq_local',title:'VareonHQ',version:'0.3.0'}}})+'\n');
    }).finally(()=>pending=null);return pending;
  }};
}
