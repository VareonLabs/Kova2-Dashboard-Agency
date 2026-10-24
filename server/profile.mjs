import { z } from 'zod';

// Who the business is, and how it looks on forms and documents. Stored as one settings entry; shown to the whole app.
const text=(max,fallback='')=>z.string().trim().max(max).default(fallback);
const logo=z.string().max(220000).default('').refine(v=>!v||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v),'Use a PNG, JPEG or WebP logo').refine(v=>!v||Math.ceil((v.length-v.indexOf(',')-1)*3/4)<=150*1024,'Keep the logo under 150 KB');
export const profileSchema=z.object({
  businessName:z.string().trim().min(1,'Add your business name').max(120),
  legalName:text(160),
  abn:z.string().trim().default('').refine(v=>!v||/^\d{11}$/.test(v.replace(/\s/g,'')),'An ABN has 11 digits'),
  email:z.union([z.literal(''),z.email()]).default(''),
  phone:text(40),
  website:z.union([z.literal(''),z.url().refine(v=>/^https?:/.test(v))]).default(''),
  address:text(300),
  accentColor:z.string().trim().default('#C6F432').refine(v=>/^#[0-9a-fA-F]{6}$/.test(v),'Use a six-digit colour such as #C6F432'),
  logo,
  formFooter:text(300)
});
export const defaultProfile=settings=>profileSchema.parse({businessName:settings.businessName||'VareonHQ',email:settings.email||'',...(settings.profile||{})});
export function saveProfile(store,input){
  const parsed=profileSchema.safeParse({...defaultProfile(store.settings()),...input});
  if(!parsed.success)throw new Error(parsed.error.issues[0].message);
  const profile=parsed.data;
  store.setting('profile',profile);
  store.setting('businessName',profile.businessName);
  store.log('Updated business details',typeof input.__actor==='string'?input.__actor:'You','profile');
  return profile;
}
