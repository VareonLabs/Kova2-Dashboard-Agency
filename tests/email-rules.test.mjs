import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { saveRecord } from '../server/domain.mjs';
import { createOutlook } from '../server/outlook.mjs';

test('a new Outlook inbox email can create local follow-up work exactly once',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'vareon-email-rules-'));
  const store=createStore(directory);
  t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  store.setting('outlookConnected',true);
  saveRecord(store,'automationRules',{name:'Triage new mail',enabled:true,trigger:'email.received',conditions:[{field:'from',op:'contains',value:'customer.example'}],actions:[{type:'createTask',title:'Reply to {from}: {title}',dueInDays:1,priority:'Medium'}]});
  const message={id:'incoming-1',subject:'Can we talk?',body:{contentType:'text',content:'A new enquiry'},from:{emailAddress:{address:'ana@customer.example',name:'Ana'}},receivedDateTime:'2026-10-25T00:00:00Z',parentFolderId:'inbox-id',isRead:false};
  let messages=[];
  const outlook=createOutlook(store,'http://localhost:4317',{graph:async path=>{
    if(path.startsWith('/me/mailFolders/inbox?'))return {id:'inbox-id',displayName:'Inbox'};
    if(path.startsWith('/me/mailFolders?$top='))return {value:[{id:'inbox-id',displayName:'Inbox',childFolderCount:0}]};
    if(path.startsWith('/me/contacts?')||path.startsWith('/me/contactFolders?'))return {value:[]};
    if(path.startsWith('/me/mailFolders/inbox-id/messages?'))return {value:messages};
    throw new Error('Unexpected Graph request: '+path);
  }});
  await outlook.sync();
  assert.equal(store.list('tasks').length,0,'first sync establishes a baseline without acting on old mail');
  messages=[message];
  await outlook.sync();
  await outlook.sync();
  assert.equal(store.list('tasks').length,1);
  assert.equal(store.list('tasks')[0].title,'Reply to ana@customer.example: Can we talk?');
  assert.equal(store.list('automationRuns').length,1);
  assert.equal(store.list('automationRuns')[0].status,'Done');
});
