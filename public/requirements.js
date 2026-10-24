// Shared by the server (impact on approval) and the browser (comparison view).
// A "scope" is what a PRD commits to: its overview text and its active requirements.
export const requirementFields=['title','statement','acceptanceCriteria','priority','status'];
export const fieldLabels={title:'Title',statement:'Requirement',acceptanceCriteria:'Acceptance criteria',priority:'Priority',status:'Status'};

export function scopeOf(prd,requirements){
  return {title:prd?.title||'',body:prd?.body||'',requirements:requirements.filter(r=>r.prdId===prd?.id).map(r=>({id:r.id,code:r.code,...Object.fromEntries(requirementFields.map(f=>[f,r[f]||'']))})).sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}))};
}

export function diffScopes(before,after){
  const previous=new Map((before?.requirements||[]).map(r=>[r.id,r])),next=new Map((after?.requirements||[]).map(r=>[r.id,r]));
  const added=[...next.values()].filter(r=>!previous.has(r.id));
  const removed=[...previous.values()].filter(r=>!next.has(r.id));
  const changed=[...next.values()].filter(r=>previous.has(r.id)).map(r=>{const old=previous.get(r.id);return {id:r.id,code:r.code,title:r.title,fields:requirementFields.filter(f=>String(old[f]||'')!==String(r[f]||'')).map(f=>({field:f,before:old[f]||'',after:r[f]||''}))};}).filter(c=>c.fields.length);
  const bodyChanged=String(before?.body||'')!==String(after?.body||'');
  return {added,removed,changed,bodyChanged,empty:!added.length&&!removed.length&&!changed.length&&!bodyChanged};
}

// Tickets planned against an older revision whose linked requirements were changed, retired or removed since.
export function impactedTickets(tasks,prdId,revisions,latest){
  if(!latest)return [];
  const byId=new Map(revisions.map(r=>[r.id,r]));
  return tasks.filter(t=>t.prdId===prdId&&t.plannedRevisionId&&t.plannedRevisionId!==latest.id).map(t=>{
    const planned=byId.get(t.plannedRevisionId);if(!planned)return null;
    const diff=diffScopes(planned.snapshot,latest.snapshot),touched=new Set([...diff.changed.map(c=>c.id),...diff.removed.map(r=>r.id)]);
    const affected=(t.requirementIds||[]).filter(id=>touched.has(id));
    return {task:t,planned:planned.number,latest:latest.number,affected,bodyChanged:diff.bodyChanged};
  }).filter(item=>item&&(item.affected.length||item.bodyChanged));
}

// Project engineering standard: the parts a revision freezes, and field-level differences between two versions.
export const standardFields=['baseVersion','definitionOfDone','repositoryConventions','reviewPolicy','notes'];
export const standardLabels={baseVersion:'Based on',definitionOfDone:'Definition of done',repositoryConventions:'Repository conventions',reviewPolicy:'Review and approval policy',notes:'Notes'};
export const standardOf=record=>Object.fromEntries(standardFields.map(f=>[f,String(record?.[f]||'')]));
export function diffStandards(before,after){const fields=standardFields.filter(f=>String(before?.[f]||'')!==String(after?.[f]||'')).map(f=>({field:f,before:before?.[f]||'',after:after?.[f]||''}));return {fields,empty:!fields.length};}
export const agencyStandard={baseVersion:'Agency standard 1.0',
  definitionOfDone:'Acceptance criteria are mapped to checks and verified\nAppropriate checks were run and passed; failures are recorded, never relabelled\nThe change is reviewable and the review outcome is recorded\nDocumentation and release notes are updated\nKnown limitations are stated\nDeployed work is verified in its intended environment with a rollback reference; non-deployed work is accepted with evidence',
  repositoryConventions:'Record the verified repository and ref on the project\nRead repository instructions before changing code\nOne ticket per branch; reference the ticket key in commits and pull requests\nNever store credentials in code, tickets, logs or memory',
  reviewPolicy:'A person reviews every change before release\nProduction deployments and external actions need owner authorisation\nAssistants may propose changes but never approve their own requests',notes:''};
