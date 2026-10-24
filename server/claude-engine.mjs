import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

// The Claude engine drives the owner's own Claude Code installation. VareonHQ never
// reads, stores or forwards Claude credentials: sign-in, refresh and plan limits all
// stay inside the local `claude` CLI, exactly as the Codex engine does with Codex.
const CREDENTIAL_VARIABLES=['ANTHROPIC_API_KEY','ANTHROPIC_AUTH_TOKEN','ANTHROPIC_BASE_URL','CLAUDE_CODE_OAUTH_TOKEN','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_USE_VERTEX'];
export const claudeModels=[{slug:'',name:'Claude default'},{slug:'opus',name:'Claude Opus'},{slug:'sonnet',name:'Claude Sonnet'},{slug:'haiku',name:'Claude Haiku'}];

export function normaliseClaudeUsage(result) {
  const data=result?.response||result||{};
  if(data.rate_limits_available===false||!data.rate_limits)return {available:false,reason:data.subscription_type?'Claude did not return plan limits for this account.':'Plan limits are only available when signed in with a Claude plan, not an API key.',plan:data.subscription_type||''};
  const windowFor=value=>{if(!value||!Number.isFinite(value.utilization))return null;const used=Math.max(0,Math.min(100,value.utilization)),reset=Date.parse(value.resets_at);return {usedPercent:used,remainingPercent:100-used,resetsAt:Number.isFinite(reset)?Math.floor(reset/1000):null};};
  return {available:true,source:'Claude plan',plan:data.subscription_type||'',fiveHour:windowFor(data.rate_limits.five_hour),weekly:windowFor(data.rate_limits.seven_day),fetchedAt:new Date().toISOString(),note:'These are your Claude plan limits as reported by Claude Code on this Mac.'};
}
export function findClaude(environment=process.env) {
  if(environment.VAREON_CLAUDE_BIN)return environment.VAREON_CLAUDE_BIN;
  for(const path of [resolve(homedir(),'.local/bin/claude'),'/opt/homebrew/bin/claude','/usr/local/bin/claude',resolve(homedir(),'.claude/local/claude')])if(existsSync(path))return path;
  return 'claude';
}
function cleanEnvironment(){const environment={...process.env};for(const name of CREDENTIAL_VARIABLES)delete environment[name];return environment;}

