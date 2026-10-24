import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {createOutlook} from '../server/outlook.mjs';
import {cleanReceivedHTML,contentId,imageData,receivedDocument} from '../server/received-email.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=';
test('received mail displays linked and embedded images while removing active content',()=>{
  const html=cleanReceivedHTML('<script>alert(1)</script><form><input></form><img src="cid:logo%40mail" onerror="bad()"><img src="https://cdn.example.com/banner.png"><img src="data:image/svg+xml;base64,PHN2Zz4="><a href="javascript:bad()">Bad</a><a href="https://example.com">Visit</a><p style="background-image:url(https://evil.example);color:#123456">Hello</p>',{'logo@mail':`data:image/png;base64,${png}`});
  assert.ok(html.includes(`data:image/png;base64,${png}`));assert.ok(html.includes('https://cdn.example.com/banner.png'));
  for(const unsafe of ['<script','<form','<input','onerror','javascript:','svg+xml','background-image'])assert.ok(!html.includes(unsafe),unsafe);
  assert.ok(html.includes('noopener noreferrer'));assert.ok(receivedDocument(html).includes("default-src 'none'"));
  assert.equal(contentId('cid:%3Clogo%40mail%3E'),'logo@mail');
  assert.equal(imageData({contentType:'image/png',contentBytes:Buffer.from('<svg>bad</svg>').toString('base64')}),'');
});
test('existing text-only Outlook messages upgrade on opening, resolve CID images despite hasAttachments=false, and cache offline',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'vareon-images-')),store=createStore(directory);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  store.put('emails',{id:'saved-mail',graphId:'graph/mail',body:'Old plain body',subject:'Existing email',clientId:'client-link',folderId:'follow-up',isRead:true,status:'Received'});
  const calls=[];const outlook=createOutlook(store,'http://localhost:4317',{graph:async path=>{
    calls.push(path);
    if(path.includes('?$select=id,body'))return {hasAttachments:false,body:{contentType:'HTML',content:'<h2>Project update</h2><img src="cid:logo%40mail"><p>Here is the preview.</p>'}};
    if(path.includes('/attachments?'))return {value:[{id:'inline',name:'logo.png',contentType:'image/png',isInline:true,size:68}],'@odata.nextLink':'https://graph.microsoft.com/v1.0/attachment-page-2'};
    if(path==='/attachment-page-2')return {value:[]};
    if(path.endsWith('/attachments/inline'))return {contentId:'<logo@mail>',contentType:'image/png',contentBytes:png};
    throw new Error('Unexpected Graph call: '+path);
  }});
  const [result,same]=await Promise.all([outlook.content('saved-mail'),outlook.content('saved-mail')]);assert.deepEqual(result,same);
  assert.ok(result.html.includes('data:image/png;base64,'));assert.equal(result.missingImages,0);assert.equal(calls.length,4);
  const email=store.get('emails','saved-mail');assert.equal(email.clientId,'client-link');assert.equal(email.folderId,'follow-up');assert.equal(email.isRead,true);assert.ok(email.body.includes('Project update'));assert.ok(!email.body.includes('<h2>'));
  await outlook.content('saved-mail');assert.equal(calls.length,4);
  assert.ok(!JSON.stringify(store.list('emails')).includes(png),'inline bytes stay out of mailbox snapshots');
});
test('missing embedded images retain the message and can be retried',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'vareon-image-retry-')),store=createStore(directory);t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
  store.put('emails',{id:'retry',graphId:'retry'});let tries=0;
  const outlook=createOutlook(store,'http://localhost:4317',{graph:async path=>{
    if(path.includes('?$select=id,body'))return {body:{contentType:'HTML',content:'<p>Still readable</p><img src="cid:logo">'}};
    if(path.includes('/attachments?')){if(++tries===1)throw new Error('Connection lost');return {value:[{id:'logo',isInline:true,contentType:'image/png',size:68}]};}
    return {contentId:'logo',contentType:'image/png',contentBytes:png};
  }});
  const first=await outlook.content('retry');assert.equal(first.missingImages,1);assert.ok(first.html.includes('Still readable'));assert.equal(store.get('emailContent','retry').ready,false);
  assert.equal((await outlook.content('retry')).missingImages,0);
});
