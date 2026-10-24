import { createHash } from 'node:crypto';
import { mapAdRows, mapSocialRows, adReport, socialReport } from '../public/ads-social.js';

// Figures for ad and social accounts. Rows come from CSV exports today; a live connection would write the same records.
// Ids come from the figures' own keys, so importing the same export twice updates rows instead of doubling them.
const MAX_ROWS=5000,MAX_CSV=4*1024*1024;
const key=(...parts)=>createHash('sha1').update(parts.join('|')).digest('hex').slice(0,20);

function account(store,collection,id,platforms){
  const a=store.get(collection,id);
  if(!a)throw new Error('Account not found.');
  if(platforms&&!platforms.includes(a.platform))throw new Error('This account does not take that kind of figures.');
  return a;
}
function guard(csv){
  if(typeof csv!=='string'||!csv.trim())throw new Error('Choose a CSV export to import.');
  if(csv.length>MAX_CSV)throw new Error('That file is too large. Export a shorter date range.');
}

export function importAdStats(store,accountId,csv,actor='You'){
  const a=account(store,'adAccounts',accountId);guard(csv);
  const {records,problems,skipped}=mapAdRows(csv);
  if(!records.length)throw new Error(problems[0]||'No usable rows were found in that file.');
  if(records.length>MAX_ROWS)throw new Error(`That file has ${records.length} rows. Import at most ${MAX_ROWS} at a time.`);
  for(const r of records)store.put('adStats',{id:'ad-'+key(accountId,r.date,r.campaign),accountId,...r,source:'CSV import'},{actor});
  store.log(`Imported ${records.length} ad rows for ${a.name}`,actor,accountId);
  return {imported:records.length,skipped,problems};
}
export const adSummary=(store,accountId,days=28,now=new Date())=>{account(store,'adAccounts',accountId);return adReport(store.list('adStats').filter(r=>r.accountId===accountId),days,now);};

export function importSocialStats(store,accountId,csv,actor='You'){
  const a=account(store,'socialAccounts',accountId);guard(csv);
  const {records,problems,skipped}=mapSocialRows(csv);
  const useful=records.filter(r=>r.followers||r.posts||r.likes||r.comments||r.shares||r.reach);
  if(!useful.length)throw new Error(problems[0]||'No followers, posts, comments or reach figures were found in that file.');
  if(useful.length>MAX_ROWS)throw new Error(`That file has ${useful.length} rows. Import at most ${MAX_ROWS} at a time.`);
  for(const r of useful)store.put('socialStats',{id:'so-'+key(accountId,r.date),accountId,...r,source:'CSV import'},{actor});
  store.log(`Imported ${useful.length} social rows for ${a.name}`,actor,accountId);
  return {imported:useful.length,skipped:skipped+records.length-useful.length,problems};
}
export const socialSummary=(store,accountId,days=90,now=new Date())=>{account(store,'socialAccounts',accountId);return socialReport(store.list('socialStats').filter(r=>r.accountId===accountId),days,now);};

export function removeAccountStats(store,collection,accountId){
  const stats=collection==='adAccounts'?'adStats':'socialStats';
  for(const r of store.list(stats).filter(r=>r.accountId===accountId))store.remove(stats,r.id);
}