export function createClaudeEngine(store,directory,dependencies={}) {
  const binary=()=>dependencies.binary||findClaude(),spawnProcess=dependencies.spawn||spawn;
  const run=(args,timeout=15000)=>new Promise(resolveResult=>execFile(binary(),args,{env:cleanEnvironment(),timeout,maxBuffer:1000000},(error,stdout,stderr)=>resolveResult({error,stdout:String(stdout||''),stderr:String(stderr||'')})));
  let login=null,usageCache=null,usageCachedAt=0,usagePending=null;
  return {
    async status() {
      const {error,stdout}=await run(['auth','status','--json']);
      if(error&&error.code==='ENOENT')return {installed:false,connected:false,email:'',method:'',signingIn:!!login};
      let value={};try{value=JSON.parse(stdout);}catch{}
      return {installed:true,connected:!!value.loggedIn,email:value.email||value.account?.email||'',method:value.authMethod||'',signingIn:!!login};
    },
    // Opens the Claude sign-in page in the default browser. The CLI completes the
    // OAuth exchange itself and keeps the result in its own credential store.
    async signIn({switchAccount=false}={}) {
      if(login&&switchAccount){login.kill('SIGTERM');login=null;}
      if(login)return {started:true,message:'Claude sign-in is already open in your browser.'};
      const current=await this.status();if(!current.installed)throw new Error('Claude Code is not installed on this Mac. Install it from claude.com/claude-code, then try again.');
      // Signing out first discards the previous account, so a wrong login can be replaced.
      if(switchAccount)await run(['auth','logout']);
      const child=spawnProcess(binary(),['auth','login','--claudeai'],{env:cleanEnvironment(),stdio:['ignore','ignore','ignore']});
      login=child;const done=()=>{if(login===child)login=null;clearTimeout(timer);store.emit('account_changed',{provider:'Claude'});};
      const timer=setTimeout(()=>child.kill('SIGTERM'),600000);child.on('error',done);child.on('close',done);
      return {started:true,message:'Finish signing in to Claude in your browser.'};
    },
    async signOut() {
      login?.kill('SIGTERM');login=null;const {error}=await run(['auth','logout']);if(error&&error.code!=='ENOENT')throw new Error('Claude could not sign out. Run “claude auth logout” in Terminal.');
      store.emit('account_changed',{provider:'Claude'});return {disconnected:true};
    },
    // Asks the local Claude Code for its plan limits through its supported SDK control
    // request (`get_usage`), the same way the Codex reader asks the Codex app-server.
    // No Claude credential is read or sent by VareonHQ.
    usage(force=false) {
      if(!force&&usageCache&&Date.now()-usageCachedAt<60000)return Promise.resolve(usageCache);
      if(usagePending)return usagePending;
      usagePending=new Promise(resolveResult=>{
        const child=spawnProcess(binary(),['-p','--input-format','stream-json','--output-format','stream-json','--verbose','--setting-sources','project','--disable-slash-commands','--strict-mcp-config','--tools',''],{cwd:resolve(directory,'claude-workspace'),env:cleanEnvironment(),stdio:['pipe','pipe','pipe']});
        let done=false;const finish=result=>{if(done)return;done=true;clearTimeout(timer);try{child.stdin.end();}catch{}child.kill('SIGTERM');usageCache=result;usageCachedAt=Date.now();resolveResult(result);};
        const timer=setTimeout(()=>finish({available:false,reason:'Claude usage could not be read from the local Claude Code sign-in.'}),15000);
        child.stderr.resume();child.stdin.on('error',()=>{});child.on('error',()=>finish({available:false,reason:'Claude Code could not start to read usage.'}));child.on('close',()=>finish({available:false,reason:'Claude Code closed before returning usage. Check that Claude is signed in.'}));
        createInterface({input:child.stdout}).on('line',line=>{try{const message=JSON.parse(line);if(message.type!=='control_response'||message.response?.request_id!=='vareon-usage')return;
          if(message.response.subtype==='error')return finish({available:false,reason:String(message.response.error||'Claude did not return usage.').slice(0,300)});
          finish(normaliseClaudeUsage(message.response.response));}catch{}});
        child.stdin.write(JSON.stringify({type:'control_request',request_id:'vareon-usage',request:{subtype:'get_usage'}})+'\n');
      }).finally(()=>{usagePending=null;});
      return usagePending;
    },
    models:()=>claudeModels,
    // Streams one turn. `onEvent` receives {type:'delta'|'action',...}. Resolves with the final text.
    async chat({prompt,systemPrompt,sessionId,model,mcpConfig,extraDirectories=[],signal,onEvent=()=>{}}) {
      const args=['-p','--output-format','stream-json','--verbose','--include-partial-messages','--setting-sources','project','--disable-slash-commands','--strict-mcp-config','--mcp-config',JSON.stringify(mcpConfig),
        '--tools','WebSearch,WebFetch,Read,Write,Edit','--allowedTools','mcp__vareonhq','WebSearch','WebFetch','Read','Write','Edit','--permission-mode','dontAsk','--append-system-prompt',systemPrompt];
      if(model)args.push('--model',model);if(sessionId)args.push('--resume',sessionId);for(const path of extraDirectories)args.push('--add-dir',path);
      const child=spawnProcess(binary(),args,{cwd:resolve(directory,'claude-workspace'),env:cleanEnvironment(),stdio:['pipe','pipe','pipe']});
      let stderr='',text='',final,session=sessionId||'',streamed=false,failure;
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});child.stdin.on('error',()=>{});child.stdin.end(prompt);
      const abort=()=>child.kill('SIGTERM'),timer=setTimeout(abort,180000);signal?.addEventListener('abort',abort,{once:true});
      const exit=new Promise((resolveExit,reject)=>{child.on('error',error=>reject(error.code==='ENOENT'?new Error('Claude Code is not installed on this Mac. Install it from claude.com/claude-code.'):error));child.on('close',resolveExit);});
      exit.catch(()=>{});
      try{
        for await(const line of createInterface({input:child.stdout})){
          let event;try{event=JSON.parse(line);}catch{continue;}
          if(event.session_id)session=event.session_id;
          if(event.type==='stream_event'){
            const inner=event.event;
            if(inner?.type==='content_block_delta'&&inner.delta?.type==='text_delta'){streamed=true;text+=inner.delta.text;onEvent({type:'delta',delta:inner.delta.text});}
            if(inner?.type==='content_block_start'&&inner.content_block?.type==='tool_use')onEvent({type:'action',name:inner.content_block.name,status:'Running'});
            if(inner?.type==='message_start'&&streamed&&!text.endsWith('\n')){text+='\n\n';onEvent({type:'delta',delta:'\n\n'});}
          }
          if(event.type==='rate_limit_event'&&event.rate_limit_info)onEvent({type:'usage',info:event.rate_limit_info});
          if(event.type==='result'){final=event;if(event.is_error)failure=event;}
        }
        const code=await exit;
        if(signal?.aborted)throw signal.reason||new Error('Stopped by the owner.');
        if(failure||!final){
          const detail=String(failure?.result||stderr||'').trim();
          if(/pro or max|max plan|pro plan|requires.{0,20}subscription|subscription required/i.test(detail))throw Object.assign(new Error('The Claude account signed in on this Mac doesn’t have a Pro or Max plan. In Connections choose “Use a different account” and sign in with the right one.'),{code:'claude_plan_required'});
          if(/not logged in|log in|\/login|authentication|401|oauth/i.test(detail)||(!final&&code!==0&&!detail))throw Object.assign(new Error('Claude is not signed in. Choose “Sign in with Claude” in Connections.'),{code:'claude_not_signed_in'});
          if(/rate limit|usage limit|limit reached|429|overloaded/i.test(detail))throw Object.assign(new Error('Your Claude plan allowance has been reached or Claude is busy. Your sign-in is still connected; try again later or switch to GPT.'),{code:'claude_usage_limit'});
          throw new Error(detail?'Claude request failed: '+detail.slice(0,500):'Claude stopped before completing the request.');
        }
        return {text:(final.result||text||'').trim(),sessionId:session};
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(child.exitCode===null)child.kill('SIGTERM');}
    }
  };
}
