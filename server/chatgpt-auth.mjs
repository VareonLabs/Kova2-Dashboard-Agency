import { randomBytes,randomUUID,createHash } from 'node:crypto';
import { createRemoteJWKSet,jwtVerify } from 'jose';
import { readSecret,writeSecret,deleteSecret } from './secrets.mjs';

const issuer='https://auth.openai.com',resource='https://api.openai.com/v1';
const jwks=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'));
export function createChatGPTAuth(store,port,dependencies={}) {
  const read=dependencies.readSecret||readSecret,write=dependencies.writeSecret||writeSecret,remove=dependencies.deleteSecret||deleteSecret;
  const request=dependencies.fetch||((...args)=>fetch(...args));
  const verify=dependencies.verify||((token,clientId)=>jwtVerify(token,jwks,{issuer,audience:clientId,requiredClaims:['sub','exp','iat'],clockTolerance:5}));
  const pending=new Map();let refreshing;
  const vault=async()=>{try{return JSON.parse(await read('chatgpt-plan')||'null');}catch{if(!store.settings().chatgptError)store.setting('chatgptError','The previous credential was incomplete. Continue with ChatGPT again to replace it.');return null;}};
  const session=value=>({connected:!!value?.access_token,sharing:!!value?.access_token&&value.scopes?.includes('chatgpt.tokens.use.direct'),email:value?.email||'',name:value?.name||'',clientId:value?.client_id||store.settings().chatgptClientId||''});
  async function exchange(parameters){const response=await request(issuer+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...parameters,resource}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(result.error_description||result.error||'ChatGPT sign-in failed');return result;}
  return {
    status:async()=>session(await vault()),
    async authorize(){
      for(const[key,item]of pending)if(item.expires<Date.now())pending.delete(key);
      const previous=await vault(),clientId=previous?.client_id||store.settings().chatgptClientId||'';
      let host=store.settings().chatgptHostId;if(!host){host='urn:uuid:'+randomUUID();store.setting('chatgptHostId',host);}
      const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
      const redirectUri=`http://127.0.0.1:${port}/auth/chatgpt/callback`;
      pending.set(state,{nonce,verifier,redirectUri,clientId,subject:previous?.subject,expires:Date.now()+600000});
      const query=new URLSearchParams({client_id:clientId||'dynamic_agent_client',ext_agent_host_id:host,response_type:'code',redirect_uri:redirectUri,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
      if(!clientId)query.set('agent_name_hint','VareonHQ');if(previous?.id_token)query.set('id_token_hint',previous.id_token);
      return {url:issuer+'/api/accounts/authorize?'+query};
    },
    async callback(query){
      const item=pending.get(query.state);pending.delete(query.state);if(!item||item.expires<Date.now())throw new Error('ChatGPT sign-in expired. Start again in Connections.');
      if(query.error)throw new Error('ChatGPT sign-in was not completed: '+String(query.error).slice(0,100));
      const clientId=item.clientId||query.client_id;
      if(typeof clientId!=='string'||!clientId||clientId==='dynamic_agent_client'||item.clientId&&query.client_id&&query.client_id!==item.clientId)throw new Error('ChatGPT returned a different or incomplete client registration.');
      store.setting('chatgptClientId',clientId);
      if(typeof query.code!=='string')throw new Error('Missing ChatGPT authorization code');
      const result=await exchange({grant_type:'authorization_code',client_id:clientId,code:query.code,code_verifier:item.verifier,redirect_uri:item.redirectUri});
      if(!result.id_token||!result.access_token||!Number.isFinite(result.expires_in))throw new Error('Incomplete ChatGPT token response');
      const {payload}=await verify(result.id_token,clientId);
      if(payload.nonce!==item.nonce||typeof payload.sub!=='string'||item.subject&&payload.sub!==item.subject)throw new Error('The ChatGPT account could not be verified.');
      const value={...result,client_id:clientId,subject:payload.sub,email:payload.email||'',name:payload.name||'',scopes:String(result.scope||'').split(' '),expiresAt:Date.now()+result.expires_in*1000};
      await write('chatgpt-plan',JSON.stringify(value));store.setting('gptModel','');store.emit('account_changed',{provider:'ChatGPT'});store.log('Connected ChatGPT with OAuth');return session(value);
    },
    async accessToken(){
      let value=await vault();if(!session(value).sharing)throw new Error('Continue with ChatGPT in Connections and enable ChatGPT plan usage. No API key is required.');
      if(value.expiresAt>Date.now()+60000)return value.access_token;
      if(!refreshing)refreshing=(async()=>{if(!value.refresh_token)throw new Error('Reconnect ChatGPT to renew your session.');const next=await exchange({grant_type:'refresh_token',client_id:value.client_id,refresh_token:value.refresh_token});if(!next.access_token||!Number.isFinite(next.expires_in))throw new Error('ChatGPT did not renew the session.');value={...value,...next,scopes:next.scope?next.scope.split(' '):value.scopes,expiresAt:Date.now()+next.expires_in*1000};await write('chatgpt-plan',JSON.stringify(value));if(!session(value).sharing)throw new Error('ChatGPT plan usage was not granted. Reconnect in Connections.');return value.access_token;})().finally(()=>refreshing=null);
      return refreshing;
    },
    async models(){const response=await request(resource+'/models',{headers:{Authorization:'Bearer '+await this.accessToken()},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('ChatGPT models could not be loaded. Reconnect your account.');const result=await response.json();return (result.models||[]).filter(m=>m.visibility==='list').map(({slug,display_name})=>({slug,name:display_name}));},
    async disconnect(){const value=await vault();let remoteRevoked=false;try{if(value?.refresh_token){const discovery=await request(issuer+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());const url=new URL(discovery.revocation_endpoint);if(url.origin!==issuer)throw new Error('Unexpected revocation endpoint');const response=await request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:value.refresh_token,token_type_hint:'refresh_token',client_id:value.client_id}),signal:AbortSignal.timeout(15000)});remoteRevoked=response.ok;}}catch{}await remove('chatgpt-plan');store.emit('account_changed',{provider:'ChatGPT'});return {disconnected:true,remoteRevoked,message:remoteRevoked?'Signed out of ChatGPT.':'Signed out locally. Remote revocation was not confirmed; you can disconnect VareonHQ in ChatGPT Settings.'};}
  };
}
