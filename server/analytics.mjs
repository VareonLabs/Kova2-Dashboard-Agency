import {createGoogleAnalytics} from './google-analytics.mjs';
import {auditWebsite} from './site-audit.mjs';
export function createAnalytics(store,port=4317,deps={}){
  const google=createGoogleAnalytics(store,port,deps),running=new Map();
  if(!store.settings().websiteAnalyticsInitialised){store.put('websites',{id:'vareonhq',name:'VareonHQ',url:'https://www.vareonhq.com/',clientId:'',ga4PropertyId:'',searchConsoleSite:''});store.setting('websiteAnalyticsInitialised',true);}
  const website=id=>{const site=store.get('websites',id);if(!site)throw new Error('Website not found.');return site;};
  function once(key,fn){if(running.has(key))return running.get(key);const result=Promise.resolve().then(fn).finally(()=>running.delete(key));running.set(key,result);return result;}
  return {google,
    state(){const settings=store.settings();return {configured:!!settings.googleAnalyticsConfigured,connected:!!settings.googleAnalyticsConnected,error:settings.googleAnalyticsError||'',audits:store.list('websiteAudits').slice(0,50)};},
    async report(id,days=28,refresh=false){const site=website(id),key=id+':'+days,cached=store.get('websiteReports',key),signature=JSON.stringify([site.url,site.ga4PropertyId,site.searchConsoleSite]);if(!refresh&&cached?.signature===signature&&Date.now()-Date.parse(cached.fetchedAt)<900000)return cached;return once('report:'+key,async()=>{const result={...await google.report(site,days),id:key,signature};return store.settings().googleAnalyticsConnected?store.put('websiteReports',result):result;});},
    async audit(id){const site=website(id);return once('audit:'+id,async()=>{const result=store.put('websiteAudits',await auditWebsite(site,deps));const older=store.list('websiteAudits').filter(a=>a.websiteId===id).slice(20);for(const row of older)store.remove('websiteAudits',row.id);store.emit('ui',{action:'records_changed',collection:'websites'});return result;});},
  };
}
