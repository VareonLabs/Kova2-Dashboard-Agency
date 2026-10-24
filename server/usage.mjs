import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

export function normaliseUsage(result) {
  const buckets=result.rateLimitsByLimitId?Object.entries(result.rateLimitsByLimitId):result.rateLimits?[['codex',result.rateLimits]]:[];
  const preferred=buckets.find(([id])=>id==='codex')||buckets[0];
  if(!preferred)return {available:false,reason:'No rate-limit windows were returned for the signed-in account.'};
  const [bucketId,bucket]=preferred;const windows=[bucket.primary,bucket.secondary].filter(Boolean);
  const windowFor=duration=>{const value=windows.find(w=>w.windowDurationMins===duration);if(!value||!Number.isFinite(value.usedPercent))return null;return {usedPercent:Math.max(0,Math.min(100,value.usedPercent)),remainingPercent:Math.max(0,Math.min(100,100-value.usedPercent)),resetsAt:value.resetsAt,windowDurationMins:value.windowDurationMins};};
  return {available:true,source:'Codex / ChatGPT plan',bucketId,fiveHour:windowFor(300),weekly:windowFor(10080),fetchedAt:new Date().toISOString(),note:'These are the Codex limits supplied by the ChatGPT sign-in. These figures measure Codex usage; the GPT OAuth connection has its own ChatGPT plan grant.'};
}
export function createUsageReader(root) {
  let cache=null,cachedAt=0,pending;
  async function read(force=false) {
    if(!force&&cache&&Date.now()-cachedAt<60000)return cache;if(pending)return pending;
    pending=new Promise(resolveResult=>{
      const child=spawn(process.execPath,[resolve(root,'node_modules/@openai/codex/bin/codex.js'),'app-server','--listen','stdio://'],{stdio:['pipe','pipe','pipe'],env:process.env});
      let done=false;
      const finish=result=>{if(done)return;done=true;clearTimeout(timeout);child.stdin.end();child.kill('SIGTERM');cache=result;cachedAt=Date.now();resolveResult(result);};
      const timeout=setTimeout(()=>finish({available:false,reason:'Usage could not be read from the local Codex sign-in.',fetchedAt:new Date().toISOString()}),12000);
      child.stderr.resume();child.on('error',()=>finish({available:false,reason:'The local Codex usage reader could not start.'}));child.on('exit',()=>{if(!done)finish({available:false,reason:'The usage service closed before returning account limits.'});});
      const lines=createInterface({input:child.stdout});lines.on('line',line=>{try{const message=JSON.parse(line);if(message.id===1){if(message.error)return finish({available:false,reason:message.error.message});child.stdin.write(JSON.stringify({method:'initialized'})+'\n');child.stdin.write(JSON.stringify({id:2,method:'account/rateLimits/read',params:{}})+'\n');}if(message.id===2)finish(message.error?{available:false,reason:message.error.message}:normaliseUsage(message.result));}catch{}});
      child.stdin.write(JSON.stringify({id:1,method:'initialize',params:{clientInfo:{name:'vareonhq_local',title:'VareonHQ',version:'0.2.0'}}})+'\n');
    }).finally(()=>{pending=null;});return pending;
  }
  return {read};
}
