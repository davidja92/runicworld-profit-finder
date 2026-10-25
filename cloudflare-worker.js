// RunicWorld public GET-only API relay; no arbitrary destination URLs.
// Deploy at https://dash.cloudflare.com/ > Workers & Pages > Create.
// Change ALLOWED_ORIGIN to your exact GitHub Pages origin or use '*' for public GET data.
const ALLOWED_ORIGIN = '*';
const UPSTREAM = 'https://runicworld.com/api/site';
const ROUTES = new Map([['/ge/market', '/ge/market'], ['/hiscores', '/hiscores']]);
const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin'
};
function json(payload, status=200) {
  return new Response(JSON.stringify(payload), { status, headers: {'content-type':'application/json; charset=utf-8', ...cors} });
}
export default {
 async fetch(request, env, ctx) {
  const url=new URL(request.url);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if(request.method!=='GET') return json({error:'GET only'},405);
  const route=ROUTES.get(url.pathname);
  if(!route) return json({error:'Unknown API route'},404);
  if(url.search) return json({error:'Query strings are not supported by this relay'},400);
  const key=new Request(url.origin+url.pathname,{method:'GET'});
  const cache=caches.default;
  let cached=await cache.match(key);
  if(cached) return cached;
  try {
   const upstream=await fetch(UPSTREAM+route,{headers:{Accept:'application/json'},redirect:'follow',signal:AbortSignal.timeout(20000)});
   if(!upstream.ok) return json({error:`Upstream API returned HTTP ${upstream.status}`},502);
   const type=upstream.headers.get('content-type')||'';
   if(!type.toLowerCase().includes('json')) return json({error:'Upstream did not return JSON'},502);
   // Cache public data, with a longer duration for hiscores than for GE.
   const ttl=route==='/hiscores'?180:60;
   const response=new Response(upstream.body,{status:200,headers:{'content-type':'application/json; charset=utf-8','Cache-Control':`public, max-age=${ttl}`, ...cors}});
   ctx.waitUntil(cache.put(key,response.clone()));
   return response;
  } catch(e) {return json({error:'Could not reach the RunicWorld upstream API. A proxy cannot overcome upstream blocking or outages.'},502);}
 }
};
