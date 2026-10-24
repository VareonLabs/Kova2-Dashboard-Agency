import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,snapshot} from '../server/domain.mjs';
import {financeSummary} from '../server/finance.mjs';
import {createReviews} from '../server/reviews.mjs';
import {createActions} from '../server/actions.mjs';
import {createApp} from '../server/server.mjs';
import {todaySummary,clientWorkspace} from '../public/operations-data.js';
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'vareon-operations-')),store=createStore(directory);t.after(()=>{store.close();rmSync(directory,{force:true,recursive:true});});return {store,directory};}
test('Today respects Brisbane midnight, invoice balances, inbox folders and completed work',t=>{
 const {store}=fixture(t);const now=new Date('2026-10-21T14:05:00Z'); // 22 October in Brisbane
 saveRecord(store,'tasks',{title:'Due today',dueDate:'2026-10-22'});
 saveRecord(store,'tasks',{title:'Overdue',dueDate:'2026-10-21'});
 saveRecord(store,'tasks',{title:'Done',dueDate:'2026-10-20',status:'Done'});
 saveRecord(store,'tasks',{title:'Tomorrow',dueDate:'2026-10-23'});
 saveRecord(store,'invoices',{title:'Part paid',status:'Issued',amount:1000,dueDate:'2026-10-21'});
 const invoice=store.list('invoices')[0];saveRecord(store,'payments',{invoiceId:invoice.id,amount:400,paidDate:'2026-10-21'});
 saveRecord(store,'invoices',{title:'Paid',status:'Issued',amount:100,dueDate:'2026-10-20'});const paid=store.list('invoices')[0];saveRecord(store,'payments',{invoiceId:paid.id,amount:100,paidDate:'2026-10-21'});
 store.put('mailFolders',{id:'inbox',isInbox:true});store.put('emails',{subject:'Unread',status:'Received',isRead:false,folderId:'inbox'});store.put('emails',{subject:'Junk',status:'Received',isRead:false,folderId:'junk'});store.put('emails',{subject:'Deleted',status:'Received',folderId:'inbox',deletedAt:'now'});
 const d=todaySummary({...snapshot(store),finance:financeSummary(store,{now})},now);
 assert.equal(d.day,'2026-10-22');assert.equal(d.tasks.length,2);assert.equal(d.overdueTasks,1);assert.equal(d.invoices.length,1);assert.equal(d.invoices[0].outstanding,600);assert.deepEqual(d.unread.map(e=>e.subject),['Unread']);
});
test('Client workspace follows project links and exact addresses without leaking another client’s records',t=>{
 const {store}=fixture(t);const c=saveRecord(store,'clients',{name:'Client A',email:'a@example.com'}),other=saveRecord(store,'clients',{name:'Client B'}),p=saveRecord(store,'projects',{name:'Website',clientId:c.id});
 saveRecord(store,'tasks',{title:'Project task',projectId:p.id});saveRecord(store,'notes',{title:'Project note',projectId:p.id});saveRecord(store,'invoices',{title:'Project invoice',projectId:p.id,amount:100});saveRecord(store,'notes',{title:'Other private note',clientId:other.id});
 store.put('emails',{id:'exact',from:'Name <A@example.com>',status:'Received'});store.put('emails',{id:'substring',from:'not-a@example.com',status:'Received'});store.put('emails',{id:'other-linked',clientId:other.id,from:'a@example.com',status:'Received'});
 store.put('messages',{projectId:p.id,attachments:[{id:'file-a',name:'brief.pdf'}]});store.put('messages',{projectId:'other',attachments:[{id:'file-b',name:'private.pdf'}]});
 const w=clientWorkspace({...snapshot(store)},c.id);assert.equal(w.tasks[0].title,'Project task');assert.equal(w.notes.length,1);assert.equal(w.invoices.length,1);assert.deepEqual(w.emails.map(e=>e.id),['exact']);assert.deepEqual(w.files.map(f=>f.id),['file-a']);assert.throws(()=>clientWorkspace(snapshot(store),'missing'),/Client not found/);
});
test('Reviews stage changes until approval, preserve exact versions, decline safely and persist history',async t=>{
 const {store,directory}=fixture(t),reviews=createReviews(store);const post=saveRecord(store,'posts',{title:'A draft',content:'Original',status:'Draft'});
 const request=reviews.request({collection:'posts',id:post.id,record:{content:'Proposed',status:'Ready'}},'GPT');assert.equal(store.get('posts',post.id).content,'Original');assert.equal(reviews.request({collection:'posts',id:post.id,record:{content:'Proposed',status:'Ready'}},'GPT').id,request.id);
 await reviews.resolve(request.id,{approve:true,note:'Looks good'});assert.equal(store.get('posts',post.id).content,'Proposed');assert.equal(store.get('posts',post.id).status,'Ready');await assert.rejects(()=>reviews.resolve(request.id,{approve:true}),/already been resolved/);
 const stale=reviews.request({collection:'posts',id:post.id,record:{content:'Stale'}});saveRecord(store,'posts',{content:'Owner edit'},post.id);await assert.rejects(()=>reviews.resolve(stale.id,{approve:true}),/changed after/);assert.equal(store.get('posts',post.id).content,'Owner edit');await reviews.resolve(stale.id,{approve:false,note:'Keep my changes'});
 const fresh=reviews.request({collection:'clients',record:{name:'New client'}},'Codex');assert.equal(store.list('clients').length,0);await reviews.resolve(fresh.id,{approve:false});assert.equal(store.list('clients').length,0);
 assert.throws(()=>reviews.request({collection:'posts',id:post.id,record:{status:'Published'}}),/Ready/);const second=createStore(directory);assert.equal(second.get('approvals',request.id).reviewNote,'Looks good');assert.equal(second.get('approvals',stale.id).status,'Declined');second.close();
});
test('External approvals claim once, never run on decline, and do not automatically retry ambiguous failures',async t=>{
 const {store}=fixture(t),reviews=createReviews(store);let calls=0,release;const wait=new Promise(r=>release=r);
 const request=store.put('approvals',{kind:'connector',status:'Pending',title:'Generate asset',payload:{}});const executors={connector:async()=>{calls++;await wait;return {ok:true};}};
 const first=reviews.resolve(request.id,{approve:true},executors);assert.equal(store.get('approvals',request.id).status,'Running');await assert.rejects(()=>reviews.resolve(request.id,{approve:true},executors),/already/);release();await first;assert.equal(calls,1);
 const declined=store.put('approvals',{kind:'connector',status:'Pending'});await reviews.resolve(declined.id,{approve:false},executors);assert.equal(calls,1);
 const failed=store.put('approvals',{kind:'email',status:'Pending'});await assert.rejects(()=>reviews.resolve(failed.id,{approve:true},{email:async()=>{throw new Error('Sending uncertain');}}),/uncertain/);assert.equal(store.get('approvals',failed.id).status,'Failed');await assert.rejects(()=>reviews.resolve(failed.id,{approve:true}),/already/);
});
test('Assistant can read Today, open client workspaces and submit reviews but cannot approve them',async t=>{
 const {store}=fixture(t),actions=createActions(store);const c=saveRecord(store,'clients',{name:'Test client'});assert.equal((await actions.execute('get_client_workspace',{clientId:c.id})).client.name,c.name);assert.equal((await actions.execute('get_today',{})).timezone,'Australia/Brisbane');await actions.execute('open_client_workspace',{clientId:c.id});assert.equal(store.eventsAfter().at(-2).data.action,'open_client');
 const a=await actions.execute('request_record_review',{collection:'notes',record:{title:'Proposed note',body:'Review first'}});assert.equal(a.status,'Pending');assert.equal(store.list('notes').length,0);await assert.rejects(()=>actions.execute('approve_review',{id:a.id}),/Unknown/);
});
test('Local HTTP endpoints expose client and daily read models and apply reviewed changes only through the owner route',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'vareon-operations-http-'));const runtime=await createApp({directory,port:4448,noScheduler:true});const server=runtime.app.listen(4448,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));runtime.close();rmSync(directory,{recursive:true,force:true});});
 const base='http://127.0.0.1:4448';const home=await fetch(base),cookie=home.headers.get('set-cookie').split(';')[0];const req=(path,body)=>fetch(base+'/api'+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','X-Vareon-Local':'1'},...(body?{body:JSON.stringify(body)}:{})});
 const client=await (await req('/records/clients',{name:'HTTP client'})).json();assert.equal((await req('/clients/'+client.id+'/workspace')).status,200);assert.equal((await req('/today')).status,200);
 const approval=await(await req('/reviews',{collection:'projects',record:{name:'Awaiting approval',clientId:client.id}})).json();assert.equal(runtime.store.list('projects').length,0);assert.equal((await req('/approvals/'+approval.id,{approve:true})).status,200);assert.equal(runtime.store.list('projects').length,1);assert.equal((await req('/approvals/'+approval.id,{approve:true})).status,400);
 const outsider=await fetch(base+'/api/approvals/'+approval.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approve:true})});assert.equal(outsider.status,403);
});

test('Client workspace includes direct and project documents and meetings without crossing clients',t=>{
 const {store}=fixture(t),a=saveRecord(store,'clients',{name:'A'}),b=saveRecord(store,'clients',{name:'B'}),p=saveRecord(store,'projects',{name:'A project',clientId:a.id}),q=saveRecord(store,'projects',{name:'B project',clientId:b.id});
 saveRecord(store,'documents',{title:'A brief',projectId:p.id});saveRecord(store,'documents',{title:'B brief',projectId:q.id});saveRecord(store,'meetingNotes',{title:'A meeting',clientId:a.id,date:'2026-10-23'});saveRecord(store,'meetingNotes',{title:'B meeting',clientId:b.id,date:'2026-10-23'});
 const w=clientWorkspace(snapshot(store),a.id);assert.deepEqual(w.documents.map(r=>r.title),['A brief']);assert.deepEqual(w.meetingNotes.map(r=>r.title),['A meeting']);
});
