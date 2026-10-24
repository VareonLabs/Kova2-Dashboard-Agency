import {randomBytes,createHash} from 'node:crypto';
import {readSecret,writeSecret,deleteSecret} from './secrets.mjs';

const account='google-analytics';
const scopes=['https://www.googleapis.com/auth/analytics.readonly','https://www.googleapis.com/auth/webmasters.readonly'];
export function createGoogleAnalytics(store,port=4317,deps={}){
  const request=deps.fetch||fetch,read=deps.readSecret||readSecret,write=deps.writeSecret||writeSecret,remove=deps.deleteSecret||deleteSecret,now=deps.now||Date.now;
  const redirect=`http://127.0.0.1:${port}/auth/google/callback`,pending=new Map();let refreshing,generation=0;
  async function vault(){const raw=await read(account);return raw?JSON.parse(raw):{};}
  async function token(body){const response=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok||!data.access_token)throw new Error(data.error==='invalid_grant'?'Google sign-in expired. Reconnect Google.':'Google could not complete sign-in. Check the desktop OAuth client and try again.');return data;}
  async function access(){
    const revision=generation,saved=await vault();if(!saved.refreshToken&&!saved.accessToken)throw new Error('Connect Google to load private website reports.');
    if(saved.accessToken&&saved.expiresAt>now()+60000)return saved.accessToken;
    if(!refreshing)refreshing=(async()=>{const fresh=await token({client_id:saved.clientId,client_secret:saved.clientSecret,grant_type:'refresh_token',refresh_token:saved.refreshToken});if(revision!==generation)throw new Error('Google connection changed. Try again.');await write(account,JSON.stringify({...saved,accessToken:fresh.access_token,refreshToken:fresh.refresh_token||saved.refreshToken,expiresAt:now()+Number(fresh.expires_in||3600)*1000}));return fresh.access_token;})().finally(()=>refreshing=null);
    return refreshing;
  }
  async function api(url,body){
    const response=await request(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${await access()}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
    const data=await response.json();if(!response.ok)throw new Error(String(data.error?.message||`Google report failed (${response.status}).`).slice(0,600));return data;
  }
  return {
    async configure(input){
      const config=input?.installed;
      if(!config||!/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(config.client_id||'')||typeof config.client_secret!=='string'||!config.client_secret||config.client_secret.length>1000)throw new Error('Import the original Google OAuth client JSON for a Desktop app.');
      generation++;if(refreshing)await refreshing.catch(()=>{});await write(account,JSON.stringify({clientId:config.client_id,clientSecret:config.client_secret}));for(const row of store.list('websiteReports'))store.remove('websiteReports',row.id);pending.clear();store.setting('googleAnalyticsConfigured',true);store.setting('googleAnalyticsConnected',false);return {ok:true};
    },
    async authorize(){const saved=await vault();if(!saved.clientId)throw new Error('Set up the Google desktop connection first.');for(const[key,item]of pending)if(item.expiresAt<now())pending.delete(key);const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');pending.set(state,{verifier,expiresAt:now()+600000});const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:saved.clientId,redirect_uri:redirect,response_type:'code',scope:scopes.join(' '),state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent'});return {url:url.href};},
    async callback(query){
      const state=typeof query.state==='string'?query.state:'',attempt=pending.get(state);pending.delete(state);
      if(!attempt||attempt.expiresAt<now())throw new Error('Google sign-in expired or could not be verified. Start again from Analytics.');
      if(query.error)throw new Error('Google sign-in was cancelled or permission was declined.');
      if(typeof query.code!=='string'||!query.code)throw new Error('Google did not return a sign-in code.');
      const revision=generation,saved=await vault(),fresh=await token({client_id:saved.clientId,client_secret:saved.clientSecret,redirect_uri:redirect,code:query.code,code_verifier:attempt.verifier,grant_type:'authorization_code'});
      const granted=String(fresh.scope||'').split(' ');if(!scopes.every(scope=>granted.includes(scope)))throw new Error('Allow both Analytics and Search Console read access, then reconnect.');
      if(revision!==generation)throw new Error('Google connection changed. Start sign-in again.');
      await write(account,JSON.stringify({...saved,accessToken:fresh.access_token,refreshToken:fresh.refresh_token||saved.refreshToken,expiresAt:now()+Number(fresh.expires_in||3600)*1000}));for(const row of store.list('websiteReports'))store.remove('websiteReports',row.id);store.setting('googleAnalyticsConnected',true);store.setting('googleAnalyticsError','');return {ok:true};
    },
    async disconnect(){generation++;if(refreshing)await refreshing.catch(()=>{});await remove(account);pending.clear();store.setting('googleAnalyticsConfigured',false);store.setting('googleAnalyticsConnected',false);store.setting('googleAnalyticsError','');for(const report of store.list('websiteReports'))store.remove('websiteReports',report.id);return {ok:true};},
    async properties(){
      const [ga,search]=await Promise.allSettled([(async()=>{const properties=[];let pageToken='';do{const result=await api('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?'+new URLSearchParams({pageSize:'200',...(pageToken?{pageToken}:{})}));for(const account of result.accountSummaries||[])for(const p of account.propertySummaries||[])properties.push({id:p.property.replace('properties/',''),name:p.displayName,account:account.displayName});pageToken=result.nextPageToken||'';}while(pageToken&&properties.length<2000);return properties;})(),api('https://www.googleapis.com/webmasters/v3/sites')]);
      return {properties:ga.status==='fulfilled'?ga.value:[],sites:search.status==='fulfilled'?(search.value.siteEntry||[]).filter(s=>s.permissionLevel!=='siteUnverifiedUser'):[],analyticsError:ga.status==='rejected'?ga.reason.message:'',searchError:search.status==='rejected'?search.reason.message:''};
    },
    async report(site,days=28){
      if(![7,28,90].includes(days))throw new Error('Choose 7, 28 or 90 days.');
      // GA dates use the property's timezone; Search Console dates use Pacific time.
      const pacific=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now()));
      const end=new Date(pacific+'T12:00:00Z');end.setUTCDate(end.getUTCDate()-1);const start=new Date(end);start.setUTCDate(start.getUTCDate()-days+1);const dates={startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)};
      const ga=async()=>{if(!site.ga4PropertyId)return {status:'unconfigured'};const url=`https://analyticsdata.googleapis.com/v1beta/properties/${site.ga4PropertyId}:runReport`,base={dateRanges:[{startDate:`${days}daysAgo`,endDate:'yesterday'}]},metrics=['activeUsers','sessions','screenPageViews','engagementRate','keyEvents'];const [summary,trend,sources,pages]=await Promise.all([
        api(url,{...base,metrics:metrics.map(name=>({name}))}),
        api(url,{...base,dimensions:[{name:'date'}],metrics:[{name:'sessions'}],orderBys:[{dimension:{dimensionName:'date'}}]}),
        api(url,{...base,dimensions:[{name:'sessionSourceMedium'}],metrics:[{name:'sessions'}],orderBys:[{metric:{metricName:'sessions'},desc:true}],limit:'20'}),
        api(url,{...base,dimensions:[{name:'pagePath'}],metrics:[{name:'screenPageViews'}],orderBys:[{metric:{metricName:'screenPageViews'},desc:true}],limit:'10'})]);
        const rows=r=>(r.rows||[]).map(row=>({label:row.dimensionValues?.[0]?.value||'',value:Number(row.metricValues?.[0]?.value||0)}));
        return {status:'ready',empty:!summary.rows?.length,totals:summary.rows?.length?Object.fromEntries(metrics.map((key,i)=>[key,Number(summary.rows[0].metricValues[i].value)])):null,trend:rows(trend),sources:rows(sources),pages:rows(pages),timezone:summary.metadata?.timeZone||'Property timezone',quality:{thresholded:!!summary.metadata?.subjectToThresholding,sampled:!!summary.metadata?.samplingMetadatas?.length,otherRow:!!summary.metadata?.dataLossFromOtherRow}};
      };
      const gsc=async()=>{if(!site.searchConsoleSite)return {status:'unconfigured'};const url=`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.searchConsoleSite)}/searchAnalytics/query`,base={...dates,type:'web',dataState:'final'};const [summary,queries,pages]=await Promise.all([api(url,base),api(url,{...base,dimensions:['query'],rowLimit:10}),api(url,{...base,dimensions:['page'],rowLimit:10})]);return {status:'ready',totals:summary.rows?.[0]||null,queries:queries.rows||[],pages:pages.rows||[],...dates};};
      const safe=async fn=>{try{return await fn();}catch(error){return {status:'error',error:error.message};}};
      const [analytics,search]=await Promise.all([safe(ga),safe(gsc)]);return {websiteId:site.id,days,analytics,search,fetchedAt:new Date(now()).toISOString()};
    }
  };
}
