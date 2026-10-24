import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { createMemory } from '../server/memory.mjs';
import { createActions } from '../server/actions.mjs';
import { createAssistant } from '../server/assistant.mjs';
import { saveRecord } from '../server/domain.mjs';
import { partialJSON,readResponseStream } from '../server/stream.mjs';
import { cleanEmailHTML,buildEmailHTML,graphEmail } from '../server/email-html.mjs';
import { normaliseUsage } from '../server/usage.mjs';
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'vareon-project-')),store=createStore(directory);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {store,directory};}
test('workspace and project Markdown memory persist, isolate projects and detect conflicting edits',t=>{
  const {store,directory}=fixture(t),memory=createMemory(store,directory),project=saveRecord(store,'projects',{name:'Project A'}),other=saveRecord(store,'projects',{name:'Project B'});
  const old=memory.read('MEMORY.md');memory.write('MEMORY.md','# Memory\nUse lime, never purple.','',old.revision);
  assert.throws(()=>memory.write('MEMORY.md','Stale edit','',old.revision),/changed/);
  const p=memory.read('MEMORY.md',project.id);memory.write('MEMORY.md','# Memory\nProject A fact',project.id,p.revision);
  const next=createMemory(store,directory);assert.match(next.context(project.id),/Use lime, never purple/);assert.match(next.context(project.id),/Project A fact/);assert.doesNotMatch(next.context(other.id),/Project A fact/);
  assert.throws(()=>memory.read('../outside.md'),/authorised/);assert.throws(()=>memory.read('MEMORY.md','../../bad'),/existing project/);
});
test('memory rejects symbolic-link files outside its directory',t=>{const{store,directory}=fixture(t),memory=createMemory(store,directory);const path=join(memory.root,'BRAND.md');rmSync(path);symlinkSync(join(directory,'vareonhq.sqlite'),path);assert.throws(()=>memory.read('BRAND.md'),/symbolic links/);});
test('visible editor opens, fills without resetting fields, saves a Kanban card and honours owner takeover',async t=>{
  const{store}=fixture(t),actions=createActions(store);
  const draft=await actions.execute('open_editor',{collection:'posts',fields:{platform:'Instagram',format:'Carousel',status:'Draft'}});
  await actions.execute('fill_editor',{draftId:draft.draftId,fields:{title:'A carousel',content:'Caption',slides:['First','Second']}});
  const saved=await actions.execute('save_editor',{draftId:draft.draftId});assert.equal(saved.platform,'Instagram');assert.equal(saved.format,'Carousel');assert.equal(saved.slides.length,2);
  await actions.execute('move_card',{collection:'posts',id:saved.id,status:'In review'});assert.equal(store.get('posts',saved.id).status,'In review');
  assert.deepEqual(store.eventsAfter().filter(e=>e.type==='ui').map(e=>e.data.action),['open_editor','editor_patch','editor_saved','card_moved']);
  const second=await actions.execute('open_editor',{collection:'tasks',fields:{title:'Pending'}});store.put('liveDrafts',{...store.get('liveDrafts',second.draftId),status:'Handed over'});await assert.rejects(()=>actions.execute('save_editor',{draftId:second.draftId}),/no longer controlled/);assert.equal(store.list('tasks').length,0);
});
test('streaming GPT creation produces live form events before saving the actual post',async t=>{
  const{store,directory}=fixture(t),actions=createActions(store),assistant=createAssistant(store,actions,directory,{chatgpt:{accessToken:async()=>'test-oauth-token',models:async()=>[{slug:'test-model'}]}});saveRecord(store,'notes',{title:'Brand voice',body:'Be clear and practical'});
  const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-key';let step=0,draftId;
  const sse=events=>new Response(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
  const fn=(name,args)=>({type:'function_call',name,call_id:'call_'+step,arguments:JSON.stringify(args)});
  globalThis.fetch=async(url,request)=>{const body=JSON.parse(request.body);assert.equal(body.stream,true);assert.match(body.instructions,/Brand voice/);step++;let output;
    if(step===1)output=[fn('open_editor',{collection:'posts',fields:{platform:'LinkedIn',status:'Draft'}})];
    if(step===2){const previous=body.input.findLast(i=>i.type==='function_call_output');draftId=JSON.parse(previous.output).draftId;const args=JSON.stringify({draftId,fields:{title:'Live LinkedIn draft',content:'Clear, practical copy written live.'}});output=[fn('fill_editor',JSON.parse(args))];return sse([{type:'response.output_item.added',output_index:0,item:{type:'function_call',name:'fill_editor',arguments:''}},{type:'response.function_call_arguments.delta',output_index:0,delta:args.slice(0,-8)},{type:'response.function_call_arguments.delta',output_index:0,delta:args.slice(-8)},{type:'response.completed',response:{output}}]);}
    if(step===3)output=[fn('save_editor',{draftId})];if(step===4)output=[{type:'message',content:[{type:'output_text',text:'Created your LinkedIn draft.'}]}];return sse([{type:'response.completed',response:{output}}]);};
  t.after(()=>{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;});
  assert.equal(await assistant.gpt('Create LinkedIn content'),'Created your LinkedIn draft.');assert.equal(store.list('posts')[0].title,'Live LinkedIn draft');
  const events=store.eventsAfter().filter(e=>e.type==='ui');const streaming=events.find(e=>e.data.action==='editor_patch'&&e.data.streaming);assert.ok(streaming);assert.ok(streaming.sequence<events.find(e=>e.data.action==='editor_saved').sequence);
});
test('GPT reads streamed HTTP errors and plain-text event streams without JSON parse failures',async()=>{
  const failure=new Response('event: error\ndata: '+JSON.stringify({type:'error',message:'ChatGPT plan allowance reached'})+'\n\n',{status:429,headers:{'Content-Type':'text/event-stream'}});
  await assert.rejects(()=>readResponseStream(failure,()=>{}),/plan allowance reached/);
  const success=new Response('event: response.completed\ndata: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[]}})+'\n\n');
  assert.equal((await readResponseStream(success,()=>{})).status,'completed');
  const allowance=new Response('data: '+JSON.stringify({type:'response.failed',response:{error:{code:'subscription_sharing_usage_limit_exceeded',message:'Use an API key instead'}}})+'\n\n',{status:429});
  await assert.rejects(()=>readResponseStream(allowance,()=>{}),error=>error.code==='subscription_sharing_usage_limit_exceeded'&&error.status===429&&error.message.includes('Settings')&&!error.message.includes('API key'));
  const items=[{type:'response.output_item.done',output_index:0,item:{type:'message',content:[{type:'output_text',text:'Streamed reply'}]}},{type:'response.completed',response:{status:'completed'}}];
  assert.equal((await readResponseStream(new Response(items.map(i=>'data: '+JSON.stringify(i)+'\n\n').join('')),()=>{})).output[0].content[0].text,'Streamed reply');
});
test('partial tool arguments are preview-only and handle escaped content safely',()=>{assert.equal(partialJSON('{"fields":{"content":"Line one\\nLine tw').fields.content,'Line one\nLine tw');assert.equal(partialJSON('{"slides":["One","Tw').slides[1],'Tw');assert.equal(partialJSON('{"__proto__":{"polluted":true}}').polluted,undefined);});
test('GPT detects chunked event streams even when a proxy labels them JSON, and accepts multiline events',async()=>{
  const chunks=['\uFEFFe','vent: response.completed\r\nda','ta: {"response":\r\ndata: {"status":"completed","output":[]}}\r\n\r\n'];
  const bytes=new TextEncoder();const body=new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(bytes.encode(chunk));controller.close();}});
  const events=[];const result=await readResponseStream(new Response(body,{headers:{'Content-Type':'application/json'}}),event=>events.push(event));
  assert.equal(result.status,'completed');assert.equal(events[0].type,'response.completed');
  await assert.rejects(()=>readResponseStream(new Response('event: error\ndata: not-json\n\n',{headers:{'Content-Type':'application/json'}}),()=>{}),/unreadable stream event/);
});
test('email formatting is sanitised and every send includes the confirmed signature',()=>{
  const settings={emailSignatureHtml:'<div><strong>VareonHQ</strong><br>hello@vareonhq.com</div>',emailSignatureConfirmed:true};
  const email={to:'client@example.com',subject:'Hello',body:'Plain fallback',bodyHtml:'<p><b>Bold</b> <a href="javascript:alert(1)">Bad link</a><img src="https://example.com/logo.png" onerror="alert(1)"></p><script>alert(2)</script>',cc:['cc@example.com'],bcc:['bcc@example.com']};
  const html=buildEmailHTML(email,settings);assert.match(html,/<b>Bold<\/b>/);assert.match(html,/hello@vareonhq.com/);assert.doesNotMatch(html,/javascript:|onerror|<script/);
  const message=graphEmail(email,settings);assert.equal(message.body.contentType,'HTML');assert.equal(message.ccRecipients[0].emailAddress.address,'cc@example.com');assert.equal(message.bccRecipients[0].emailAddress.address,'bcc@example.com');
  assert.throws(()=>buildEmailHTML(email,{}),/signature/);assert.doesNotMatch(cleanEmailHTML('<span style="background-image:url(https://evil.example)">Text</span>'),/background-image/);
});
test('inline email images become CID attachments and signature is appended once',()=>{
  const settings={emailSignatureHtml:'<p>Signature</p>',emailSignatureConfirmed:true};const message=graphEmail({to:'x@example.com',subject:'Test',bodyHtml:'<p>Signature</p><img src="data:image/png;base64,aGVsbG8=">'},settings);
  assert.equal(message.body.content.match(/Signature/g).length,1);assert.match(message.body.content,/cid:inline-/);assert.equal(message.attachments[0].isInline,true);
});
test('usage windows are accurately labelled and missing windows are unavailable, not zero',()=>{
  const value=normaliseUsage({rateLimitsByLimitId:{codex:{primary:{usedPercent:35,windowDurationMins:300,resetsAt:100},secondary:{usedPercent:66,windowDurationMins:10080,resetsAt:200}}}});assert.equal(value.fiveHour.usedPercent,35);assert.equal(value.weekly.remainingPercent,34);assert.equal(normaliseUsage({rateLimits:{primary:{usedPercent:3,windowDurationMins:15}}}).fiveHour,null);assert.equal(normaliseUsage({}).available,false);
});
