import {defaultIndustryProfile} from '../server/industry-profile.mjs';
// The app now needs a signed-in owner for every API call. Tests that drive it over HTTP create the owner the way a person
// would, through the sign-up route, and carry the resulting cookie alongside the dashboard cookie.
export const OWNER={name:'Test Owner',email:'owner@example.test',businessName:'Test Co',password:'a-long-test-password',confirmPassword:'a-long-test-password',profile:defaultIndustryProfile(),rememberMe:false};
export const authCookie=setCookie=>String(setCookie||'').match(/vareon_auth_\d+=[^;,\s]+/)?.[0]||'';
export async function fetchOwnerCookie(base,dashboardCookie){
  const res=await fetch(base+'/api/auth/signup',{method:'POST',headers:{Cookie:dashboardCookie,'Content-Type':'application/json','X-Vareon-Local':'1'},body:JSON.stringify(OWNER)});
  const text=await res.text();
  if(!res.ok)throw new Error('Test sign-up failed: '+text);
  return dashboardCookie+'; '+authCookie(res.headers.getSetCookie?.().join(', ')||res.headers.get('set-cookie'));
}
