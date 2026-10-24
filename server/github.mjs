import { readSecret, writeSecret, deleteSecret } from './secrets.mjs';

// Read-only GitHub access for delivery records. Public repositories work without a token; private ones need a
// fine-grained read-only token, kept in macOS Keychain and never returned to the browser or written to records.
const API='https://api.github.com';
const conclusion=run=>run.status!=='completed'?'Pending':['success','neutral','skipped'].includes(run.conclusion)?'Passed':'Failed';
const statusResult=state=>state==='success'?'Passed':state==='pending'?'Pending':'Failed';

export function createGitHub(store,dependencies={}){
  const request=dependencies.fetch||((...args)=>fetch(...args)),read=dependencies.readSecret||readSecret,write=dependencies.writeSecret||writeSecret,remove=dependencies.deleteSecret||deleteSecret;
  async function api(path,token){
    token??=await read('github-token');
    const response=await request(API+path,{headers:{Accept:'application/vnd.github+json','User-Agent':'VareonHQ','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{})},signal:AbortSignal.timeout(15000)});
    if(response.status===404)throw new Error(token?'GitHub could not find that, or the token cannot read it.':'GitHub could not find that. Private repositories need a read-only token in Connections.');
    if(response.status===401)throw new Error('GitHub rejected the saved token. Replace it in Connections.');
    if(response.status===403||response.status===429){const reset=Number(response.headers.get('x-ratelimit-reset'));throw new Error(response.headers.get('x-ratelimit-remaining')==='0'?`GitHub’s rate limit is used up${reset?' until '+new Date(reset*1000).toLocaleTimeString('en-AU',{timeZone:'Australia/Brisbane'}):''}. Adding a token raises it.`:'GitHub refused this request.');}
    if(!response.ok)throw new Error(`GitHub request failed (${response.status}).`);
    return response.json();
  }
  async function checksFor(repo,sha){
    const [runs,combined]=await Promise.all([api(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`).catch(()=>({check_runs:[]})),api(`/repos/${repo}/commits/${sha}/status`).catch(()=>({statuses:[]}))]);
    return [...(runs.check_runs||[]).map(r=>({id:'run:'+r.id,name:r.name,result:conclusion(r),url:r.html_url||r.details_url||'',completedAt:r.completed_at||''})),...(combined.statuses||[]).map(s=>({id:'status:'+s.id,name:s.context,result:statusResult(s.state),url:s.target_url||'',completedAt:s.updated_at||''}))];
  }
  return {
    async status(){const token=await read('github-token');if(!token)return {connected:false};try{const user=await api('/user',token);return {connected:true,login:user.login};}catch(error){return {connected:false,error:error.message};}},
    async saveToken(token){if(typeof token!=='string'||!/^[A-Za-z0-9_]{20,255}$/.test(token.trim()))throw new Error('Paste a GitHub token (it starts with github_pat_ or ghp_).');const user=await api('/user',token.trim());await write('github-token',token.trim());store.log('Connected GitHub (read-only) as '+user.login);return {connected:true,login:user.login};},
    async removeToken(){await remove('github-token');store.log('Removed the GitHub token');return {connected:false};},
    async verifyRepository(repository){
      const repo=await api(`/repos/${repository.owner}/${repository.name}`),branch=repository.branch||repo.default_branch;
      await api(`/repos/${repository.owner}/${repository.name}/branches/${encodeURIComponent(branch)}`);
      return {fullName:repo.full_name,htmlUrl:repo.html_url,defaultBranch:repo.default_branch,private:!!repo.private,verifiedBranch:branch,verifiedAt:new Date().toISOString(),verifyError:''};
    },
    // Reads the current state of a linked pull request, branch or commit, including reviews and check results.
    async syncLink(link,repository){
      const repo=repository.fullName||`${repository.owner}/${repository.name}`,syncedAt=new Date().toISOString();
      if(link.kind==='Pull request'){
        const pr=await api(`/repos/${repo}/pulls/${link.ref}`),reviews=await api(`/repos/${repo}/pulls/${link.ref}/reviews?per_page=100`).catch(()=>[]);
        const latest=new Map();for(const r of reviews)if(r.user?.login&&['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(r.state))latest.set(r.user.login,{reviewer:r.user.login,state:r.state==='APPROVED'?'Approved':r.state==='DISMISSED'?'Dismissed':'Changes requested',submittedAt:r.submitted_at});
        return {source:'GitHub API',syncedAt,title:pr.title,url:pr.html_url,state:pr.merged_at?'Merged':pr.state==='open'?(pr.draft?'Draft':'Open'):'Closed',sha:pr.head?.sha||'',branch:pr.head?.ref||'',reviews:[...latest.values()],checks:pr.head?.sha?await checksFor(repo,pr.head.sha):[]};
      }
      if(link.kind==='Branch'){const branch=await api(`/repos/${repo}/branches/${encodeURIComponent(link.ref)}`),sha=branch.commit?.sha||'';return {source:'GitHub API',syncedAt,title:link.ref,url:`https://github.com/${repo}/tree/${encodeURIComponent(link.ref)}`,state:'Branch',sha,branch:link.ref,reviews:[],checks:sha?await checksFor(repo,sha):[]};}
      const commit=await api(`/repos/${repo}/commits/${link.ref}`);
      return {source:'GitHub API',syncedAt,title:String(commit.commit?.message||'').split('\n')[0].slice(0,300),url:commit.html_url,state:'Commit',sha:commit.sha,branch:'',reviews:[],checks:await checksFor(repo,commit.sha)};
    },
    // Latest GitHub deployment for an environment name (what Vercel and similar services report back to GitHub).
    async latestDeployment(repository,environment){
      const repo=repository.fullName||`${repository.owner}/${repository.name}`,list=await api(`/repos/${repo}/deployments?environment=${encodeURIComponent(environment)}&per_page=1`);
      if(!list.length)return {source:'GitHub deployments',syncedAt:new Date().toISOString(),found:false};
      const deployment=list[0],statuses=await api(`/repos/${repo}/deployments/${deployment.id}/statuses?per_page=1`).catch(()=>[]),latest=statuses[0];
      return {source:'GitHub deployments',syncedAt:new Date().toISOString(),found:true,id:String(deployment.id),sha:deployment.sha,ref:deployment.ref,createdAt:deployment.created_at,state:latest?.state||'unknown',url:latest?.environment_url||latest?.target_url||''};
    }
  };
}

// Fetches an environment URL the owner asked to check: reachability, status code and whether it can be framed.
export async function checkEnvironment(url,dependencies={}){
  const request=dependencies.fetch||((...args)=>fetch(...args)),checkedAt=new Date().toISOString();
  if(!/^https?:\/\//i.test(url||''))return {status:'Unknown',checkedAt,error:'Add an http(s) URL to check this environment.'};
  try{
    const response=await request(url,{method:'GET',redirect:'follow',headers:{'User-Agent':'VareonHQ health check'},signal:AbortSignal.timeout(15000)});
    const frame=String(response.headers.get('x-frame-options')||'').toLowerCase(),ancestors=/frame-ancestors([^;]*)/i.exec(response.headers.get('content-security-policy')||'')?.[1]?.trim()||'';
    await response.body?.cancel?.().catch(()=>{});
    return {status:response.ok?'Healthy':'Down',httpStatus:response.status,checkedAt,error:response.ok?'':`Responded with ${response.status}`,embeddable:!frame&&(!ancestors||/(^|\s)\*(\s|$)/.test(ancestors))};
  }catch(error){return {status:'Down',checkedAt,error:error.name==='TimeoutError'?'No response within 15 seconds.':'Could not reach this URL.',embeddable:false};}
}
