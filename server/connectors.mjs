import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { randomBytes } from 'node:crypto';
import { readSecret,writeSecret,deleteSecret } from './secrets.mjs';

export function createConnectors(store,baseUrl) {
  const active=new Map(),pendingAuth=new Map();
  function validateUrl(value){const url=new URL(value);if(url.username||url.password||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Use an HTTPS MCP endpoint, or a local HTTP endpoint.');return url.toString();}
  async function connect(id) {
    if(active.has(id))return {connected:true,tools:store.get('connectors',id).tools||[]};
    const item=store.get('connectors',id);if(!item)throw new Error('Connection not found');
    let vault=JSON.parse(await readSecret('mcp-'+id)||'{}'),authorizationUrl='',verifier='';
    const persist=()=>writeSecret('mcp-'+id,JSON.stringify(vault));
    const state=randomBytes(32).toString('hex');
    const provider={redirectUrl:`${baseUrl}/auth/mcp/callback`,clientMetadata:{client_name:'VareonHQ Local',redirect_uris:[`${baseUrl}/auth/mcp/callback`],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'},state:()=>state,clientInformation:()=>vault.client,saveClientInformation:async info=>{vault.client=info;await persist();},tokens:()=>vault.tokens,saveTokens:async tokens=>{vault.tokens=tokens;await persist();},redirectToAuthorization:async url=>{authorizationUrl=url.toString();pendingAuth.set(state,{id,transport,client,expires:Date.now()+600000});},saveCodeVerifier:async value=>{verifier=value;},codeVerifier:()=>verifier,invalidateCredentials:async scope=>{if(scope==='all')vault={};else if(scope==='tokens')delete vault.tokens;else if(scope==='client')delete vault.client;else if(scope==='verifier')verifier='';await persist();}};
    const transport=new StreamableHTTPClientTransport(new URL(item.url),item.auth==='OAuth'?{authProvider:provider,fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})}:{requestInit:vault.bearer?{headers:{Authorization:`Bearer ${vault.bearer}`}}:{}});
    const client=new Client({name:'vareonhq',version:'0.2.0'});
    try{await client.connect(transport);return await finish(id,client,transport);}catch(error){if(authorizationUrl){store.put('connectors',{...item,status:'Sign-in required',lastError:''});return {authorizationUrl,connected:false};}await client.close().catch(()=>{});store.put('connectors',{...item,status:'Connection failed',lastError:error.message});throw error;}
  }
  async function finish(id,client,transport){
    const tools=[];let cursor;
    do{const result=await client.listTools(cursor?{cursor}:{});tools.push(...result.tools);cursor=result.nextCursor;}while(cursor&&tools.length<300);
    active.set(id,{client,transport});const item=store.get('connectors',id);store.put('connectors',{...item,status:'Connected',tools:tools.slice(0,300),lastError:'',lastConnected:new Date().toISOString()});store.log(`Connected MCP: ${item.name}`);return {connected:true,tools};
  }
  return {
    list:()=>store.list('connectors').map(({id,name,url,auth,status,tools=[],lastError,allowActions})=>({id,name,url,auth,status,toolCount:tools.length,lastError,allowActions})),
    async add({name,url,auth='OAuth',bearer='',allowActions=false}){if(typeof name!=='string'||!name.trim()||name.length>100||!['OAuth','Bearer','None'].includes(auth))throw new Error('Enter a connection name and authentication method');const item=store.put('connectors',{name:name.trim(),url:validateUrl(url),auth,allowActions:!!allowActions,status:'Not connected',tools:[]});if(bearer){if(typeof bearer!=='string'||bearer.length>5000)throw new Error('Invalid bearer token');await writeSecret('mcp-'+item.id,JSON.stringify({bearer}));}return item;},
    connect,
    async callback(query){const item=pendingAuth.get(query.state);pendingAuth.delete(query.state);if(!item||item.expires<Date.now())throw new Error('The MCP sign-in expired. Start again from Connections.');if(query.error)throw new Error(query.error_description||query.error);await item.transport.finishAuth(query.code);await item.client.connect(item.transport);return finish(item.id,item.client,item.transport);},
    async disconnect(id){const value=active.get(id);if(value)await value.client.close();active.delete(id);await deleteSecret('mcp-'+id);const item=store.get('connectors',id);if(item)store.put('connectors',{...item,status:'Disconnected',tools:[]});},
    async tools(id){const item=store.get('connectors',id);if(!item)throw new Error('Connection not found');if(!active.has(id)){const result=await connect(id);if(!result.connected)throw new Error('Finish signing in to this MCP connection in Connections first.');}return store.get('connectors',id).tools;},
    async call(id,name,args){const tools=await this.tools(id);const tool=tools.find(t=>t.name===name);if(!tool)throw new Error('This tool is not supplied by the selected connection');const item=store.get('connectors',id);if(!tool.annotations?.readOnlyHint&&!item.allowActions){const request=store.put('approvals',{kind:'connector',connectorId:id,title:`${item.name}: ${name}`,status:'Pending',requestedBy:'GPT',payload:{toolName:name,arguments:args}});return {approvalRequired:true,approvalId:request.id,message:'Review this connector action in the Review queue before it runs.'};}return this.runApproved(id,name,args);},
    async runApproved(id,name,args){if(!active.has(id)){const result=await connect(id);if(!result.connected)throw new Error('Reconnect this MCP service first');}const result=await active.get(id).client.callTool({name,arguments:args},undefined,{timeout:180000,maxTotalTimeout:180000});store.log(`MCP ${store.get('connectors',id).name}: ${name}`,'GPT');store.put('connectorResults',{connectorId:id,toolName:name,result:JSON.stringify(result).slice(0,500000)});return result;},
    close(){for(const{client}of active.values())client.close().catch(()=>{});active.clear();}
  };
}
