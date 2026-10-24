import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs, table, label, stage, matches, HELP } from './lib.mjs';

const fail=(message,code=1)=>{console.error(`vareon: ${message}`);process.exit(code);};
const {positional,pairs,flags}=(()=>{try{return parseArgs(process.argv.slice(2));}catch(e){return fail(e.message,2);}})();
const [command,...rest]=positional;
if(!command||command==='help'||flags.help){console.log(HELP);process.exit(0);}

const dir=resolve(flags.data||process.env.VAREON_DATA_DIR||resolve(homedir(),'Library/Application Support/VareonHQ/business-data'));
// Never create an empty workspace by accident: the folder must already hold a database.
if(!existsSync(resolve(dir,'vareonhq.sqlite')))fail(`no VareonHQ data found in ${dir}. Open the app once, or pass --data <folder>.`);

const root=resolve(import.meta.dirname,'..');
const {createStore}=await import(resolve(root,'server/store.mjs'));
const {schemas,saveRecord,snapshot}=await import(resolve(root,'server/domain.mjs'));
const store=createStore(dir);
const finish=code=>{store.close();process.exit(code);};
const known=name=>{if(!schemas[name]&&!['activity','conversations'].includes(name))fail(`unknown collection “${name}”. Run “vareon collections”.`,2);return name;};
const find=(collection,id)=>{
  const exact=store.get(collection,id);if(exact)return exact;
  const hits=store.list(collection).filter(r=>String(r.id).startsWith(id));
  if(hits.length>1)fail(`“${id}” matches ${hits.length} records. Use more of the id.`,2);
  return hits[0]||fail(`no ${collection} record “${id}”.`);
};
const print=value=>console.log(typeof value==='string'?value:JSON.stringify(value,null,2));

try{
  if(command==='collections'){console.log(Object.keys(schemas).sort().join('\n'));}
  else if(command==='list'){
    const collection=known(rest[0]||fail('usage: vareon list <collection>',2));
    const where={...pairs};let list=store.list(collection).filter(r=>matches(r,where));
    if(flags.limit)list=list.slice(0,Number(flags.limit)||50);
    if(flags.json)print(list);
    else console.log(table(list,[['ID',r=>String(r.id).slice(0,8)],['NAME',label],['STAGE',stage],['UPDATED',r=>String(r.updatedAt||'').slice(0,10)]])+`\n${list.length} ${collection}`);
  }
  else if(command==='get'){const collection=known(rest[0]);print(find(collection,rest[1]||fail('usage: vareon get <collection> <id>',2)));}
  else if(command==='add'||command==='set'){
    const collection=known(rest[0]||fail(`usage: vareon ${command} <collection> ...`,2));
    const base=flags.json&&typeof flags.json==='string'?JSON.parse(flags.json):{};
    const input={...base,...pairs};
    let id;
    if(command==='set'){id=find(collection,rest[1]||fail('usage: vareon set <collection> <id> key=value...',2)).id;}
    if(!Object.keys(input).length)fail('nothing to save. Give key=value pairs or --json.',2);
    const saved=saveRecord(store,collection,input,id,'CLI');
    console.log(`${command==='add'?'Created':'Updated'} ${collection} ${saved.id}  ${label(saved)}`);
  }
  else if(command==='status'||command==='search'){
    const {createActions}=await import(resolve(root,'server/actions.mjs'));
    const actions=createActions(store);
    if(command==='status')print(await actions.execute('get_today',{},'CLI'));
    else{const query=rest.join(' ')||fail('usage: vareon search <text>',2);print(await actions.execute('search_workspace',{query},'CLI'));}
  }
  else{store.close();fail(`unknown command “${command}”. Run “vareon help”.`,2);}
}catch(error){store.close();fail(error.message);}
finish(0);
