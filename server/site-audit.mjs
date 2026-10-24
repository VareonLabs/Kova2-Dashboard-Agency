import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP,BlockList} from 'node:net';
import {Parser} from 'htmlparser2';

const blocked=new BlockList(),blocked6=new BlockList();
blocked6.addSubnet('2001::',23,'ipv6');blocked6.addSubnet('2002::',16,'ipv6');blocked6.addSubnet('2001:db8::',32,'ipv6');
for(const[address,prefix]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]])blocked.addSubnet(address,prefix,'ipv4');
export function publicAddress(address){const version=isIP(address);if(version===4)return !blocked.check(address,'ipv4');if(version===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!blocked6.check(address,'ipv6');return false;}
export function publicWebsiteURL(value){const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||(url.port&&!['80','443'].includes(url.port))||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname.endsWith('.local'))throw new Error('Use a public HTTP or HTTPS website without credentials or a custom port.');url.hash='';return url;}
export async function fetchPublicPage(value,redirects=0){
  const url=publicWebsiteURL(value),hostname=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await lookup(hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Website audits can only access public internet addresses.');
  const pinned=addresses[0];
  return new Promise((resolve,reject)=>{
    const req=(url.protocol==='https:'?https:http).get(url,{headers:{'User-Agent':'VareonHQ-WebsiteAudit/1.0','Accept':'text/html,application/xhtml+xml,text/plain,application/xml','Accept-Encoding':'identity'},lookup:(_host,options,callback)=>options.all?callback(null,[pinned]):callback(null,pinned.address,pinned.family),signal:AbortSignal.timeout(15000)},res=>{
      if([301,302,303,307,308].includes(res.statusCode)&&res.headers.location){res.resume();if(redirects>=4)return reject(new Error('The website redirected too many times.'));fetchPublicPage(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);return;}
      const parts=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>2000000){req.destroy(new Error('This page exceeds the 2 MB audit limit.'));return;}parts.push(chunk);});res.on('error',reject);res.on('end',()=>resolve({url:url.href,status:res.statusCode,headers:res.headers,html:Buffer.concat(parts).toString('utf8')}));
    });req.on('error',reject);
  });
}
export function analysePage(page){
  const facts={title:'',description:'',canonical:'',lang:'',viewport:false,robots:[],h1:[],headings:[],paragraphs:0,images:0,missingAlt:0,links:[],text:'',structuredData:[]};let stack=[],suppressed=0,title=false,h1='',heading='',json='',jsonMode=false;
  const parser=new Parser({
    onopentag(tag,attrs){stack.push(tag);if(['script','style','noscript','template'].includes(tag))suppressed++;
      if(tag==='title')title=true;if(tag==='html')facts.lang=attrs.lang||'';
      if(tag==='meta'){const name=(attrs.name||'').toLowerCase();if(name==='description')facts.description=attrs.content||'';if(['robots','googlebot'].includes(name))facts.robots.push(attrs.content||'');if(name==='viewport')facts.viewport=true;}
      if(tag==='link'&&(attrs.rel||'').split(/\s+/).includes('canonical'))facts.canonical=attrs.href||'';
      if(tag==='h1')h1='';if(/^h[2-6]$/.test(tag))heading='';if(tag==='p')facts.paragraphs++;
      if(tag==='img'){facts.images++;if(!Object.hasOwn(attrs,'alt'))facts.missingAlt++;}
      if(tag==='a'&&attrs.href)facts.links.push(attrs.href);if(tag==='script'&&(attrs.type||'').toLowerCase()==='application/ld+json'){jsonMode=true;json='';}
    },
    ontext(text){if(title)facts.title+=text;if(jsonMode)json+=text;if(!suppressed){facts.text+=' '+text;if(stack.includes('h1'))h1+=text;if(stack.some(t=>/^h[2-6]$/.test(t)))heading+=text;}},
    onclosetag(tag){if(tag==='title')title=false;if(tag==='h1')facts.h1.push(h1.trim());if(/^h[2-6]$/.test(tag)&&heading.trim())facts.headings.push(heading.trim());if(tag==='script'&&jsonMode){try{facts.structuredData.push(JSON.parse(json));}catch{facts.structuredData.push({invalid:true});}jsonMode=false;}if(['script','style','noscript','template'].includes(tag))suppressed=Math.max(0,suppressed-1);const index=stack.lastIndexOf(tag);if(index>=0)stack.splice(index);}
  },{decodeEntities:true});parser.end(page.html);
  facts.title=facts.title.trim();const words=facts.text.trim().split(/\s+/).filter(Boolean).length;
  const canonical=(()=>{try{return ['http:','https:'].includes(new URL(facts.canonical,page.url).protocol)&&!!facts.canonical;}catch{return false;}})();
  const noindex=/\b(noindex|none)\b/i.test([...facts.robots,String(page.headers?.['x-robots-tag']||'')].join(','));
  const checks=[];const check=(group,key,label,passed,evidence,advice,weight=10)=>checks.push({group,key,label,passed,evidence,advice,weight});
  check('seo','response','Successful HTML response',page.status===200&&/html/i.test(page.headers?.['content-type']||''),`HTTP ${page.status} · ${page.headers?.['content-type']||'No content type'}`,'Return a 200 HTML page for this URL.');
  check('seo','noindex','No explicit noindex directive',!noindex,noindex?'A noindex or none directive was returned.':'No noindex directive in the HTML or response headers.','Remove noindex only if this page is meant to appear in search.');
  check('seo','title','Page title',!!facts.title,facts.title||'No title found.','Write a useful, unique page title.');
  check('seo','description','Meta description',!!facts.description,facts.description||'No description found.','Add a useful description of this page.');
  check('seo','canonical','Canonical URL',canonical,facts.canonical||'No canonical found.','Set an appropriate canonical URL.');
  check('seo','heading','Main heading',facts.h1.some(Boolean),facts.h1.join(' · ')||'No H1 found.','Add a clear main heading that describes this page.');
  check('seo','language','Document language',!!facts.lang,facts.lang||'No lang attribute found.','Declare the document language.');
  check('seo','viewport','Mobile viewport',facts.viewport,facts.viewport?'Viewport declaration found.':'No viewport declaration found.','Add a responsive viewport declaration.');
  check('seo','alt','Image alt attributes',facts.missingAlt===0,`${facts.missingAlt} of ${facts.images} images missing an alt attribute. Empty alt is accepted for decoration.`,'Add descriptive alt text to informative images; use empty alt for decoration.');
  check('seo','links','Crawlable links',facts.links.some(link=>/^https?:|^\//i.test(link)),`${facts.links.length} anchor links found.`,'Use real anchor links to important public pages.');
  check('aeo','text','Readable HTML content',words>=150,`${words} words available without running JavaScript. The rubric threshold is 150 words.`,'Provide enough useful content in the initial HTML; check rendered content separately.',20);
  check('aeo','sections','Descriptive sections',facts.headings.length>=2,`${facts.headings.length} section headings found. The rubric threshold is 2.`,'Break useful information into clear, descriptive sections.',20);
  check('aeo','paragraphs','Explanatory paragraphs',facts.paragraphs>=2,`${facts.paragraphs} paragraphs found. The rubric threshold is 2.`,'Include clear explanations that answer visitors’ practical questions.',20);
  check('aeo','identity','Contact or company information link',facts.links.some(link=>/contact|about|mailto:|tel:/i.test(link)),'Checks link destinations for contact, about, mailto or tel. This does not verify company claims.','Make company identity and contact information easy to find.',20);
  check('aeo','topic','Visible page topic',!!facts.title&&facts.h1.some(Boolean),`${facts.title||'No title'} · ${facts.h1.join(' · ')||'No H1'}`,'Use a title and main heading that make the page topic clear.',20);
  const scores=Object.fromEntries(['seo','aeo'].map(group=>{const list=checks.filter(c=>c.group===group);return[group,Math.round(100*list.filter(c=>c.passed).reduce((n,c)=>n+c.weight,0)/list.reduce((n,c)=>n+c.weight,0))];}));
  return {url:page.url,status:page.status,title:facts.title,checks,scores,structuredData:{blocks:facts.structuredData.length,invalid:facts.structuredData.filter(s=>s.invalid).length},methodology:'VareonHQ homepage audit v1. Checks initial HTML only, one URL. Equal weights within each group. AEO is a custom answer-readiness checklist, not measured AI visibility or a Google score. Robots.txt, rendering, sitewide quality, factual accuracy, rankings and performance are not evaluated. Passing does not guarantee indexing, rankings or AI citations.'};
}
export async function auditWebsite(site,deps={}){return {...analysePage(await (deps.fetchPage||fetchPublicPage)(site.url)),websiteId:site.id,auditedAt:new Date().toISOString()};}
