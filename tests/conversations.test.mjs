import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {createActions} from '../server/actions.mjs';
import {createAssistant} from '../server/assistant.mjs';
import {createConversations} from '../server/conversations.mjs';
import {normaliseCitations,renderChatContent,cleanChatText} from '../public/chat-format.js';
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'vareon-chats-')),store=createStore(directory);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});return {directory,store};}
test('new GPT chats isolate history, retain business memory, and reopen earlier chats after restart',async t=>{
 const {store,directory}=fixture(t),actions=createActions(store),memory=actions.memory.read('MEMORY.md');actions.memory.write('MEMORY.md',memory.content+'\nOwner fact: CJ is the founder.','',memory.revision);
 store.setting('gptModel','test-model');const requests=[],oldFetch=globalThis.fetch;globalThis.fetch=async(_,options)=>{const body=JSON.parse(options.body);requests.push(body);return Response.json({output:[{type:'message',content:[{type:'output_text',text:'A saved reply.'}]}]});};t.after(()=>globalThis.fetch=oldFetch);
 const assistant=createAssistant(store,actions,directory,{chatgpt:{accessToken:async()=>'test-oauth'}});
 const first=await assistant.chat('First chat request');const secondChat=assistant.conversations.create('GPT');await assistant.chat('Second chat request','GPT',{conversationId:secondChat.id});
 assert.equal(requests[1].input.length,1);assert.equal(requests[1].input[0].content,'Second chat request');assert.ok(requests[1].instructions.includes('CJ is the founder.'));
 assistant.conversations.select(first.conversationId);await assistant.chat('Follow up in first chat','GPT',{conversationId:first.conversationId});assert.ok(requests[2].input.some(m=>m.content==='First chat request'));assert.ok(!requests[2].input.some(m=>m.content==='Second chat request'));
 const restarted=createConversations(store);assert.equal(restarted.ensure('GPT').id,first.conversationId);restarted.select(secondChat.id);assert.deepEqual(restarted.activeMessages().filter(m=>m.engine==='GPT').map(m=>m.content).sort(),['A saved reply.','Second chat request'].sort());assert.equal(store.list('messages').length,6);
 await assert.rejects(assistant.chat('Wrong engine','Codex',{conversationId:secondChat.id}),/Choose a chat/);assert.equal(store.get('assistantState','current').busy,false);
});
test('legacy messages and Codex threads are retained, while New chat starts a new Codex thread',async t=>{
 const {store,directory}=fixture(t);store.put('messages',{role:'user',engine:'Codex',content:'Earlier coding task',projectId:''});store.put('codexConversations',{id:'business',threadId:'original-codex-thread'});
 const operations=[];let n=0;
 const thread=id=>({id,async runStreamed(){return {events:(async function*(){yield {type:'thread.started',thread_id:id};yield {type:'item.completed',item:{id:'reply',type:'agent_message',text:'Codex reply'}};yield {type:'turn.completed'};})()};}});
 const assistant=createAssistant(store,createActions(store),directory,{chatgpt:{},codexClient:()=>({resumeThread(id){operations.push(['resume',id]);return thread(id);},startThread(){const id='new-codex-thread-'+(++n);operations.push(['start',id]);return thread(id);}})});
 const earlier=assistant.conversations.ensure('Codex');assert.equal(earlier.title,'Earlier conversation');assert.equal(store.list('messages')[0].conversationId,earlier.id);
 await assistant.chat('Continue earlier task','Codex',{conversationId:earlier.id});const fresh=assistant.conversations.create('Codex');await assistant.chat('A separate task','Codex',{conversationId:fresh.id});
 assert.deepEqual(operations,[['resume','original-codex-thread'],['start','new-codex-thread-1']]);assert.equal(store.get('codexConversations',earlier.id).threadId,'original-codex-thread');assert.equal(store.get('codexConversations',fresh.id).threadId,'new-codex-thread-1');assert.ok(store.list('messages').some(m=>m.content==='Earlier coding task'));
});
test('citation annotations become safe inline links; old and partial control markers never reach chat HTML',()=>{
 const marker='\uE200cite\uE202turn0view0\uE201',text='Verified claim. '+marker+' More detail.';const start=text.indexOf(marker);
 const result=normaliseCitations(text,[{type:'url_citation',start_index:start,end_index:start+marker.length,url:'https://example.com/source',title:'Official source'}]);
 assert.equal(result.content,'Verified claim. [Official source] More detail.');const html=renderChatContent(result); // message-shaped data uses content + citations
 assert.ok(html.includes('href="https://example.com/source"'));assert.ok(html.includes('Official source'));assert.ok(!html.includes('\uE200'));assert.ok(renderChatContent('Old '+marker+' answer.').includes('Old  answer.'));assert.equal(cleanChatText('Streaming '+marker.slice(0,-2)),'Streaming ');
 const unsafe=normaliseCitations('Text', [{type:'url_citation',start_index:0,end_index:4,url:'javascript:alert(1)',title:'Bad'}]);assert.equal(unsafe.citations.length,0);
 assert.ok(renderChatContent('<img src=x onerror=bad()> [Source](https://example.com)').includes('&lt;img'));assert.ok(!renderChatContent('<script>bad()</script>').includes('<script>'));assert.ok(renderChatContent('[Source](https://example.com)').includes('>Source</a>'));
});
test('GPT persists readable text and citation metadata instead of private citation tokens',async t=>{
 const {store,directory}=fixture(t);store.setting('gptModel','test-model');const marker='\uE200cite\uE202turn0view0\uE201',text='A claim '+marker,oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({output:[{type:'message',content:[{type:'output_text',text,annotations:[{type:'url_citation',url:'https://example.com/proof',title:'Evidence',start_index:8,end_index:text.length}]}]}]});t.after(()=>globalThis.fetch=oldFetch);
 const assistant=createAssistant(store,createActions(store),directory,{chatgpt:{accessToken:async()=>'test-oauth'}});const result=await assistant.chat('Research this');assert.equal(result.content,'A claim [Evidence]');const saved=store.list('messages').find(m=>m.role==='assistant');assert.equal(saved.citations[0].url,'https://example.com/proof');assert.ok(renderChatContent(saved).includes('href="https://example.com/proof"'));assert.ok(!saved.content.includes('\uE200'));
});
