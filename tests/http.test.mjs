import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createApp } from '../server/server.mjs';
import { request as httpRequest } from 'node:http';

test('local HTTP access, complete OAuth PKCE flow, MCP writes, scopes, rotation and revocation',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'vareon-http-'));const runtime=await createApp({directory,port:4417,noScheduler:true});
  const server=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));runtime.close();rmSync(directory,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;let cookie='';
  const request=(path,options={})=>new Promise((resolve,reject)=>{const req=httpRequest(base+path,{method:options.method||'GET',headers:{Host:'localhost:4417',...(cookie?{Cookie:cookie}:{}),...options.headers}},res=>{const chunks=[];res.on('data',d=>chunks.push(d));res.on('end',()=>{const headers=new Headers();for(const[k,v]of Object.entries(res.headers))if(v!==undefined)for(const item of Array.isArray(v)?v:[v])headers.append(k,item);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));});});req.on('error',reject);req.end(options.body?.toString());});
  const home=await request('/');assert.equal(home.status,200);cookie=home.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/health')).status,200);
  assert.equal((await request('/api/health',{headers:{Host:'tunnel.example'}})).status,403);
  assert.equal((await request('/api/records/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"name":"Forbidden"}'})).status,403);
  assert.equal((await request('/api/records/clients',{method:'POST',headers:{'Content-Type':'application/json','X-Vareon-Local':'1',Origin:'https://evil.example'},body:'{"name":"Forbidden"}'})).status,403);
  const saved=await request('/api/records/clients',{method:'POST',headers:{'Content-Type':'application/json','X-Vareon-Local':'1'},body:'{"name":"Local test"}'});assert.equal(saved.status,200);
  const localPost=(path,body)=>request(path,{method:'POST',headers:{'Content-Type':'application/json','X-Vareon-Local':'1'},body:JSON.stringify(body)});
  const firstChat=await(await localPost('/api/conversations',{engine:'GPT'})).json();assert.ok(firstChat.id);runtime.store.put('messages',{role:'user',engine:'GPT',conversationId:firstChat.id,content:'Saved earlier message'});
  const secondChat=await(await localPost('/api/conversations',{engine:'GPT'})).json();assert.notEqual(firstChat.id,secondChat.id);assert.ok(!runtime.store.list('chatScopes').filter(s=>s.id==='GPT:').some(s=>s.conversationId===firstChat.id));
  assert.equal((await localPost('/api/conversations/'+firstChat.id+'/select',{})).status,200);assert.ok(runtime.store.list('chatScopes').some(s=>s.conversationId===firstChat.id));assert.ok(runtime.store.list('messages').some(m=>m.content==='Saved earlier message'));
  runtime.store.put('assistantState',{id:'current',busy:true});assert.equal((await localPost('/api/conversations',{engine:'GPT'})).status,400);assert.equal((await localPost('/api/conversations/'+secondChat.id+'/select',{})).status,400);runtime.store.put('assistantState',{id:'current',busy:false});
  assert.equal((await localPost('/api/conversations',{engine:'Invalid'})).status,400);assert.equal((await localPost('/api/conversations/not-a-chat/select',{})).status,400);
  const metadata=await(await request('/.well-known/oauth-authorization-server')).json();assert.ok(metadata.code_challenge_methods_supported.includes('S256'));
  const clientResponse=await request('/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Test client',redirect_uris:['https://client.example/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});assert.equal(clientResponse.status,201);const client=await clientResponse.json();
  async function authorize(scope){
    const verifier=randomBytes(48).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
    const params=new URLSearchParams({client_id:client.client_id,redirect_uri:'https://client.example/callback',response_type:'code',scope,state:'test-state',code_challenge:challenge,code_challenge_method:'S256',resource:'http://localhost:4417/mcp'});
    const auth=await request('/authorize?'+params);assert.equal(auth.status,302);const wait=new URL(auth.headers.get('location'));const id=wait.pathname.split('/').at(-1);
    const approve=await request(`/api/oauth-requests/${id}`,{method:'POST',headers:{'Content-Type':'application/json','X-Vareon-Local':'1'},body:'{"approve":true}'});assert.equal(approve.status,200);
    const continuation=await request(`/oauth/continue/${id}`);const callback=new URL(continuation.headers.get('location'));assert.equal(callback.searchParams.get('state'),'test-state');
    const values={grant_type:'authorization_code',client_id:client.client_id,code:callback.searchParams.get('code'),code_verifier:verifier,redirect_uri:'https://client.example/callback',resource:'http://localhost:4417/mcp'};
    const wrong=await request('/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...values,code_verifier:'wrong'})});assert.equal(wrong.status,400);
    const token=await request('/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)});assert.equal(token.status,200);const tokens=await token.json();
    assert.equal((await request('/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values)})).status,400);return tokens;
  }
  assert.equal((await request('/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const tokens=await authorize('dashboard:read dashboard:write');
  const mcp=async(token,name,args)=>{const response=await request('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:`Bearer ${token}`},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});return {status:response.status,body:await response.json()};};
  const write=await mcp(tokens.access_token,'save_clients',{record:{name:'Created through OAuth'}});assert.equal(write.status,200);assert.equal(write.body.result.isError,undefined);assert.ok(runtime.store.list('clients').some(c=>c.name==='Created through OAuth'));
  const read=await authorize('dashboard:read');const blocked=await mcp(read.access_token,'save_clients',{record:{name:'Blocked'}});assert.equal(blocked.body.result.isError,true);assert.ok(!runtime.store.list('clients').some(c=>c.name==='Blocked'));
  const rotatedResponse=await request('/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:client.client_id,refresh_token:tokens.refresh_token})});assert.equal(rotatedResponse.status,200);const rotated=await rotatedResponse.json();
  assert.equal((await mcp(tokens.access_token,'list_records',{collection:'clients'})).status,401);
  const revoked=await request('/api/oauth/revoke',{method:'POST',headers:{'Content-Type':'application/json','X-Vareon-Local':'1'},body:'{}'});assert.equal(revoked.status,200);assert.equal((await mcp(rotated.access_token,'list_records',{collection:'clients'})).status,401);
});
