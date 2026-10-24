// Pure helpers for the vareon command line: argument parsing, value coercion and plain-text tables.
export function coerce(raw){
  if(raw==='true')return true;
  if(raw==='false')return false;
  if(raw==='null')return null;
  if(/^-?(0|[1-9]\d*)(\.\d+)?$/.test(raw))return Number(raw);
  if(/^[\[{]/.test(raw)){try{return JSON.parse(raw);}catch{/* keep as text */}}
  return raw;
}

export function parseArgs(argv){
  const positional=[],pairs={},flags={};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a.startsWith('--')){
      const [name,inline]=a.slice(2).split(/=(.*)/s);
      if(inline!==undefined)flags[name]=inline;
      else if(name==='json'&&String(argv[i+1]||'').startsWith('{'))flags[name]=argv[++i];
      else if(['json','help','all'].includes(name))flags[name]=true;
      else{if(i+1>=argv.length)throw new Error(`--${name} needs a value`);flags[name]=argv[++i];}
    }else if(/^[A-Za-z][A-Za-z0-9_]*=/.test(a)&&positional.length>=2){
      const at=a.indexOf('=');pairs[a.slice(0,at)]=coerce(a.slice(at+1));
    }else positional.push(a);
  }
  return {positional,pairs,flags};
}

export const label=r=>r.name||r.title||r.subject||r.number||r.id;
export const stage=r=>r.status||r.stage||r.state||'';

export function table(rows,columns){
  if(!rows.length)return '(none)';
  const cells=rows.map(r=>columns.map(([,get])=>String(get(r)??'').replace(/\s+/g,' ').slice(0,60)));
  const widths=columns.map(([head],i)=>Math.max(head.length,...cells.map(c=>c[i].length)));
  const line=values=>values.map((v,i)=>v.padEnd(widths[i])).join('  ').trimEnd();
  return [line(columns.map(c=>c[0])),line(widths.map(w=>'-'.repeat(w))),...cells.map(line)].join('\n');
}

export function matches(record,where){
  return Object.entries(where).every(([k,v])=>String(record[k]??'').toLowerCase()===String(v).toLowerCase());
}

export const HELP=`vareon: work with your VareonHQ business data from the terminal

  vareon status                         today's tasks, invoices, deadlines and reviews
  vareon collections                    every collection you can list or edit
  vareon list <collection> [key=value]  list records; --limit n, --json
  vareon get <collection> <id>          one record as JSON (an id prefix works)
  vareon add <collection> key=value...  create a record; or --json '{"name":"..."}'
  vareon set <collection> <id> key=value...   change fields on a record
  vareon search <text>                  search across the workspace

Options
  --data <dir>   business-data folder (default: the installed app's data, or $VAREON_DATA_DIR)
  --json         print JSON instead of a table

Changes go through the same validation as the app and are recorded as "CLI".
Owner-only steps (accepting proposals, approving reviews, raising invoices) stay in the app.
Deleting records is not offered here.`;
