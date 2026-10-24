import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createStore} from '../server/store.mjs';
import {createActions} from '../server/actions.mjs';
import {createAssistant} from '../server/assistant.mjs';
import {createClaudeEngine,normaliseClaudeUsage} from '../server/claude-engine.mjs';

function fixture(t){const directory=mkdtempSync(join(tmpdir(),'vareon-claude-')),store=createStore(directory);mkdirSync(join(directory,'claude-workspace'));t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {directory,store};}
function fakeProcess(lines,calls,exitCode=0){return (binary,args,options)=>{calls.push({binary,args,options});const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.exitCode=null;child.kill=()=>{};let prompt='';child.stdin.on('data',c=>{prompt+=c;calls.at(-1).prompt=prompt;});setImmediate(()=>{for(const line of lines)child.stdout.write(JSON.stringify(line)+'\n');child.stdout.end();child.exitCode=exitCode;child.emit('close',exitCode);});return child;};}

test('Claude engine streams text, resumes its session and never passes API credentials',async t=>{
  const {store,directory}=fixture(t),calls=[];process.env.ANTHROPIC_API_KEY='must-not-leak';t.after(()=>{delete process.env.ANTHROPIC_API_KEY;});
  const lines=[{type:'system',subtype:'init',session_id:'session-1'},{type:'stream_event',session_id:'session-1',event:{type:'content_block_delta',delta:{type:'text_delta',text:'Hello '}}},{type:'stream_event',session_id:'session-1',event:{type:'content_block_delta',delta:{type:'text_delta',text:'owner'}}},{type:'result',subtype:'success',is_error:false,session_id:'session-1',result:'Hello owner'}];
  const engine=createClaudeEngine(store,directory,{binary:'/fake/claude',spawn:fakeProcess(lines,calls)}),deltas=[];
  const assistant=createAssistant(store,createActions(store),directory,{chatgpt:{},claude:engine});
  store.on?.('assistant_delta',()=>{});
  const reply=await assistant.chat('Say hello','Claude');
  assert.equal(reply.content,'Hello owner');
  assert.equal(calls[0].options.env.ANTHROPIC_API_KEY,undefined);
  assert.ok(calls[0].args.includes('--strict-mcp-config')&&calls[0].args.includes('dontAsk'));
  assert.equal(calls[0].prompt,'Say hello');
  assert.ok(!calls[0].args.includes('--resume'));
  await assistant.chat('And again','Claude',{conversationId:reply.conversationId});
  assert.equal(calls[1].args[calls[1].args.indexOf('--resume')+1],'session-1');
});

test('Claude engine reports a signed-out account in plain language',async t=>{
  const {store,directory}=fixture(t),calls=[];
  const engine=createClaudeEngine(store,directory,{binary:'/fake/claude',spawn:fakeProcess([{type:'result',subtype:'success',is_error:true,result:'Not logged in · Please run /login'}],calls,1)});
  await assert.rejects(engine.chat({prompt:'Hi',systemPrompt:'x',mcpConfig:{mcpServers:{}}}),/not signed in/);
});

test('Claude rate-limit events are kept for the usage widget',async t=>{
  const {store,directory}=fixture(t),calls=[];
  const lines=[{type:'rate_limit_event',rate_limit_info:{status:'allowed_warning',rateLimitType:'five_hour',utilization:0.42,resetsAt:1900000000}},{type:'rate_limit_event',rate_limit_info:{status:'allowed',rateLimitType:'seven_day',resetsAt:1900500000}},{type:'result',subtype:'success',is_error:false,session_id:'s',result:'ok'}];
  const assistant=createAssistant(store,createActions(store),directory,{chatgpt:{},claude:createClaudeEngine(store,directory,{binary:'/fake/claude',spawn:fakeProcess(lines,calls)})});
  await assistant.chat('Hi','Claude');const usage=store.get('claudeUsage','current');
  assert.equal(usage.five_hour.usedPercent,42);assert.equal(usage.seven_day.usedPercent,null);assert.equal(usage.seven_day.resetsAt,1900500000);
});

test('plan usage is normalised like the Codex windows and missing figures stay unavailable',()=>{
  const usage=normaliseClaudeUsage({subscription_type:'pro',rate_limits_available:true,rate_limits:{five_hour:{utilization:37.5,resets_at:'2030-01-01T00:00:00Z'},seven_day:{utilization:null,resets_at:null}}});
  assert.equal(usage.fiveHour.usedPercent,37.5);assert.equal(usage.fiveHour.remainingPercent,62.5);assert.equal(usage.fiveHour.resetsAt,1893456000);assert.equal(usage.weekly,null);
  assert.equal(normaliseClaudeUsage({rate_limits_available:false,rate_limits:null}).available,false);
});
