import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,symlinkSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { saveRecord,deleteRecord } from '../server/domain.mjs';
import { financeSummary } from '../server/finance.mjs';
import { createActions } from '../server/actions.mjs';
import { createOutlook } from '../server/outlook.mjs';
import { createChatGPTAuth } from '../server/chatgpt-auth.mjs';
import { saveMedia } from '../server/media.mjs';
import { createPreviews } from '../server/previews.mjs';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'vareon-expansion-')),store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return {dir,store};}
test('finance uses exact cents, excludes draft invoices and derives overdue balances and project costs',t=>{
 const {store}=fixture(t),client=saveRecord(store,'clients',{name:'Ledger client'}),project=saveRecord(store,'projects',{name:'Delivery',clientId:client.id,budget:5000.75,plannedCost:1000.50});
 const invoice=saveRecord(store,'invoices',{title:'Delivery invoice',projectId:project.id,amount:1000.35,status:'Issued',dueDate:'2026-10-10'});
 saveRecord(store,'invoices',{title:'Unsent quote',projectId:project.id,amount:9999,status:'Draft'});
 const payment=saveRecord(store,'payments',{invoiceId:invoice.id,amount:300.10,paidDate:'2026-10-09'});
 saveRecord(store,'expenses',{title:'Contractor',projectId:project.id,amount:100.20,paid:true});saveRecord(store,'expenses',{title:'Hosting',projectId:project.id,amount:50.30,paid:false});
 const report=financeSummary(store,{clientId:client.id,now:new Date('2026-10-21T00:00:00Z')});assert.equal(report.totals.paid,300.10);assert.equal(report.totals.outstanding,700.25);assert.equal(report.totals.overdue,700.25);assert.equal(report.totals.actualCost,150.50);assert.equal(report.totals.unpaidCosts,50.30);assert.equal(report.followUps.length,1);assert.equal(report.totals.budget,5000.75);
 assert.throws(()=>saveRecord(store,'payments',{invoiceId:invoice.id,amount:700.26,paidDate:'2026-10-21'}),/balance/);assert.throws(()=>saveRecord(store,'invoices',{amount:200},invoice.id),/payments/);assert.throws(()=>deleteRecord(store,'invoices',invoice.id),/payments/);assert.throws(()=>saveRecord(store,'expenses',{title:'Fractional cents',amount:0.001}),/decimal/);
 saveRecord(store,'payments',{invoiceId:invoice.id,amount:700.25,paidDate:'2026-10-21'});assert.equal(financeSummary(store).invoices.find(i=>i.id===invoice.id).state,'Paid');deleteRecord(store,'payments',payment.id);assert.equal(financeSummary(store).invoices.find(i=>i.id===invoice.id).outstanding,300.10);
});
test('prospects convert once and retain research, source and a protected client relationship',async t=>{
 const {store}=fixture(t),actions=createActions(store),p=saveRecord(store,'prospects',{name:'Test prospect',company:'Example',email:'person@example.com',sourceUrl:'https://example.com',notes:'Asked about a website',status:'Qualified'});
 const first=await actions.execute('convert_prospect_to_client',{prospectId:p.id});assert.equal((await actions.execute('convert_prospect_to_client',{prospectId:p.id})).id,first.id);assert.equal(store.list('clients').length,1);assert.match(first.notes,/https:\/\/example.com/);assert.equal(store.get('prospects',p.id).status,'Won');assert.throws(()=>deleteRecord(store,'clients',first.id),/linked/);
});
test('media validates content, sanitises SVG logos and persists references in post order',t=>{
 const {store,dir}=fixture(t);const logo=saveMedia(store,dir,{name:'logo.svg',type:'image/svg+xml',role:'Logo',bytes:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10" fill="#C6F432"/><image href="https://evil.invalid/a"/></svg>')});
 assert.equal(logo.role,'Logo');assert.doesNotMatch(readFileSync(join(dir,'media',logo.id),'utf8'),/script|onload|evil/);assert.equal(saveRecord(store,'posts',{title:'Logo draft',mediaIds:[logo.id]}).mediaIds[0],logo.id);assert.throws(()=>saveRecord(store,'posts',{title:'Missing file',mediaIds:['missing']}),/no longer exists/);assert.throws(()=>saveMedia(store,dir,{name:'fake.png',type:'image/png',bytes:Buffer.from('<html>not an image</html>')}),/matching file type/);
});
test('coding previews stay in their workspace and reject traversal, symlinks and dashboard URLs',t=>{
 const {store,dir}=fixture(t),previews=createPreviews(store,dir);previews.write({path:'preview/index.html',content:'<h1>Live result</h1>'});const p=previews.open({name:'QA preview',path:'preview/index.html'});assert.match(previews.read('preview/index.html').content,/Live result/);assert.ok(previews.resolve(p.id,'').endsWith('/codex-workspace/preview/index.html'));assert.throws(()=>previews.write({path:'../outside.html',content:'No'}),/inside/);assert.throws(()=>previews.open({url:'http://localhost:4317'}),/separate/);assert.throws(()=>previews.resolve(p.id,'../outside.html'),/outside|ENOENT/);
 const outside=join(dir,'secret.html');writeFileSync(outside,'secret');symlinkSync(outside,join(dir,'codex-workspace/preview/link.html'));assert.throws(()=>previews.read('preview/link.html'),/leave/);
});
test('Outlook sync paginates contacts, includes nested contact folders and moves real mailbox messages',async t=>{
 const {store}=fixture(t);store.setting('outlookConnected',true);const calls=[];const outlook=createOutlook(store,'http://localhost:4317',{graph:async(path,options={})=>{calls.push({path,options});if(path.startsWith('/me/contacts?'))return {value:[{id:'1',displayName:'First',emailAddresses:[{address:'first@example.com'}]}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/contact-page-2'};if(path==='/contact-page-2')return {value:[{id:'2',displayName:'Second',emailAddresses:[{address:'second@example.com'}]}]};if(path==='/me/contactFolders?$top=100')return {value:[{id:'folder',displayName:'Business'}]};if(path.includes('/contactFolders/folder/contacts?'))return {value:[{id:'3',displayName:'Nested contact',emailAddresses:[{address:'nested@example.com'},{address:'work@example.com'}]}]};if(path.includes('/contactFolders/folder/childFolders'))return {value:[]};if(path==='/me/mailFolders/inbox/childFolders')return {id:'follow-up',displayName:JSON.parse(options.body).displayName};if(path==='/me/messages/message/move')return {id:'message'};throw new Error('Unexpected '+path);}});
 assert.equal((await outlook.syncContacts()).count,4);assert.equal(store.list('contacts').length,4);const folder=await outlook.createFolder('Follow up');assert.equal(folder.source,'Outlook');const email=store.put('emails',{graphId:'message',subject:'Test mail'});await outlook.moveEmail(email.id,folder.id);assert.equal(store.get('emails',email.id).folderId,folder.id);assert.equal(JSON.parse(calls.find(c=>c.path.endsWith('/move')).options.body).destinationId,'follow-up');
});
test('ChatGPT OAuth uses PKCE and the issued client ID, validates nonce, rotates refresh tokens and never accepts identity-only access',async t=>{
 const {store}=fixture(t);let saved=null,nonce='',refreshes=0;const requests=[];
 const auth=createChatGPTAuth(store,4317,{readSecret:async()=>saved,writeSecret:async(key,value)=>saved=value,deleteSecret:async()=>saved=null,verify:async(token,clientId)=>{assert.equal(clientId,'oaiapp_test');return {payload:{sub:'owner',email:'owner@example.com',nonce}};},fetch:async(url,options)=>{requests.push({url,options});const form=options.body;if(form.get('grant_type')==='refresh_token'){refreshes++;assert.equal(form.get('refresh_token'),'refresh-one');return Response.json({access_token:'access-two',refresh_token:'refresh-two',expires_in:3600});}assert.equal(form.get('client_id'),'oaiapp_test');assert.ok(form.get('code_verifier'));return Response.json({access_token:'access-one',id_token:'verified-test-token',refresh_token:'refresh-one',expires_in:1,scope:'openid chatgpt.tokens.use.direct'});}});
 const url=new URL((await auth.authorize()).url);nonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(url.searchParams.get('redirect_uri'),'http://127.0.0.1:4317/auth/chatgpt/callback');assert.equal(url.searchParams.get('code_challenge_method'),'S256');await assert.rejects(()=>auth.callback({state:'bad',code:'x',client_id:'oaiapp_test'}),/expired/);
 const session=await auth.callback({state:url.searchParams.get('state'),code:'valid',client_id:'oaiapp_test'});assert.equal(session.sharing,true);assert.equal(session.access_token,undefined);const tokens=await Promise.all([auth.accessToken(),auth.accessToken()]);assert.deepEqual(tokens,['access-two','access-two']);assert.equal(refreshes,1);assert.equal(JSON.parse(saved).refresh_token,'refresh-two');await assert.rejects(()=>auth.callback({state:url.searchParams.get('state'),code:'valid',client_id:'oaiapp_test'}),/expired/);
 const value=JSON.parse(saved);value.scopes=['openid'];saved=JSON.stringify(value);await assert.rejects(()=>auth.accessToken(),/plan usage/);
});
test('ChatGPT rejects a mismatched nonce without replacing a previous account',async t=>{
 const {store}=fixture(t);let saved=null;
 const auth=createChatGPTAuth(store,4317,{readSecret:async()=>saved,writeSecret:async(k,v)=>saved=v,verify:async()=>({payload:{sub:'wrong',nonce:'wrong'}}),fetch:async()=>Response.json({access_token:'not-saved',id_token:'bad',expires_in:3600,scope:'chatgpt.tokens.use.direct'})});const url=new URL((await auth.authorize()).url);await assert.rejects(()=>auth.callback({state:url.searchParams.get('state'),code:'x',client_id:'oaiapp_test'}),/verified/);assert.equal(saved,null);
});
