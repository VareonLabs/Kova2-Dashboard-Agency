// Forms you build and fill in inside the app: field types, validation of one response, and how a response becomes a lead.
export const FIELD_TYPES={text:'Short text',textarea:'Long text',email:'Email',phone:'Phone',number:'Number',date:'Date',select:'Choose one',checkbox:'Tick box'};
export const LEAD_MAP=['name','email','phone','company'];

const isDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v));
const emailOk=v=>/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

// Returns {answers, errors}. Only fields the form defines are kept; everything is trimmed and bounded.
export function checkAnswers(fields,raw={}){
  const answers={},errors=[];
  for(const f of fields){
    let v=raw[f.id];
    if(f.type==='checkbox'){answers[f.id]=v===true||v==='true'||v==='on';if(f.required&&!answers[f.id])errors.push(`${f.label} needs to be ticked.`);continue;}
    v=String(v??'').trim();
    if(!v){if(f.required)errors.push(`${f.label} is required.`);answers[f.id]='';continue;}
    const max=f.type==='textarea'?5000:300;
    if(v.length>max){errors.push(`${f.label} is too long.`);continue;}
    if(f.type==='email'&&!emailOk(v))errors.push(`${f.label} needs a valid email address.`);
    else if(f.type==='date'&&!isDay(v))errors.push(`${f.label} needs a valid date.`);
    else if(f.type==='number'&&!Number.isFinite(Number(v)))errors.push(`${f.label} needs a number.`);
    else if(f.type==='select'&&!(f.options||[]).includes(v))errors.push(`${f.label}: choose one of the options.`);
    answers[f.id]=v;
  }
  return {answers,errors};
}

// Builds the lead details a response would create, using the form's mapping from lead fields to form fields.
export function leadFrom(form,answers){
  const pick=key=>String(answers[form.leadMap?.[key]]??'').trim();
  const notes=form.fields.filter(f=>answers[f.id]!==''&&answers[f.id]!==false&&!Object.values(form.leadMap||{}).includes(f.id)).map(f=>`${f.label}: ${answers[f.id]===true?'Yes':answers[f.id]}`).join('\n');
  return {name:pick('name'),email:pick('email'),phone:pick('phone'),company:pick('company'),notes};
}
