function addresses(value){return String(value||'').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g)||[];}

function lastProspectContact(prospect,data){
  const email=String(prospect.email||'').toLowerCase().trim();
  const touches=(data.prospectTouches||[]).filter(t=>t.prospectId===prospect.id&&['Contacted','Followed up'].includes(t.kind)).map(t=>Date.parse(t.occurredAt)||0);
  const sent=(data.emails||[]).filter(m=>m.status==='Sent'&&!m.deletedAt&&(m.prospectId===prospect.id||email&&addresses(m.to).includes(email))).map(m=>Date.parse(m.sentAt||m.createdAt)||0);
  return Math.max(Date.parse(prospect.createdAt)||0,...touches,...sent);
}

export function applyListView(collection,records,view,data,now=new Date()){
  const query=String(view?.query||'').toLowerCase();
  const status=String(view?.status||'');
  const category=String(view?.category||'');
  const condition=String(view?.condition||'');
  const sevenDaysAgo=now.getTime()-7*86400000;
  return records.filter(record=>{
    if(query&&!JSON.stringify(record).toLowerCase().includes(query))return false;
    if(status&&status!=='All'&&record.status!==status&&record.platform!==status)return false;
    if(category&&record.category!==category)return false;
    if(condition==='overdue')return collection==='invoices'&&record.state==='Overdue';
    if(condition==='notContacted7Days')return collection==='prospects'&&!['Won','Lost'].includes(record.status)&&lastProspectContact(record,data)<=sevenDaysAgo;
    return true;
  });
}
