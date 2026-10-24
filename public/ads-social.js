// Ad and social figures. Until a platform is connected, the numbers come from the platform's own CSV exports; a live
// connection will fill the same records later. Everything here is pure so the server and the pages share it.
export const AD_PLATFORMS={
  'Google Ads':{needs:[
    ['A Google Ads account and its customer ID','The 10-digit number at the top right of Google Ads, e.g. 123-456-7890.','https://support.google.com/google-ads/answer/1704344'],
    ['A manager (MCC) account, if you manage clients','Lets one login read many client accounts. Its ID is the “login customer ID”.','https://support.google.com/google-ads/answer/6139186'],
    ['A developer token','Requested in the manager account under API Center. Basic access is enough for reporting.','https://developers.google.com/google-ads/api/docs/api-policy/developer-token'],
    ['Google sign-in with Google Ads permission','The existing Google sign-in would need the Google Ads scope added and approved.','https://developers.google.com/google-ads/api/docs/oauth/overview']]},
  'Meta Ads':{needs:[
    ['A Meta Business account and the ad account ID','Business Settings → Accounts → Ad accounts. The ID looks like act_1234567890.','https://www.facebook.com/business/help/1492627900875762'],
    ['A Meta developer app','Created at developers.facebook.com with the Marketing API added.','https://developers.facebook.com/docs/development/create-an-app'],
    ['ads_read permission (Standard access)','Enough to read your own and your clients’ ad accounts. ads_management is only needed to change ads.','https://developers.facebook.com/docs/marketing-api/overview/authorization'],
    ['App review and Business verification for Advanced access','Needed before the app can read ad accounts that belong to other businesses.','https://developers.facebook.com/docs/development/release/business-verification']]}
};
export const SOCIAL_PLATFORMS={
  Facebook:{needs:[['A Facebook Page you manage','Followers, reach and comments come from the Page, not a personal profile.','https://www.facebook.com/business/help/1710077379203657'],['A Meta developer app with pages_read_engagement','Reads followers, posts and comments on Pages you manage. Needs app review.','https://developers.facebook.com/docs/permissions']]},
  Instagram:{needs:[['An Instagram professional account linked to a Facebook Page','Business or creator accounts only.','https://help.instagram.com/502981923235522'],['A Meta developer app with instagram_basic and instagram_manage_comments','Reads followers and comments. Needs app review.','https://developers.facebook.com/docs/instagram-platform']]},
  LinkedIn:{needs:[['A LinkedIn Page you administer','Company Page analytics are only available to Page admins.','https://www.linkedin.com/help/linkedin/answer/a543852'],['LinkedIn Community Management API access','LinkedIn reviews each application before it can read Page data.','https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview']]},
  X:{needs:[['An X developer account on a paid API plan','Reading followers and replies is not available on the free tier.','https://developer.x.com/en/products/x-api']]},
  TikTok:{needs:[['A TikTok business account','Required for analytics.','https://support.tiktok.com/en/business-and-creator/creator-and-business-accounts/tiktok-business-account'],['TikTok for Developers app approval','Display and Business API scopes are reviewed by TikTok.','https://developers.tiktok.com/']]},
  YouTube:{needs:[['A YouTube channel','Subscriber counts and comments for a channel you own.','https://support.google.com/youtube/answer/1646861'],['The existing Google sign-in with YouTube read permission','Adds the YouTube Data API scope to the Google consent screen.','https://developers.google.com/youtube/v3/getting-started']]}
};

// ---------- CSV ----------
export function parseCsv(text){
  let src=String(text||'').replace(/^﻿/,'');
  const first=src.split(/\r?\n/).find(l=>l.trim())||'';
  const delimiter=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length?'\t':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if(quoted){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;}
    else if(c==='"')quoted=true;
    else if(c===delimiter){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];}
    else cell+=c;
  }
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
const norm=h=>String(h||'').toLowerCase().replace(/\s*\(.*?\)\s*$/,'').replace(/\s+/g,' ').trim();
export const AD_ALIASES={date:['date','day','reporting starts','date range start'],campaign:['campaign','campaign name'],spend:['cost','spend','amount spent'],impressions:['impressions','impr.','impr'],clicks:['clicks','link clicks','clicks (all)','clicks all'],conversions:['conversions','results','purchases','leads','all conv.'],revenue:['conv. value','conversion value','purchase conversion value','purchases conversion value','revenue','all conv. value']};
export const SOCIAL_ALIASES={date:['date','day','end date'],followers:['followers','total followers','page followers','follower count','subscribers','total subscribers'],posts:['posts','published posts','number of posts'],likes:['likes','reactions','total reactions','post reactions'],comments:['comments','total comments','post comments'],shares:['shares','total shares','reposts'],reach:['reach','impressions','views','people reached']};

