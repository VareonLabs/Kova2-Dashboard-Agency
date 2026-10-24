import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {saveRecord,deleteRecord,snapshot} from '../server/domain.mjs';
import {createChatFiles} from '../server/chat-files.mjs';
import {createSearch} from '../server/search.mjs';
import {createHistory} from '../server/history.mjs';
import {createActions} from '../server/actions.mjs';
test('Document library persists uploaded resources, validates links, indexes text and supports assistant reading and undo',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'vareon-documents-')),store=createStore(directory);
 try{
 const files=createChatFiles(store,directory),file=await files.save({relativePath:'Remote work policy.txt',groupId:'11111111-1111-4111-8111-111111111111',bytes:Buffer.from('Work from home arrangements require a weekly check-in.')});
 const client=saveRecord(store,'clients',{name:'Example client'});
 const d=saveRecord(store,'documents',{title:'Remote work policy',category:'Policy',folder:'People',clientId:client.id,fileId:file.id,version:'1.0',body:'Annual review',reviewDate:'2027-01-01'});
 assert.equal(snapshot(store).documents[0].id,d.id);assert.throws(()=>deleteRecord(store,'clients',client.id),/linked/);assert.throws(()=>saveRecord(store,'documents',{title:'Bad',fileId:'missing'}),/file no longer/);
 assert.equal(createSearch(store).query({query:'Remote work',type:'documents'}).items[0].id,d.id);
 const actions=createActions(store);const tool=actions.tools.find(t=>t.name==='read_library_document');assert.match(tool.run({documentId:d.id,offset:0}).file.text,/weekly check-in/);
 deleteRecord(store,'documents',d.id);const history=createHistory(store),change=history.list().find(c=>c.entityId===d.id&&c.action==='Deleted');history.undo(change.id);assert.equal(store.get('documents',d.id).fileId,file.id);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
