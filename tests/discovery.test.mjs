import test from 'node:test';
import {fetchOwnerCookie} from './owner-session.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../server/store.mjs';
import {saveRecord} from '../server/domain.mjs';
import {createSearch} from '../server/search.mjs';
import {createFollowUps} from '../server/follow-ups.mjs';
import {createChatFiles} from '../server/chat-files.mjs';
import {createApp} from '../server/server.mjs';
import {renderChatContent,normaliseCitations} from '../public/chat-format.js';
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'vareon-discovery-')),store=createStore(directory);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {store,directory};}
test('Global search finds saved records, old chats, file text and memory without searching credentials or deleted mail',async t=>{
 const {store,directory}=fixture(t),search=createSearch(store);store.setting('secret','needle-credential-only');store.put('oauthTokens',{id:'private-token',value:'needle-credential-only'});
 const c=saveRecord(store,'clients',{name:'Café Aurora',notes:'A thoughtful website'});saveRecord(store,'notes',{title:'Aurora brief',body:'Follow the blueprint-472 plan.'});store.put('conversations',{id:'older-chat',engine:'GPT'});store.put('messages',{content:'blueprint-472 was approved for review',conversationId:'older-chat',role:'assistant'});store.put('emails',{subject:'Deleted blueprint-472',status:'Received',deletedAt:'2026-10-21'});
 await createChatFiles(store,directory).save({relativePath:'proposal.txt',groupId:randomUUID(),bytes:Buffer.from('An attached blueprint-472 reference.')});
 const memory=search.query({query:'business workspace',type:'memory'});assert.ok(memory.total>0);assert.equal(search.query({query:'cafe aurora'}).items[0].id,c.id);const results=search.query({query:'blueprint-472'});assert.ok(results.items.some(r=>r.type==='notes'));assert.ok(results.items.some(r=>r.type==='messages'));assert.ok(results.items.some(r=>r.type==='files'));assert.ok(!results.items.some(r=>r.type==='emails'));assert.equal(search.query({query:'needle-credential-only'}).total,0);
 const page=search.query({query:'blueprint-472',limit:1});assert.equal(page.items.length,1);assert.equal(page.hasMore,true);assert.notEqual(search.query({query:'blueprint-472',limit:1,offset:1}).items[0].id,page.items[0].id);assert.throws(()=>search.query({query:'q',type:'oauthTokens'}),/category/);
 saveRecord(store,'clients',{name:'Different studio'},c.id);assert.equal(search.query({query:'cafe aurora',type:'clients'}).total,0);
});
test('Prospect reminders use real saved sent mail, exact addresses, Brisbane days and newer replies',t=>{
 const {store}=fixture(t),follow=createFollowUps(store),p=saveRecord(store,'prospects',{name:'Studio',email:'team@studio.example',status:'Contacted'});
 store.put('emails',{id:'sent',status:'Sent',to:p.email,subject:'Hello',sentAt:'2026-10-14T13:30:00Z'});store.put('emails',{status:'Received',from:'not-team@studio.example',receivedAt:'2026-10-20T10:00:00Z'});
 const before=follow.context(p.id,{now:new Date('2026-10-20T13:59:00Z')});assert.equal(before.state,'Upcoming');const due=follow.context(p.id,{now:new Date('2026-10-20T14:01:00Z')});assert.equal(due.state,'Due');assert.equal(due.dueDate,'2026-10-21');assert.equal(due.unanswered,true);
 store.put('emails',{status:'Received',from:'Studio <team@studio.example>',subject:'Re: Hello',receivedAt:'2026-10-20T12:00:00Z'});assert.equal(follow.context(p.id,{now:new Date('2026-10-21T00:00:00Z')}).state,'Replied');
 store.put('emails',{id:'draft',status:'Draft',prospectId:p.id,to:p.email,subject:'Unsent'});assert.equal(follow.context(p.id,{now:new Date('2026-10-21T00:00:00Z')}).lastContactAt,'2026-10-14T13:30:00Z');
});
test('Follow-up snooze, logging and completion persist without sending or fabricating an email',t=>{
 const {store,directory}=fixture(t),follow=createFollowUps(store),p=saveRecord(store,'prospects',{name:'Prospect',email:'person@example.com'});
 follow.update(p.id,{action:'schedule',date:'2026-12-01',note:'After the event'});assert.equal(follow.context(p.id).dueDate,'2026-12-01');follow.update(p.id,{action:'log',kind:'Contacted',occurredAt:new Date(Date.now()-86400000).toISOString(),note:'Phone call confirmed by owner'});assert.equal(store.get('prospects',p.id).status,'Contacted');assert.equal(store.list('emails').length,0);assert.equal(store.list('prospectTouches').length,2);const draft=saveRecord(store,'emails',{subject:'Follow-up draft',to:p.email,prospectId:p.id});const approval=store.put('approvals',{kind:'email',entityId:draft.id,status:'Pending'});assert.equal(follow.context(p.id).draftId,draft.id);assert.equal(follow.context(p.id).pendingApprovalId,approval.id);
 follow.update(p.id,{action:'complete'});assert.equal(follow.context(p.id).state,'Paused');const second=createStore(directory);assert.equal(createFollowUps(second).context(p.id).state,'Paused');second.close();
 assert.throws(()=>follow.update(p.id,{action:'log',kind:'Contacted',occurredAt:'2099-01-01T00:00:00Z'}),/Choose a time/);assert.equal(store.list('prospectTouches').length,3);
 assert.throws(()=>saveRecord(store,'emails',{to:'person@example.com',subject:'Invalid link',prospectId:'missing'}),/no longer exists/);
});
test('Chat renders natural paragraphs and formatting while preserving code, citations, hashtags and safe links',()=>{
 const html=renderChatContent('## Here is the plan\n\nThe **draft is ready**. I would start with the _homepage_.\n\n* Review the brief\n* Send feedback\n\n```js\nconst tag = "#launch"; const value = 2 * 3;\n```\n\nUse #VareonHQ in the post.');
 assert.ok(html.includes('<strong>draft is ready</strong>'));assert.ok(html.includes('<em>homepage</em>'));assert.ok(html.includes('<ul><li>'));assert.ok(!html.includes('## Here'));assert.ok(!html.includes('**draft'));assert.ok(html.includes('2 * 3'));assert.ok(html.includes('#VareonHQ'));assert.ok(html.includes('&quot;#launch&quot;'));
 assert.ok(renderChatContent('<script>alert(1)</script>').includes('&lt;script&gt;'));assert.ok(!renderChatContent('[Bad](javascript:alert(1))').includes('href="javascript'));assert.ok(renderChatContent({role:'user',content:'Keep **literal** #text'}).includes('**literal** #text'));
 const marker='\uE200cite\uE202turn0view0\uE201',text='A **verified** claim '+marker;const source=normaliseCitations(text,[{type:'url_citation',start_index:text.indexOf(marker),end_index:text.length,url:'https://example.com',title:'Evidence'}]);const cited=renderChatContent(source);assert.ok(cited.includes('<strong>verified</strong>'));assert.ok(cited.includes('class="chat-citation"'));assert.ok(!cited.includes('\uE200'));
 const table=renderChatContent('| Item | Status |\n| --- | --- |\n| Draft | Ready |');assert.ok(table.includes('<table>'));assert.ok(table.includes('<td>Ready</td>'));
});
test('Local search and follow-up HTTP routes enforce owner access and preserve reminder changes',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'vareon-discovery-http-')),runtime=await createApp({directory,port:4458,noScheduler:true}),server=runtime.app.listen(4458,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));runtime.close();rmSync(directory,{recursive:true,force:true});});
 const base='http://127.0.0.1:4458',home=await fetch(base),cookie=await fetchOwnerCookie(base,home.headers.get('set-cookie').split(';')[0]),headers={Cookie:cookie,'Content-Type':'application/json','X-Vareon-Local':'1'};
 const p=saveRecord(runtime.store,'prospects',{name:'HTTP prospect',email:'preview@example.com'});let response=await fetch(base+'/api/search?q=HTTP',{headers});assert.equal(response.status,200);assert.ok((await response.json()).items.some(r=>r.id===p.id));
 response=await fetch(base+'/api/prospects/'+p.id+'/follow-up',{method:'POST',headers,body:JSON.stringify({action:'schedule',date:'2026-10-21'})});assert.equal(response.status,200);assert.equal((await response.json()).dueDate,'2026-10-21');assert.equal((await fetch(base+'/api/search?q=HTTP')).status,403);assert.equal((await fetch(base+'/api/search/resolve?type=oauthTokens&id=secret',{headers})).status,400);
});