export function parseDay(value){
  const v=String(value||'').trim();let m;
  if((m=v.match(/^(\d{4})-(\d{2})-(\d{2})/)))return check(+m[1],+m[2],+m[3]);
  if((m=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))return check(+m[3],+m[2],+m[1]);
  return '';
  function check(y,mo,d){const iso=`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;return new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso?iso:'';}
}
export const num=value=>{const v=String(value??'').replace(/[$,\s]/g,'').replace(/%$/,'');if(v===''||v==='--'||v==='-')return 0;const n=Number(v);return Number.isFinite(n)?n:NaN;};

// Finds the header row (exports often have title lines above the table and a totals row below) and maps columns by alias.
export function mapRows(text,aliases,{required}){
  const rows=parseCsv(text);
  const find=r=>{const cols={};r.forEach((h,i)=>{const n=norm(h);for(const [key,list] of Object.entries(aliases))if(cols[key]===undefined&&list.includes(n))cols[key]=i;});return cols;};
  let headerAt=-1,cols={};
  for(let i=0;i<Math.min(rows.length,12);i++){const c=find(rows[i]);if(required.every(k=>c[k]!==undefined)){headerAt=i;cols=c;break;}}
  if(headerAt<0)return {records:[],problems:[`I could not find the columns: ${required.join(', ')}. Check the file is the platform's report export.`],skipped:0};
  const records=[],problems=[];let skipped=0;
  for(const r of rows.slice(headerAt+1)){
    const first=String(r[0]||'').trim();
    if(/^(total|grand total)/i.test(first)||/^total/i.test(String(r[cols.date]||'').trim())){skipped++;continue;}
    const date=parseDay(r[cols.date]);
    if(!date){skipped++;if(problems.length<5&&r.some(x=>x.trim()))problems.push(`Skipped a row with no usable date: “${String(r[cols.date]||'').slice(0,30)}”.`);continue;}
    const rec={date};let bad=false;
    for(const key of Object.keys(aliases)){if(key==='date')continue;if(cols[key]===undefined){rec[key]=key==='campaign'?'':0;continue;}if(key==='campaign'){rec[key]=String(r[cols[key]]||'').trim().slice(0,200);continue;}const n=num(r[cols[key]]);if(Number.isNaN(n)||n<0){bad=true;break;}rec[key]=n;}
    if(bad){skipped++;if(problems.length<5)problems.push(`Skipped ${date}: a figure was not a number.`);continue;}
    records.push(rec);
  }
  return {records,problems,skipped};
}
export const mapAdRows=text=>mapRows(text,AD_ALIASES,{required:['date','spend']});
export const mapSocialRows=text=>mapRows(text,SOCIAL_ALIASES,{required:['date']});

// ---------- reports ----------
const daysAgo=(now,n)=>new Date(now.getTime()-n*86400000).toISOString().slice(0,10);
const ratio=(a,b,scale=1)=>b>0?Math.round(a/b*scale*100)/100:null;
export function adReport(rows,days=28,now=new Date()){
  const from=daysAgo(now,days),list=rows.filter(r=>r.date>=from);
  const sum=(l,k)=>Math.round(l.reduce((n,r)=>n+Number(r[k]||0)*100,0))/100;
  const total=l=>{const spend=sum(l,'spend'),clicks=sum(l,'clicks'),impressions=sum(l,'impressions'),conversions=sum(l,'conversions'),revenue=sum(l,'revenue');return {spend,impressions,clicks,conversions,revenue,ctr:ratio(clicks,impressions,100),cpc:ratio(spend,clicks),cpa:ratio(spend,conversions),roas:ratio(revenue,spend)};};
  const names=[...new Set(list.map(r=>r.campaign||'(no campaign)'))];
  const byCampaign=names.map(n=>({campaign:n,...total(list.filter(r=>(r.campaign||'(no campaign)')===n))})).sort((a,b)=>b.spend-a.spend);
  const dates=[...new Set(list.map(r=>r.date))].sort();
  return {days,from,rows:list.length,totals:total(list),byCampaign,daily:dates.map(d=>({date:d,spend:sum(list.filter(r=>r.date===d),'spend')})),latest:dates.at(-1)||''};
}
export function socialReport(rows,days=90,now=new Date()){
  const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date)),from=daysAgo(now,days),inRange=sorted.filter(r=>r.date>=from);
  const withFollowers=sorted.filter(r=>r.followers>0),latest=withFollowers.at(-1)||null;
  const base=[...withFollowers].reverse().find(r=>r.date<=from)||withFollowers.find(r=>r.date>=from)||null;
  const growth=latest&&base&&latest.date!==base.date?latest.followers-base.followers:null;
  const sum=k=>inRange.reduce((n,r)=>n+Number(r[k]||0),0);
  const engagement=sum('likes')+sum('comments')+sum('shares');
  return {days,snapshots:inRange.length,followers:latest?.followers??null,asOf:latest?.date||'',growth,growthPct:growth!==null&&base.followers>0?Math.round(growth/base.followers*1000)/10:null,posts:sum('posts'),comments:sum('comments'),engagement,reach:sum('reach'),engagementRate:ratio(engagement,sum('reach'),100),series:withFollowers.filter(r=>r.date>=from).map(r=>({date:r.date,followers:r.followers}))};
}
