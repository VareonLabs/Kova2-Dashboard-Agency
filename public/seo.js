// AI-answer checks are logged by hand: someone asks an assistant a customer's question and records what came back.
// That is the only honest source today, so the figures here are only ever what was recorded.
export const ENGINES=['ChatGPT','Claude','Gemini','Perplexity','Google AI Overview','Copilot','Other'];
export const RESULTS=['Mentioned and linked','Mentioned','Not mentioned'];
const WINDOW_DAYS=90;

export function answerStats(checks,websiteId,now=new Date()){
  const since=new Date(now.getTime()-WINDOW_DAYS*86400000).toISOString().slice(0,10);
  const rows=checks.filter(c=>c.websiteId===websiteId&&String(c.checkedOn)>=since);
  const rate=(n,d)=>d?Math.round(n/d*100):null;
  const summary=list=>({checks:list.length,mentionRate:rate(list.filter(c=>c.result!=='Not mentioned').length,list.length),linkRate:rate(list.filter(c=>c.result==='Mentioned and linked').length,list.length)});
  const engines=[...new Set(rows.map(r=>r.engine))].sort();
  return {total:rows.length,...summary(rows),windowDays:WINDOW_DAYS,byEngine:engines.map(engine=>({engine,...summary(rows.filter(r=>r.engine===engine))}))};
}
