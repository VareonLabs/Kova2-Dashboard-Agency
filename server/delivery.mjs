import { checkEnvironment } from './github.mjs';
import { saveRecord } from './domain.mjs';

// Owner-triggered provider reads. Results are stored on the record with their source and time, never typed in.
export function createDelivery(store,github,dependencies={}){
  const must=(collection,id,label)=>{const record=store.get(collection,id);if(!record)throw new Error(label+' not found.');return record;};
  return {
    async verifyRepository(id){const repository=must('repositories',id,'Repository');try{return store.put('repositories',{...repository,...await github.verifyRepository(repository)});}catch(error){store.put('repositories',{...repository,verifiedAt:'',verifyError:error.message});throw error;}},
    async syncLink(id){const link=must('ticketLinks',id,'Link'),repository=must('repositories',link.repositoryId,'Repository');return store.put('ticketLinks',{...link,sync:await github.syncLink(link,repository)});},
    // Turns the last sync into permanent evidence. Pending checks wait; approvals by other reviewers are shown but
    // never count as the owner's review; requested changes are recorded as failed reviews.
    importEvidence(id){
      const link=must('ticketLinks',id,'Link'),sync=link.sync;if(!sync)throw new Error('Sync this link from GitHub first.');
      const seen=new Set(store.list('ticketEvidence').filter(e=>e.taskId===link.taskId&&e.sourceProvider==='GitHub').map(e=>e.sourceId)),created=[],sha=String(sync.sha||'').slice(0,7);
      const add=(sourceId,record)=>{if(seen.has(sourceId))return;created.push(saveRecord(store,'ticketEvidence',{taskId:link.taskId,sourceProvider:'GitHub',sourceId,...record},undefined,'GitHub'));seen.add(sourceId);};
      add(`change:${link.id}:${sync.sha}`,{kind:'Change',result:'Info',title:`${link.kind} ${link.kind==='Pull request'?'#'+link.ref+' ':''}${sync.title}`.slice(0,300),reference:sync.url,details:`${sync.state}${sha?' · '+sha:''} · read from GitHub ${sync.syncedAt}`});
      for(const check of sync.checks||[])if(check.result!=='Pending')add(`${check.id}:${check.result}`,{kind:'Check',result:check.result,title:check.name.slice(0,300),reference:check.url,details:`GitHub check on ${sha}`});
      for(const review of sync.reviews||[])if(review.state==='Changes requested')add(`review:${review.reviewer}:${review.submittedAt}`,{kind:'Review',result:'Failed',title:`Changes requested by ${review.reviewer}`,reference:sync.url,details:'Read from GitHub'});
      return {created:created.length,pending:(sync.checks||[]).filter(c=>c.result==='Pending').length};
    },
    async checkEnvironment(id){const environment=must('environments',id,'Environment');return store.put('environments',{...environment,health:await checkEnvironment(environment.url,dependencies)});},
    async syncDeployment(id){const environment=must('environments',id,'Environment'),repository=environment.repositoryId&&store.get('repositories',environment.repositoryId);if(!repository||!environment.githubEnvironment)throw new Error('Link a repository and the GitHub environment name (for example Production or Preview) first.');return store.put('environments',{...environment,deployment:await github.latestDeployment(repository,environment.githubEnvironment)});}
  };
}
