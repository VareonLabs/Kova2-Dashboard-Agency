import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve } from 'node:path';
import { createStore } from './store.mjs';
import { createActions } from './actions.mjs';
const store=createStore(process.env.VAREON_DATA_DIR||resolve(import.meta.dirname,'../data'));
const actions=createActions(store);
const server=new McpServer({name:'vareonhq-local',version:'0.1.0'});
for(const tool of actions.tools)server.registerTool(tool.name,{description:tool.description,inputSchema:tool.schema,annotations:{readOnlyHint:!!tool.readOnly,destructiveHint:tool.name==='delete_record',openWorldHint:false}},async args=>{
  try{return {content:[{type:'text',text:JSON.stringify(await actions.execute(tool.name,args,process.env.VAREON_ACTOR||'Codex'))}]};}catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
});
await server.connect(new StdioServerTransport());
process.on('SIGTERM',()=>{store.close();process.exit();});
