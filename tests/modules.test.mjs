import test from 'node:test';
import {fetchOwnerCookie,authCookie,OWNER} from './owner-session.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {createApp} from '../server/server.mjs';
import {MODULES,isOn,hiddenPages,hiddenProjectTabs} from '../public/modules.js';

test('modules default on, and switched-off areas hide their pages and project tabs',()=>{
  assert.ok(MODULES.every(m=>isOn({},m.key)));
  const settings={modules:{marketing:false,software:false}};
  assert.ok(hiddenPages(settings).has('marketing')&&hiddenPages(settings).has('codex'));assert.ok(!hiddenPages(settings).has('clients'));
  assert.ok(hiddenProjectTabs(settings).has('Delivery'));assert.ok(!hiddenProjectTabs(settings).has('Board'));
});

test('module switches are saved by the owner over HTTP and reject unknown keys',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'vareon-modules-')),runtime=await createApp({directory,port:4418,noScheduler:true}),server=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));runtime.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const request=(path,options={})=>new Promise((resolve,reject)=>{const req=httpRequest(base+path,{method:options.method||'GET',headers:{Host:'localhost:4418',...(cookie?{Cookie:cookie}:{}),...options.headers}},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);if(options.body)req.write(options.body);req.end();});
  const home=await request('/');cookie=String(home.headers['set-cookie']).split(';')[0];const up=await request('/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json','X-Vareon-Local':'1'},body:JSON.stringify(OWNER)});assert.equal(up.status,200,up.body);cookie+='; '+authCookie((up.headers.get?up.headers.get('set-cookie'):up.headers['set-cookie']));
  const put=body=>request('/api/modules',{method:'PUT',headers:{'Content-Type':'application/json','X-Vareon-Local':'1'},body:JSON.stringify(body)});
  assert.equal((await request('/api/modules',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"marketing":false}'})).status,403,'needs the dashboard’s own request header');
  const saved=await put({marketing:false});assert.equal(saved.status,200);{const modules=JSON.parse(saved.body);assert.equal(modules.marketing,false);assert.equal(modules.inbox,true);}
  assert.equal((await put({payroll:false})).status,400);assert.equal((await put({inbox:'no'})).status,400);
  assert.equal(runtime.store.settings().modules.marketing,false);
});
