import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const tracked=new Set(['clients','projects','designs','designRevisions','services','proposals','variations','retainers','people','forms','formSubmissions','answerChecks','adAccounts','socialAccounts','phoneLines','calls','smsMessages','deals','clientContacts','dashboards','clientAssets','supportRequests','listViews','tasks','ticketComments','requirements','projectStandards','standardExceptions','repositories','environments','releases','projectTemplates','contracts','posts','notes','invoices','payments','expenses','resources','documents','onboardingTemplates','onboardings','renewals','timeEntries','meetingNotes','websites','prospects','automations','meetings','forecastItems','reportSchedules','forecastSettings','workloadSettings']);
export const collections = ['clients', 'projects', 'tasks', 'contracts', 'posts', 'emails', 'automations', 'runs', 'approvals', 'messages', 'activity', 'codexJobs'];
export function createStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = resolve(directory, 'vareonhq.sqlite');
  const db = new DatabaseSync(file);
  chmodSync(file, 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id)); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, data TEXT NOT NULL, createdAt TEXT NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS record_versions (collection TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(collection,id))');
  const version=(collection,id)=>db.prepare('SELECT version FROM record_versions WHERE collection=? AND id=?').get(collection,id)?.version||0;
  const bump=(collection,id)=>{db.prepare('INSERT INTO record_versions VALUES (?,?,1) ON CONFLICT(collection,id) DO UPDATE SET version=version+1').run(collection,id);return version(collection,id);};
  const list = (collection) => db.prepare('SELECT data FROM records WHERE collection=? ORDER BY rowid DESC').all(collection).map(row => JSON.parse(row.data));
  const get = (collection, id) => { const row = db.prepare('SELECT data FROM records WHERE collection=? AND id=?').get(collection, id); return row ? JSON.parse(row.data) : null; };
  function atomic(fn){const name='write_'+randomUUID().replace(/-/g,'');db.exec('SAVEPOINT '+name);try{const value=fn();db.exec('RELEASE '+name);return value;}catch(error){try{db.exec('ROLLBACK TO '+name);db.exec('RELEASE '+name);}catch{}throw error;}}
  const put = (collection, record,meta={}) => atomic(()=>{
    const prior = record.id ? get(collection, record.id) : null;
    const value = { ...prior, ...record, id: record.id || randomUUID(), createdAt: prior?.createdAt || record.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').run(collection, value.id, JSON.stringify(value));
    const revision=bump(collection,value.id);
    if(tracked.has(collection)){const clean=r=>r&&Object.fromEntries(Object.entries(r).filter(([k])=>!['createdAt','updatedAt'].includes(k)));if(JSON.stringify(clean(prior))!==JSON.stringify(clean(value))){const change={id:randomUUID(),collection,entityId:value.id,action:prior?'Updated':'Created',title:value.name||value.title||collection,actor:meta.actor||'System',before:prior,after:value,afterVersion:revision,undoOf:meta.undoOf||'',createdAt:new Date().toISOString()};db.prepare('INSERT INTO records VALUES (?,?,?)').run('changes',change.id,JSON.stringify(change));}}
    return value;
  });
  const remove = (collection,id,meta={}) => atomic(()=>{const before=get(collection,id);const result=db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,id);const revision=bump(collection,id);if(before&&tracked.has(collection)){const change={id:randomUUID(),collection,entityId:id,action:'Deleted',title:before.name||before.title||collection,actor:meta.actor||'System',before,after:null,afterVersion:revision,undoOf:meta.undoOf||'',createdAt:new Date().toISOString()};db.prepare('INSERT INTO records VALUES (?,?,?)').run('changes',change.id,JSON.stringify(change));}return result;});
  const settings = () => Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, JSON.parse(r.value)]));
  const setting = (key, value) => db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  const log = (text, actor='You', entityId=null) => put('activity', { text, actor, entityId });
  const emit=(type,data)=>{db.prepare('INSERT INTO events(type,data,createdAt) VALUES (?,?,?)').run(type,JSON.stringify(data),new Date().toISOString());db.prepare('DELETE FROM events WHERE sequence < (SELECT MAX(sequence)-5000 FROM events)').run();};
  const eventsAfter=(sequence=0)=>db.prepare('SELECT * FROM events WHERE sequence>? ORDER BY sequence LIMIT 500').all(sequence).map(row=>({...row,data:JSON.parse(row.data)}));
  const latestSequence=()=>db.prepare('SELECT COALESCE(MAX(sequence),0) AS sequence FROM events').get().sequence;
  return { directory, db, version, list, get, put, remove, settings, setting, log, emit, eventsAfter, latestSequence, close: () => db.close() };
}

export const defaults = { businessName: 'VareonHQ', email: 'hello@vareonhq.com', timezone: 'Australia/Brisbane', microsoftClientId: '', microsoftTenant: 'common', publicBaseUrl: '', approvalForSending: true };
