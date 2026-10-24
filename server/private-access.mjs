// Trust Serve identity only from the loopback proxy, for one configured owner.
export function privateAccess(port, config={}) {
  const origins=[`http://localhost:${port}`,`http://127.0.0.1:${port}`];
  let remote;
  try { const u=new URL(config.origin);if(u.protocol==='https:'&&u.hostname.endsWith('.ts.net')&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password&&config.login)remote=u; } catch {}
  const trusted=req=>Boolean(remote&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)&&req.headers.host===remote.host&&req.headers['tailscale-user-login']===config.login&&req.headers['x-forwarded-proto']==='https');
  return {allowed:req=>origins.some(o=>new URL(o).host===req.headers.host)||trusted(req),originAllowed:(req,origin)=>origins.includes(origin)||(trusted(req)&&origin===remote.origin),remote:trusted};
}
