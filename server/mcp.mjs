import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, createOAuthMetadata } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidGrantError, InvalidTokenError, InvalidScopeError, InvalidClientMetadataError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const supported=['dashboard:read','dashboard:write'];
export function createOAuthProvider(store,issuer) {
  const resource=()=>`${issuer()}/mcp`;
  function checkResource(value){if(value && value.toString()!==resource())throw new InvalidGrantError('The requested resource does not match this dashboard.');}
  function issue(clientId,scopes,grantId=randomUUID()) {
    const access=randomBytes(32).toString('base64url'),refresh=randomBytes(48).toString('base64url');
    store.put('oauthTokens',{id:hash(access),clientId,scopes,grantId,type:'access',resource:resource(),expiresAt:Date.now()+3600000});
    store.put('oauthTokens',{id:hash(refresh),clientId,scopes,grantId,type:'refresh',resource:resource(),expiresAt:Date.now()+30*86400000});
    return {access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:scopes.join(' ')};
  }
  return {
    skipLocalPkceValidation:true,
    clientsStore:{
      getClient:clientId=>store.get('oauthClients',clientId)||undefined,
      registerClient:async client=>{
        // Public clients use PKCE. No static client secrets are stored in SQLite.
        if(client.token_endpoint_auth_method!=='none')throw new InvalidClientMetadataError('Register as a public OAuth client using token_endpoint_auth_method: none. PKCE S256 is required.');
        if(client.redirect_uris.length>5)throw new InvalidClientMetadataError('Too many redirect URIs');
        for(const uri of client.redirect_uris){const url=new URL(uri);if(url.username||url.password||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new InvalidClientMetadataError('Redirect URIs must use HTTPS, or localhost for local clients.');}
        const result={...client,client_id:client.client_id||randomUUID(),client_id_issued_at:Math.floor(Date.now()/1000),client_secret:undefined,client_secret_expires_at:undefined};store.put('oauthClients',{...result,id:result.client_id});return result;
      }
    },
    async authorize(client,params,res){
      checkResource(params.resource);const scopes=params.scopes?.length?params.scopes:supported;
      if(scopes.some(s=>!supported.includes(s)))throw new InvalidScopeError('Unsupported dashboard scope');
      const request=store.put('oauthRequests',{id:randomBytes(32).toString('hex'),clientId:client.client_id,clientName:client.client_name||'MCP client',scope:scopes.join(' '),scopes,redirectUri:params.redirectUri,state:params.state||'',codeChallenge:params.codeChallenge,status:'Pending',resource:resource(),expiresAt:new Date(Date.now()+600000).toISOString()});
      res.redirect(`${issuer()}/oauth/wait/${request.id}`);
    },
    async challengeForAuthorizationCode(client,code){const grant=store.get('oauthCodes',hash(code));if(!grant||grant.clientId!==client.client_id||grant.expiresAt<Date.now())throw new InvalidGrantError('Invalid or expired authorization code');return grant.codeChallenge;},
    async exchangeAuthorizationCode(client,code,verifier,redirectUri,requestedResource){
      checkResource(requestedResource);const grant=store.get('oauthCodes',hash(code));
      if(!grant||grant.clientId!==client.client_id||grant.expiresAt<Date.now()||grant.redirectUri!==redirectUri||grant.resource!==resource())throw new InvalidGrantError('Invalid authorization code');
      if(!verifier||createHash('sha256').update(verifier).digest('base64url')!==grant.codeChallenge)throw new InvalidGrantError('PKCE verification failed');
      store.remove('oauthCodes',grant.id);return issue(client.client_id,grant.scopes);
    },
    async exchangeRefreshToken(client,refresh,scopes,requestedResource){
      checkResource(requestedResource);const grant=store.get('oauthTokens',hash(refresh));
      if(!grant||grant.type!=='refresh'||grant.clientId!==client.client_id||grant.expiresAt<Date.now()||grant.resource!==resource())throw new InvalidGrantError('Invalid refresh token');
      if(scopes?.some(s=>!grant.scopes.includes(s)))throw new InvalidScopeError('A refresh cannot expand permissions');
      for(const token of store.list('oauthTokens').filter(t=>t.grantId===grant.grantId))store.remove('oauthTokens',token.id);
      return issue(client.client_id,scopes?.length?scopes:grant.scopes,grant.grantId);
    },
    async verifyAccessToken(token){
      const grant=store.get('oauthTokens',hash(token));if(!grant||grant.type!=='access'||grant.expiresAt<Date.now()||grant.resource!==resource())throw new InvalidTokenError('Invalid or expired dashboard token');
      return {token,clientId:grant.clientId,scopes:grant.scopes,expiresAt:Math.floor(grant.expiresAt/1000),resource:resource()};
    },
    async revokeToken(client,request){const grant=store.get('oauthTokens',hash(request.token));if(grant&&grant.clientId===client.client_id)for(const token of store.list('oauthTokens').filter(t=>t.grantId===grant.grantId))store.remove('oauthTokens',token.id);}
  };
}
export async function mountMcp(app,store,actions,{baseUrl}) {
  const issuer=()=>store.settings().publicBaseUrl||baseUrl;
  const provider=createOAuthProvider(store,issuer);
  app.get('/.well-known/oauth-authorization-server',(req,res)=>res.json(createOAuthMetadata({provider,issuerUrl:new URL(issuer()),scopesSupported:supported})));
  for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'])app.get(path,(req,res)=>res.json({resource:`${issuer()}/mcp`,authorization_servers:[issuer()],scopes_supported:supported,resource_name:'VareonHQ local dashboard'}));
  app.use(mcpAuthRouter({provider,issuerUrl:new URL(issuer()),scopesSupported:supported,resourceServerUrl:new URL(`${issuer()}/mcp`),resourceName:'VareonHQ local dashboard'}));
  app.get('/oauth/wait/:id',(req,res)=>{
    const request=store.get('oauthRequests',req.params.id);if(!request||Date.parse(request.expiresAt)<Date.now())return res.status(400).send('This connection request has expired. Start again in ChatGPT.');
    res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Connect to VareonHQ</title><style>body{background:#111319;color:#e8eaf0;font:15px/1.8 system-ui;max-width:600px;margin:15vh auto;padding:25px}h1{font-size:29px}p{color:#a1acc2}code{color:#becaff}a{color:#b8c8ff}</style></head><body><h1>Approve this connection on your Mac.</h1><p><strong>${esc(request.clientName)}</strong> is requesting <code>${esc(request.scope)}</code> access to your VareonHQ dashboard.</p><p>Open your local dashboard → Connections → Connection requests. Check this is the connection you started, then allow or deny it.</p><p id="status">Waiting for your decision…</p><script>setInterval(async()=>{const r=await fetch('/oauth/status/${request.id}');if(r.ok){const d=await r.json();if(d.status==='Approved'||d.status==='Declined')location.href='/oauth/continue/${request.id}';else if(d.status==='Expired')document.getElementById('status').textContent='This request expired. Start again.';}},2000);</script></body></html>`);
  });
  app.get('/oauth/status/:id',(req,res)=>{const request=store.get('oauthRequests',req.params.id);res.json({status:!request||Date.parse(request.expiresAt)<Date.now()?'Expired':request.status});});
  app.post('/api/oauth-requests/:id',(req,res)=>{
    const request=store.get('oauthRequests',req.params.id);if(!request||request.status!=='Pending'||Date.parse(request.expiresAt)<Date.now())throw new Error('This request is no longer pending');
    if(typeof req.body.approve!=='boolean')throw new Error('Choose allow or deny');
    store.put('oauthRequests',{...request,status:req.body.approve?'Approved':'Declined'});store.log(`${req.body.approve?'Allowed':'Denied'} dashboard access for ${request.clientName}`);res.json({ok:true});
  });
  app.get('/oauth/continue/:id',(req,res)=>{
    const request=store.get('oauthRequests',req.params.id);if(!request||Date.parse(request.expiresAt)<Date.now()||!['Approved','Declined'].includes(request.status))return res.status(400).send('Connection request unavailable');
    const redirect=new URL(request.redirectUri);if(request.state)redirect.searchParams.set('state',request.state);
    if(request.status==='Declined')redirect.searchParams.set('error','access_denied');
    else{const code=randomBytes(32).toString('base64url');store.put('oauthCodes',{id:hash(code),clientId:request.clientId,codeChallenge:request.codeChallenge,redirectUri:request.redirectUri,scopes:request.scopes,resource:request.resource,expiresAt:Date.now()+120000});redirect.searchParams.set('code',code);}
    store.put('oauthRequests',{...request,status:'Completed'});res.redirect(redirect.toString());
  });
  app.post('/api/oauth/revoke',(req,res)=>{for(const collection of ['oauthTokens','oauthCodes','oauthRequests'])for(const item of store.list(collection))store.remove(collection,item.id);store.log('Revoked all ChatGPT dashboard access');res.json({ok:true});});
  app.use('/mcp',(req,res,next)=>{
    requireBearerAuth({verifier:provider,requiredScopes:['dashboard:read'],expectedResource:new URL(`${issuer()}/mcp`),resourceMetadataUrl:`${issuer()}/.well-known/oauth-protected-resource/mcp`})(req,res,next);
  });
  app.post('/mcp',async(req,res)=>{
    const server=new McpServer({name:'vareonhq',version:'0.1.0'});
    for(const tool of actions.tools){
      const readOnly=!!tool.readOnly,scopes=readOnly?['dashboard:read']:supported;
      server.registerTool(tool.name,{description:tool.description,inputSchema:tool.schema,annotations:{readOnlyHint:readOnly,destructiveHint:false,openWorldHint:false},_meta:{securitySchemes:[{type:'oauth2',scopes}]}},async args=>{
        if(!readOnly&&!req.auth.scopes.includes('dashboard:write'))return {isError:true,content:[{type:'text',text:'This connection has read-only access.'}],_meta:{'mcp/www_authenticate':[`Bearer resource_metadata="${issuer()}/.well-known/oauth-protected-resource/mcp", error="insufficient_scope", scope="dashboard:write"`]}};
        try{return {content:[{type:'text',text:JSON.stringify(await actions.execute(tool.name,args,'ChatGPT'))}]};}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
      });
    }
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{transport.close();server.close();});await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  app.get('/mcp',(req,res)=>res.status(405).set('Allow','POST').send('Use Streamable HTTP POST requests.'));
  app.delete('/mcp',(req,res)=>res.status(405).send('Stateless MCP sessions do not need deletion.'));
  return provider;
}
