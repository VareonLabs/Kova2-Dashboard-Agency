import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {createOutlook} from '../server/outlook.mjs';
import {filterMailbox} from '../public/inbox.js';
import {assistantBounds,clampAssistantWidth} from '../public/assistant-layout.js';
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'vareon-mail-actions-')),store=createStore(directory);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});store.put('mailFolders',{id:'inbox',name:'Inbox',isInbox:true,total:2,unread:2});store.put('emails',{id:'one',graphId:'graph/one',subject:'Sample',status:'Received',folderId:'inbox',isRead:false,clientId:'keep-link'});return store;}
test('opening mail updates Outlook read status once, preserves fresh content, and updates unread counts',async t=>{
 const store=fixture(t),calls=[];const outlook=createOutlook(store,'http://localhost:4317',{graph:async(path,options)=>{calls.push({path,...options});store.put('emails',{...store.get('emails','one'),body:'Fresh formatted content'});return {};}});
 const email=await outlook.markRead('one',true);assert.equal(email.isRead,true);assert.equal(email.body,'Fresh formatted content');assert.equal(email.clientId,'keep-link');assert.equal(store.get('mailFolders','inbox').unread,1);
 assert.equal(calls[0].path,'/me/messages/graph%2Fone');assert.equal(calls[0].method,'PATCH');assert.deepEqual(JSON.parse(calls[0].body),{isRead:true});await outlook.markRead('one',true);assert.equal(calls.length,1);
});
test('failed Outlook writes leave the local read and delete state intact',async t=>{
 const store=fixture(t),outlook=createOutlook(store,'http://localhost:4317',{graph:async()=>{throw new Error('Outlook unavailable');}});
 await assert.rejects(outlook.markRead('one'),/unavailable/);await assert.rejects(outlook.trash('one'),/unavailable/);assert.equal(store.get('emails','one').isRead,false);assert.equal(store.get('emails','one').folderId,'inbox');assert.equal(store.get('mailFolders','inbox').unread,2);
});
test('delete moves Outlook mail to recoverable Deleted Items and Move to restores it',async t=>{
 const store=fixture(t),calls=[];store.put('mailFolders',{id:'restore',graphId:'inbox-graph',name:'Inbox'});
 const outlook=createOutlook(store,'http://localhost:4317',{graph:async(path,options={})=>{calls.push({path,...options});if(path.startsWith('/me/mailFolders/deleteditems'))return {id:'trash-graph',displayName:'Deleted Items',totalItemCount:0,unreadItemCount:0};return {id:'moved-graph'};}});
 const result=await outlook.trash('one');assert.equal(result.email.folderId,'outlook-trash-graph');assert.equal(result.email.graphId,'moved-graph');assert.ok(result.email.deletedAt);assert.equal(store.get('mailFolders','inbox').unread,1);assert.equal(store.get('emails','one').clientId,'keep-link');assert.deepEqual(JSON.parse(calls[1].body),{destinationId:'deleteditems'});assert.equal(calls[1].method,'POST');assert.ok(!calls.some(c=>c.method==='DELETE'));
 const email=store.get('emails','one');assert.equal(filterMailbox([email],{folderId:'all'}).length,0);assert.equal(filterMailbox([email],{folderId:'outlook-trash-graph'}).length,1);
 await outlook.trash('one');assert.equal(calls.length,2);await outlook.moveEmail('one','restore');assert.equal(store.get('emails','one').deletedAt,null);assert.equal(filterMailbox(store.list('emails'),{folderId:'all'}).length,1);
});
test('local drafts are recoverably deleted without Outlook, and assistant widths stay inside the viewport',async t=>{
 const store=fixture(t);store.put('emails',{id:'local',status:'Draft',subject:'Local draft'});const outlook=createOutlook(store,'http://localhost:4317',{graph:async()=>{throw new Error('Must not call Outlook');}});await outlook.trash('local');assert.equal(store.get('emails','local').folderId,'local-deleted-items');assert.equal(filterMailbox(store.list('emails'),{folderId:'drafts'}).length,0);
 for(const viewport of [320,390,850,950,1200,1440,1920]){const {min,max}=assistantBounds(viewport);assert.ok(min<=max);assert.equal(clampAssistantWidth(-20,viewport),min);assert.equal(clampAssistantWidth(9000,viewport),max);assert.ok(max<=viewport-60);if(viewport>=950)assert.ok(max<=viewport-(viewport>=1200?200:60)-420);}
});
