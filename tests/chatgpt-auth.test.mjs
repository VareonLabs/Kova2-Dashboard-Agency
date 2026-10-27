import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatGPTAuth } from '../server/chatgpt-auth.mjs';

test('an invalid refresh grant asks for reconnection and a new OAuth sign-in restores it',async()=>{
  const settings={chatgptClientId:'test-client'};
  let secret=JSON.stringify({access_token:'expired-access',refresh_token:'expired-refresh',client_id:'test-client',subject:'owner',scopes:['chatgpt.tokens.use.direct'],expiresAt:0});
  let refreshCalls=0,nonce='';
  const store={settings:()=>settings,setting:(key,value)=>{settings[key]=value;},emit(){},log(){}};
  const auth=createChatGPTAuth(store,4320,{
    readSecret:async()=>secret,
    writeSecret:async(_key,value)=>{secret=value;},
    deleteSecret:async()=>{secret=null;},
    verify:async()=>({payload:{nonce,sub:'owner'}}),
    fetch:async(_url,options)=>{
      const grant=new URLSearchParams(options.body).get('grant_type');
      if(grant==='refresh_token'){refreshCalls++;return {ok:false,json:async()=>({error:'invalid_grant'})};}
      assert.equal(grant,'authorization_code');
      return {ok:true,json:async()=>({access_token:'new-access',refresh_token:'new-refresh',id_token:'new-id',expires_in:3600,scope:'openid chatgpt.tokens.use.direct'})};
    }
  });
  await assert.rejects(auth.accessToken(),/Continue with ChatGPT in Connections/);
  assert.equal(settings.chatgptReconnectRequired,true);
  assert.equal((await auth.status()).sharing,false);
  await assert.rejects(auth.accessToken(),/Continue with ChatGPT in Connections/);
  assert.equal(refreshCalls,1);
  const url=new URL((await auth.authorize()).url);
  nonce=url.searchParams.get('nonce');
  await auth.callback({state:url.searchParams.get('state'),code:'new-code',client_id:'test-client'});
  assert.equal(settings.chatgptReconnectRequired,false);
  assert.equal(settings.chatgptError,'');
  assert.equal((await auth.status()).sharing,true);
  assert.equal(await auth.accessToken(),'new-access');
});
