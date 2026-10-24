import test from 'node:test';
import assert from 'node:assert/strict';
import {filterMailbox} from '../public/inbox.js';
const folders=[{id:'inbox-real',name:'Inbox',isInbox:true},{id:'archive',name:'Archive'}];
const messages=[
 {id:'old',folderId:'inbox-real',status:'Received',fromName:'Alex Sample',from:'alex@example.com',subject:'Website budget',body:'The revised scope',isRead:true,receivedAt:'2026-10-01T02:00:00Z'},
 {id:'today',folderId:'inbox-real',status:'Received',fromName:'Sam Sample',subject:'Review request',body:'Please review the landing page',isRead:false,receivedAt:'2026-10-20T15:00:00Z'},
 {id:'archived',folderId:'archive',status:'Received',subject:'Website budget archive',receivedAt:'2026-10-19T00:00:00Z'},
 {id:'draft',status:'Draft',subject:'New proposal',updatedAt:'2026-10-20T23:00:00Z'},
];
test('inbox search, sorting and read filters respect the selected folder without mutating the cache',()=>{
 const opts={now:new Date('2026-10-21T03:00:00Z')};
 assert.deepEqual(filterMailbox(messages,opts,folders).map(m=>m.id),['today','old']);
 assert.deepEqual(filterMailbox(messages,{...opts,status:'unread'},folders).map(m=>m.id),['today']);
 assert.deepEqual(filterMailbox(messages,{...opts,status:'read',query:'ALEX@EXAMPLE.COM'},folders).map(m=>m.id),['old']);
 assert.deepEqual(filterMailbox(messages,{...opts,query:'landing'},folders).map(m=>m.id),['today']);
 assert.deepEqual(filterMailbox(messages,{...opts,sort:'oldest'},folders).map(m=>m.id),['old','today']);
 assert.equal(filterMailbox(messages,{...opts,folderId:'drafts'},folders)[0].id,'draft');assert.equal(messages[0].id,'old');
});
test('mail date filters use Brisbane day boundaries and include the chosen end date',()=>{
 const opts={now:new Date('2026-10-21T03:00:00Z')};
 assert.deepEqual(filterMailbox(messages,{...opts,period:'today'},folders).map(m=>m.id),['today']);
 assert.deepEqual(filterMailbox(messages,{...opts,period:'week'},folders).map(m=>m.id),['today']);
 assert.deepEqual(filterMailbox(messages,{...opts,period:'custom',from:'2026-10-01',to:'2026-10-01'},folders).map(m=>m.id),['old']);
 assert.equal(filterMailbox(messages,{...opts,query:'no match'},folders).length,0);
});
