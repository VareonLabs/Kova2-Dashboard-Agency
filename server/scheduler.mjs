export function createScheduler(store,assistant) {
  let busy=false;
  // Interrupted jobs are never silently repeated: they may have made changes.
  for(const job of store.list('automations'))if(job.running){store.put('automations',{...job,running:false,enabled:false,lastError:'Interrupted by an app restart. Review the last run, then resume.'});}
  for(const run of store.list('runs'))if(run.status==='Running')store.put('runs',{...run,status:'Interrupted',finishedAt:new Date().toISOString()});
  function advance(job) {
    if(job.frequency==='Once')return {...job,enabled:false,running:true};
    const period=(job.frequency==='Daily'?1:7)*86400000;
    let next=Date.parse(job.nextRun);do{next+=period;}while(next<=Date.now());
    return {...job,nextRun:new Date(next).toISOString(),running:true};
  }
  async function runJob(id,manual=false) {
    const job=store.get('automations',id);if(!job)throw new Error('Automation not found');if(job.running)throw new Error('This automation is already running');
    const updated=manual?{...job,running:true}:advance(job);store.put('automations',updated);
    const run=store.put('runs',{automationId:job.id,name:job.name,engine:job.engine,status:'Running',startedAt:new Date().toISOString()});
    try{const output=await (job.engine==='Codex'?assistant.codex(job.prompt):job.engine==='Claude'?assistant.claude(job.prompt):assistant.gpt(job.prompt));store.put('runs',{...run,status:'Complete',output,finishedAt:new Date().toISOString()});store.put('automations',{...store.get('automations',id),running:false,lastError:'',lastRun:new Date().toISOString()});store.log(`Completed automation: ${job.name}`,job.engine);}
    catch(error){store.put('runs',{...run,status:'Failed',output:error.message,finishedAt:new Date().toISOString()});store.put('automations',{...store.get('automations',id),running:false,lastError:error.message,lastRun:new Date().toISOString()});}
  }
  async function tick() {if(busy)return;busy=true;try{for(const job of store.list('automations').filter(j=>j.enabled&&!j.running&&Date.parse(j.nextRun)<=Date.now()))await runJob(job.id);}finally{busy=false;}}
  return {tick,runJob};
}
