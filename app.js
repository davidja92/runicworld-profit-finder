'use strict';
// Optional public-data proxy. Leave proxyBase blank to fetch directly.
const proxyBase = String(window.RUNICWORLD_CONFIG?.proxyBase || '').trim().replace(/\/+$/, '');
const API_MARKET=proxyBase ? `${proxyBase}/ge/market` : 'https://runicworld.com/api/site/ge/market';
const API_HISCORES=proxyBase ? `${proxyBase}/hiscores` : 'https://runicworld.com/api/site/hiscores';
const $=id=>document.getElementById(id), numeric=x=>Number.isFinite(Number(x))?Number(x):0;
const fmt=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:0});
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let defaults={},skills={},methods=[],market=[],marketMap=new Map(),activeMethod=0,profileName='',runeShops={},customShops={},customSellShops={},itemValues={};
let refreshTimer=null,marketFetchPending=false,lastSuccessfulLive=0,marketSource='none';
const MARKET_CACHE_KEY='rw_profit_live_market_v63', REFRESH_KEY='rw_profit_auto_refresh_minutes';
// The API provides a 24-hour aggregate and only a limited recent-trades list.
// Do NOT interpret locally observed 1h/7d trades as complete historical turnover.
const TRADE_STORAGE_KEY='rw_observed_trades_v70', VOLUME_SORT_KEY='rw_volume_sort_v70';
let observedTrades=new Map(),observingSince=0,latestTradeFeedCount=0;
function tradeIdentity(t){return [t.entry??'',String(t.name||'').toLowerCase(),t.at,t.price,t.qty].join('|');}
function readObservedTrades(){
  try{const v=JSON.parse(localStorage.getItem(TRADE_STORAGE_KEY)||'null');if(!v||!Array.isArray(v.trades))return;
    observingSince=Number(v.since)||0;for(const t of v.trades){if(Number.isFinite(Number(t.at))&&Number.isFinite(Number(t.qty)))observedTrades.set(tradeIdentity(t),t);}
  }catch(e){}
}
function captureTrades(blob){
  if(!Array.isArray(blob.trades))return;
  const now=Date.now();if(!observingSince)observingSince=now;
  latestTradeFeedCount=blob.trades.length;
  for(const t of blob.trades){if(!t||!Number.isFinite(Number(t.at))||!Number.isFinite(Number(t.qty))||Number(t.qty)<=0||!t.name)continue;
    if(Number(t.at)*1000>now+60000||Number(t.at)*1000<now-7*86400000)continue;
    observedTrades.set(tradeIdentity(t),{name:t.name,entry:t.entry??null,at:Number(t.at),price:Number(t.price)||0,qty:Number(t.qty)});
  }
  for(const [key,t] of observedTrades){if(t.at*1000<now-7*86400000)observedTrades.delete(key);}
  // Storage cap is a safety bound, not a claim of full weekly coverage.
  if(observedTrades.size>45000){const sorted=[...observedTrades.entries()].sort((a,b)=>a[1].at-b[1].at);for(const [key] of sorted.slice(0,observedTrades.size-45000))observedTrades.delete(key);}
  try{localStorage.setItem(TRADE_STORAGE_KEY,JSON.stringify({since:observingSince,trades:[...observedTrades.values()]}));}catch(e){}
}
function itemTradeVolume(name,period){
  const rec=marketRecord(name);
  if(!rec)return {value:null,kind:'missing'};
  if(period==='day'){
    const v=rec.vol24h;
    return v===null||v===undefined||!Number.isFinite(Number(v))?{value:null,kind:'unavailable'}:{value:Math.max(0,Number(v)),kind:'reported'};
  }
  if(!observingSince)return {value:null,kind:'not-observed'};
  const now=Date.now(),duration=period==='hour'?3600000:604800000;
  let count=0;for(const t of observedTrades.values()){
    if(t.at*1000<now-duration||t.at*1000>now+60000)continue;
    if(Number.isFinite(Number(rec.entry))&&rec.entry!==null&&t.entry!==null){if(Number(t.entry)===Number(rec.entry))count+=t.qty;}
    else if(String(t.name).toLowerCase()===String(rec.name).toLowerCase())count+=t.qty;
  }
  return {value:count,kind:'partial'};
}
function methodTradeVolume(method,period){
 const names=Object.keys(rateQuantities(method).outputs||{});
 if(!names.length)return {value:null,kind:'none'};
 const values=names.map(name=>itemTradeVolume(name,period));
 if(values.some(x=>x.value===null))return {value:null,kind:'unavailable'};
 return {value:Math.min(...values.map(x=>x.value)),kind:values.some(x=>x.kind==='partial')?'partial':'reported'};
}
function volumeLabel(v){return v.value===null?'—':`${fmt(v.value)}${v.kind==='partial'?' ≥':''}`;}
function renderTradeCoverage(){const el=$('tradeCoverage');if(!el)return;
 const observed=observingSince?new Date(observingSince).toLocaleString():'not yet';
 el.textContent=`Volume coverage: 24h values are reported by RunicWorld. 1h and 7d are observed lower bounds from the latest ${latestTradeFeedCount} trades per API response (this browser has been collecting since ${observed}). An observed 0 does NOT prove no trades occurred. A refresh may miss transactions between polls.`;
}

const ITEM_ALIASES={'adamant bar':'adamantite bar','rune bar':'runite bar','runite ore':'runite ore','adamant ore':'adamantite ore','runecrafting essence':'rune essence'};
function marketRecord(name){const key=String(name).trim().toLowerCase();return marketMap.get(key)||marketMap.get(ITEM_ALIASES[key]||'');}
const save=()=>{try{localStorage.setItem('rw_profit_web_v5',JSON.stringify({skills,methods,profileName,customShops,customSellShops,priceMode:$('priceMode').value}));}catch{}};
const status=(text,isError=false)=>{$('status').textContent=text;$('status').style.color=isError?'#ffafaf':'#9cd7cb';};
function thresholds(){let p=0,rows=[0];for(let l=1;l<99;l++){p+=Math.floor(l+300*Math.pow(2,l/7));rows.push(Math.floor(p/4));}return rows;}
const XP=thresholds();
function xpLevel(value){let x=Math.max(0,numeric(value)),lo=0,hi=98;while(lo<hi){let mid=Math.ceil((lo+hi)/2);if(XP[mid]<=x)lo=mid;else hi=mid-1;}return lo+1;}
function importHiscores(blob,name){if(!blob||!Array.isArray(blob.players))throw Error('Expected hiscores object with players array.');let player=blob.players.find(p=>p&&String(p.name||'').trim().toLowerCase()===name.trim().toLowerCase());if(!player)throw Error(`Player "${name}" not found in ${blob.players.length} hiscores entries.`);if(!player.xp||typeof player.xp!=='object')throw Error('Player has no XP data.');let lookup=(Array.isArray(blob.skills)&&blob.skills.length?blob.skills:defaults.HISCORES_SKILLS);let out=Object.fromEntries(defaults.SKILLS.map(s=>[s,1]));let known=0;lookup.forEach((raw,i)=>{let actual=defaults.SKILLS.find(s=>s.toLowerCase()===String(raw).toLowerCase()||(s==='Runecrafting'&&String(raw).toLowerCase()==='runecraft'));if(actual){out[actual]=xpLevel(player.xp[String(i)]??0);known++;}});if(!known)throw Error('No recognizable skill IDs in hiscores response.');return {name:player.name,levels:out,ironman:!!player.ironman};}
function applyPlayer(data){skills=data.levels;profileName=data.name;$('playerName').value=data.name;renderSkills();rank();save();status(`Imported ${data.name} (${data.ironman?'Ironman':'Normal'}) — ${Object.keys(skills).length} skills converted from XP.`);}
async function fetchJson(url){
  let res;
  try {res=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});}
  catch(e){throw Error(`Network/CORS failure contacting ${new URL(url,location.href).hostname}`);}
  if(!res.ok){let info='';try{let detail=await res.json();info=detail.error||detail.message||'';}catch{}throw Error(`HTTP ${res.status}${info?' — '+String(info).slice(0,180):''}`);}
  try{return await res.json();}catch{throw Error('Endpoint did not return valid JSON');}
}
async function fetchPlayer(){const name=$('playerName').value.trim();if(!name){status('Enter a player name first.',true);return;}const button=$('loadPlayer');button.disabled=true;status(`Searching hiscores for ${name}…`);try{const blob=await fetchJson(API_HISCORES);if($('playerName').value.trim()!==name){status('Username changed during request. Search again.',true);return;}applyPlayer(importHiscores(blob,name));}catch(e){status(`Hiscores lookup failed: ${e.message}. Existing levels unchanged. You can import a saved hiscores JSON file.`,true);}finally{button.disabled=false;}}
function validMarketItem(x){return x&&typeof x.name==='string'&&x.name.trim().length>0;}
function mergeMarketItems(items, source){
  // Live responses are authoritative for items included in the latest payload. Older
  // records remain in the local catalogue when newly added items appear or an API
  // response omits an item. Bundled snapshots never overwrite existing live quotes.
  for(const x of items){if(!validMarketItem(x))continue;const key=x.name.trim().toLowerCase();
    const previous=marketMap.get(key);
    if(source==='snapshot'&&previous)continue;
    marketMap.set(key,{...previous,...x,name:x.name});
  }
  market=[...marketMap.values()].sort((a,b)=>a.name.localeCompare(b.name));
  $('marketCount').textContent=fmt(market.length);
  renderMarket();rank();renderAudit();renderMarketDatalist();
}
function cacheMarket(){
  try{localStorage.setItem(MARKET_CACHE_KEY,JSON.stringify({savedAt:Date.now(),items:market}));}
  catch(e){/* Storage quota exceeded: live pricing remains available in this tab. */}
}
function loadCachedMarket(){
  try{const raw=JSON.parse(localStorage.getItem(MARKET_CACHE_KEY)||'null');
    if(raw&&Array.isArray(raw.items)&&raw.items.length){mergeMarketItems(raw.items,'cache');
      marketSource='cache';status(`Loaded ${fmt(market.length)} cached GE items; updating from live API…`);return true;}}
  catch(e){}return false;
}
function applyMarket(blob,label,source='live'){
  if(!blob||!Array.isArray(blob.items))throw Error('Expected a market JSON object containing an items array.');
  const items=blob.items.filter(validMarketItem);
  if(items.length===0)throw Error('The market API returned no valid items.');
  const previousCount=marketMap.size;
  mergeMarketItems(items,source);
  if(source==='live'){
    captureTrades(blob);renderTradeCoverage();
    lastSuccessfulLive=Date.now();marketSource='live';cacheMarket();
  }else if(marketSource==='none')marketSource=source;
  const generated=blob.generated?` · API generated ${new Date(blob.generated*1000).toLocaleString()}`:'';
  const added=Math.max(0,marketMap.size-previousCount);
  $('lastMarketUpdate').textContent=source==='live'?`Last successful live update: ${new Date(lastSuccessfulLive).toLocaleTimeString()}`:`Market source: ${marketSource} (awaiting live update)`;
  status(`${fmt(items.length)} items received from ${label}; ${fmt(market.length)} in local catalogue (${added} newly discovered)${generated}`);
}
async function liveMarket({automatic=false}={}){
  if(marketFetchPending||document.hidden&&automatic)return;
  marketFetchPending=true;
  const button=$('refreshMarket');button.disabled=true;
  if(!automatic)status('Fetching RunicWorld GE prices…');
  try{applyMarket(await fetchJson(API_MARKET),'Live API','live');}
  catch(e){status(`Live market update failed: ${e.message}. Previous market data retained.`,true);}
  finally{marketFetchPending=false;button.disabled=false;}
}
async function snapshot(){
  try{applyMarket(await fetchJson('market_snapshot.json'),'bundled snapshot','snapshot');}
  catch(e){status(`Snapshot failed: ${e.message}`,true);}
}
function setRefreshSchedule(){
  if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null;}
  const minutes=Number($('refreshInterval').value);
  try{localStorage.setItem(REFRESH_KEY,String(minutes));}catch(e){}
  if(minutes>0){refreshTimer=setInterval(()=>liveMarket({automatic:true}),minutes*60000);}
  $('refreshDescription').textContent=minutes>0?`Refreshes every ${minutes} minute${minutes===1?'':'s'} while the website is open. Cloudflare may cache upstream data.`:'Automatic refresh is off.';
}
// A quote midpoint is an estimate, NOT a volume-weighted order-book execution price.
// The public market payload only supplies bestBuy, last, and aggregate buyQty.
function outPrice(rec,mode){
  if(!rec)return null;
  const valid=k=>rec[k]!==null&&rec[k]!==undefined&&Number.isFinite(Number(rec[k]))&&Number(rec[k])>0;
  if(mode==='blend'){
    if(valid('bestBuy')&&valid('last'))return (Number(rec.bestBuy)+Number(rec.last))/2;
    if(valid('last'))return Number(rec.last);
    if(valid('bestBuy'))return Number(rec.bestBuy);
    return null;
  }
  const fields=mode==='last'?['last','bestBuy']:mode==='guide'?['guide','last','bestBuy']:['bestBuy','last'];
  for(const key of fields)if(valid(key))return Number(rec[key]);
  return null;
}
// GE selling price takes priority; NPC buy-back only applies when a GE sale quote is unavailable.
// Value-based estimates use legacy general-store formula and account for bulk stock depreciation.
// Automatically generated bulk reference from OSRS Wiki-derived item/shop metadata.
let wikiReferenceItems={};
async function loadWikiReference(){
  try {
    const response=await fetch('wiki_item_prices.json',{cache:'no-cache'});
    if(!response.ok)return;
    const body=await response.json();
    if(body && typeof body.items==='object') wikiReferenceItems=body.items;
  } catch(e) { console.warn('Wiki price reference unavailable; existing fallback remains active',e); }
}
function wikiShopPurchase(name){
  const item=wikiReferenceItems[String(name).toLowerCase()];
  if(!item||!Array.isArray(item.shops)||!Number.isFinite(Number(item.value)))return null;
  const candidates=item.shops.filter(s=>Number.isFinite(Number(s.sell_percent))&&Number(s.base_stock)>0);
  if(!candidates.length)return null;
  const best=candidates.reduce((a,b)=>a.sell_percent<=b.sell_percent?a:b);
  return {price:Math.max(0,Math.floor(Number(item.value)*Number(best.sell_percent)/100)),
          source:`Wiki shop: ${best.shop} (reference stock; confirm RunicWorld)`};
}
function wikiShopSale(name,quantity){
  const item=wikiReferenceItems[String(name).toLowerCase()];
  if(!item||!Number.isFinite(Number(item.value))||Number(item.value)<=0)return null;
  // A normal general store buys at 40% declining 3% per sale to a minimum of 10%.
  // Specialist shops have their own stock curves and are not assumed to yield bulk profit.
  const v=Number(item.value),units=Math.max(1,Math.ceil(Number(quantity)||1));
  let total=0;
  for(let i=0;i<Math.min(units,10);i++)total+=Math.floor(v*Math.max(.1,.4-.03*i));
  total+=Math.max(0,units-10)*Math.floor(v*.1);
  return {price:total/units,source:`Wiki base value general-store model • ${units} sales • unverified RunicWorld`};
}
function npcSellPrice(name,quantity=1){
  const key=String(name).trim().toLowerCase();
  const custom=customSellShops[key];
  if(custom && Number.isFinite(Number(custom.price)) && Number(custom.price)>=0)
    return {price:Number(custom.price),source:`NPC buy-back: ${custom.shop} (entered price, verify stock)`};
  const wiki=wikiShopSale(key,quantity);if(wiki)return wiki;
  const entry=itemValues[key];
  if(!entry||!Number.isFinite(Number(entry.value))||Number(entry.value)<=0)return {price:null,source:'No verified NPC item value'};
  const v=Number(entry.value),units=Math.max(1,Math.ceil(Number(quantity)||1));
  // Normal general store starts at 40% value, losing 3% value per additional item.
  // Simulates sale into an initially empty shop, with a 10% minimum of base value.
  const saleTotal=Array.from({length:Math.min(units,10)},(_,i)=>Math.floor(v*Math.max(.1,.4-.03*i))).reduce((a,b)=>a+b,0);
  const floor=Math.floor(v*.1);
  const total=saleTotal+Math.max(0,units-10)*floor;
  return {price:total/units,source:`General store average over ${units} sales • Wiki-derived item value; verify RunicWorld`};
}
function salePrice(name,quantity,mode){
  const ge=outPrice(marketRecord(name),mode);
  if(ge!==null)return {price:ge,source:mode==='blend'?'RunicWorld GE indicative bid/last midpoint (NOT depth-weighted)': 'RunicWorld GE'};
  return npcSellPrice(name,quantity);
}
function inputPrice(rec){if(!rec)return null;for(let k of ['bestSell','last','guide'])if(rec[k]!==null&&rec[k]!==undefined&&Number.isFinite(Number(rec[k])))return Number(rec[k]);return null;}
// Rune inputs prioritize reference NPC shop prices; produced runes always sell at RunicWorld GE.
// Stock/access are not guaranteed and server pricing can differ from Wiki benchmarks.
function ingredientPrice(name){
  const key=String(name).trim().toLowerCase();
  const shop=customShops[key]||runeShops[key];
  if(shop && Number.isFinite(Number(shop.price)) && Number(shop.price)>=0)
    return {price:Number(shop.price),source:`NPC shop: ${shop.shop}`};
  const wiki=wikiShopPurchase(key);if(wiki)return wiki;
  const ge=inputPrice(marketRecord(key));
  return ge===null ? {price:null,source:'No shop reference or GE price'} : {price:ge,source:'RunicWorld GE'};
}
function rateQuantities(m){let outputs={...(m.outputs||{})},inputs={...(m.inputs||{})},income=numeric(m.flat_income),cost=numeric(m.flat_cost),info='Manual hourly estimates';let profile=m.rate_profile;if(!profile||typeof profile!=='object')return {outputs,inputs,income,cost,info};let skill=String(profile.skill||'');if(skill.toLowerCase()==='runecraft')skill='Runecrafting';const tier=(Array.isArray(profile.rates)?profile.rates:[]).filter(t=>numeric(t.level)<=numeric(skills[skill]||1)).sort((a,b)=>numeric(a.level)-numeric(b.level)).at(-1);if(!tier)return {outputs,inputs,income,cost,info:'No matching Wiki rate tier; manual estimates'};let baseline=numeric(m.base_actions_per_hour??Object.values(outputs)[0]??0),rate=numeric(tier.actions_per_hour);if(baseline<=0||rate<0)return {outputs,inputs,income,cost,info:'Invalid Wiki rate profile; manual estimates'};const factor=rate/baseline;outputs=Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,numeric(v)*factor]));inputs=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,numeric(v)*factor]));return {outputs,inputs,income:income*factor,cost:cost*factor,info:`${rate} actions/hr • ${profile.evidence==='modeled_not_verified'?'PROVISIONAL, NOT VERIFIED':profile.evidence==='wiki_range_midpoint'?'WIKI RANGE MIDPOINT':'WIKI REFERENCE'} • ${skill} ${tier.level} • ${tier.setup||''} • ${profile.source||'source not specified'}`};}
// Public GE API exposes only the aggregate buy quantity, not price-level order depth.
// Coverage is an upper bound on units that might be sold, NOT guaranteed execution.
function liquidityFor(name, quantity){
 const rec=marketRecord(name),q=Math.max(0,Number(quantity)||0);
 if(!rec)return {label:'No GE listing',ratio:null,qty:null,note:'No order-book visibility'};
 const qty=rec.buyQty===null||rec.buyQty===undefined?null:Number(rec.buyQty);
 if(q<=0)return {label:'N/A',ratio:null,qty,note:'No output quantity'};
 if(qty===null||!Number.isFinite(qty))return {label:'Unknown',ratio:null,qty:null,note:'No aggregate buy quantity reported'};
 const ratio=qty/q;
 let label=ratio<0.25?'Very low':ratio<1?'Limited':'Listed depth';
 return {label,ratio,qty,note:`${fmt(qty)} total GE units wanted / ${fmt(q)} units produced per hour. Total bids span multiple prices; execution and demand renewal not guaranteed.`};
}
function saleQuote(name,quantity,mode){
 const quote=salePrice(name,quantity,mode),rec=marketRecord(name),ge=outPrice(rec,mode);
 let detail=quote.source;
 if(ge!==null){
   if(mode==='blend' && rec && Number(rec.bestBuy)>0 && Number(rec.last)>0)detail=`GE midpoint: buyer ${fmt(rec.bestBuy)} / last ${fmt(rec.last)} (not order-book VWAP)`;
   else detail=`GE quote in ${mode} mode`;
 }
 return {...quote,detail,liquidity:ge!==null?liquidityFor(name,quantity):{label:'NPC fallback',ratio:null,qty:null,note:'NPC prices may fall with stock; volume is not guaranteed'}};
}
function detailForMethod(m){
 const {outputs,inputs,income,cost,info}=rateQuantities(m);
 const outputRows=Object.entries(outputs).map(([name,quantity])=>{const v=saleQuote(name,quantity,$('priceMode').value);return {kind:'Output',name,quantity,...v,total:v.price===null?null:v.price*quantity};});
 const inputRows=Object.entries(inputs).map(([name,quantity])=>{const v=ingredientPrice(name);return {kind:'Ingredient',name,quantity,...v,detail:v.source,total:v.price===null?null:v.price*quantity};});
 const flagged=outputRows.filter(r=>r.liquidity.ratio!==null&&r.liquidity.ratio<1);
 const unknown=outputRows.filter(r=>r.liquidity.label==='Unknown'||r.liquidity.label==='No GE listing'||r.liquidity.label==='NPC fallback');
 return {rows:[...outputRows,...inputRows],flagged,unknown,flatIncome:income,flatCost:cost,info};
}
function showPriceBreakdown(methodIndex){
 const m=methods[methodIndex];if(!m)return;
 const d=detailForMethod(m),target=$('priceBreakdown');
 $('breakdownTitle').textContent=`Price breakdown — ${m.name}`;
 const tr=d.rows.map(r=>`<tr><td>${escapeHtml(r.kind)}</td><td>${escapeHtml(r.name)}</td><td class="number">${fmt(r.quantity)}</td><td class="number">${r.price===null?'Missing':Number(r.price).toLocaleString('en-US',{maximumFractionDigits:2})}</td><td class="number">${r.total===null?'Missing':fmt(r.total)}</td><td>${escapeHtml(r.detail||r.source)}</td><td>${escapeHtml(r.kind==='Output'?r.liquidity.label+' — '+r.liquidity.note:'—')}</td></tr>`).join('');
 $('breakdownRows').innerHTML=tr||'<tr><td colspan="7">No item quantities; flat income/cost values may still apply.</td></tr>';
 $('breakdownNote').textContent=`Additional flat income: ${fmt(d.flatIncome)} GP/hr; flat costs: ${fmt(d.flatCost)} GP/hr. ${d.info}. Aggregate buyQty is not order-book price depth; no 900-unit execution price is implied.`;
 target.hidden=false;target.scrollIntoView({behavior:'smooth',block:'start'});
}
function compute(){return methods.map(m=>{let short=Object.entries(m.requirements||{}).filter(([k,v])=>numeric(skills[k]||1)<numeric(v)).map(([k,v])=>`${k} ${v}`);let {outputs,inputs,income,cost,info}=rateQuantities(m),missing=[];for(let [key,q] of Object.entries(outputs)){let sale=salePrice(key,q,$('priceMode').value);if(sale.price===null)missing.push(key);else income+=numeric(q)*sale.price;}for(let [key,q] of Object.entries(inputs)){let value=ingredientPrice(key);if(value.price===null)missing.push(`${key} (cost)`);else cost+=numeric(q)*value.price;}const baseActions=numeric(m.base_actions_per_hour);const effectiveTier=(m.rate_profile?.rates||[]).filter(t=>numeric(t.level)<=numeric(skills[m.rate_profile.skill]||1)).sort((a,b)=>numeric(a.level)-numeric(b.level)).at(-1);const xpRate=numeric(m.xp_per_action)*(effectiveTier&&info.includes('actions/hr')?numeric(effectiveTier.actions_per_hour):baseActions);
return {name:m.name||'Unnamed',category:m.category||'Other',net:income-cost,gross:income,cost,short,missing,info,note:m.note||'',xpRate};});}
function rank(){
 const sort=$('volumeSort')?.value||'profit';
 let results=compute().sort((a,b)=>{
   const incomplete=Number(a.missing.length>0)-Number(b.missing.length>0);if(incomplete)return incomplete;
   if(sort!=='profit'){
     const va=methodTradeVolume(methods.find(m=>m.name===a.name),sort).value;
     const vb=methodTradeVolume(methods.find(m=>m.name===b.name),sort).value;
     if(va===null&&vb!==null)return 1;if(vb===null&&va!==null)return -1;
     if(va!==null&&vb!==null&&va!==vb)return vb-va;
   }
   return b.net-a.net;
 });
 const qualified=results.filter(r=>!r.short.length),best=qualified.find(r=>!r.missing.length);
 $('bestProfit').textContent=best?fmt(best.net):'—';$('eligibleCount').textContent=fmt(qualified.length);
 const q=$('methodSearch').value.trim().toLowerCase(),eligibleOnly=$('eligibleOnly').checked,cat=$('categoryFilter').value;
 const rows=results.filter(r=>(!eligibleOnly||!r.short.length)&&(!cat||r.category===cat)&&r.name.toLowerCase().includes(q));
 $('rankRows').innerHTML=rows.map(r=>{
   const i=methods.findIndex(m=>m.name===r.name);const method=methods[i],outputs=rateQuantities(method).outputs;
   const liquidity=Object.entries(outputs).map(([name,qty])=>liquidityFor(name,qty));
   const low=liquidity.filter(x=>x.ratio!==null&&x.ratio<1),unknown=liquidity.filter(x=>x.ratio===null);
   const hour=methodTradeVolume(method,'hour'),day=methodTradeVolume(method,'day'),week=methodTradeVolume(method,'week');
   const label=low.length?`⚠ ${low.length} low-depth output${low.length===1?'':'s'}`:unknown.length?`Depth unknown (${unknown.length})`:'Listed quantity covers 1h*';
   return `<tr><td>${escapeHtml(r.name)}<div><button type="button" class="secondary breakdown-btn" data-method-index="${i}">Price details</button></div></td><td class="number ${r.missing.length?'warn':'good'}">${r.missing.length?'INCOMPLETE':fmt(r.net)}</td><td class="number">${fmt(r.gross)}</td><td class="number">${fmt(r.cost)}</td><td class="number">${r.xpRate?fmt(r.xpRate):'—'}</td><td class="number" title="Observed minimum, not complete hourly totals">${volumeLabel(hour)}</td><td class="number">${volumeLabel(day)}</td><td class="number" title="Observed minimum, not complete weekly totals">${volumeLabel(week)}</td><td>${escapeHtml(label)}</td><td>${escapeHtml(r.missing.join(', ')||'—')}</td><td>${escapeHtml(r.short.length?'LOCKED: '+r.short.join(', '):r.info)}${r.note?`<div class="footnote">${escapeHtml(r.note)}</div>`:''}</td></tr>`;
 }).join('')||'<tr><td colspan="11">No matching methods.</td></tr>';
 $('rankRows').querySelectorAll('.breakdown-btn').forEach(b=>b.addEventListener('click',()=>showPriceBreakdown(Number(b.dataset.methodIndex))));
}
function renderSkills(){$('skillGrid').innerHTML=defaults.SKILLS.map(k=>`<label>${escapeHtml(k)}<input type="number" min="1" max="99" step="1" data-skill="${escapeHtml(k)}" value="${numeric(skills[k]||1)}"></label>`).join('');$('skillGrid').querySelectorAll('input').forEach(el=>el.addEventListener('change',()=>{skills[el.dataset.skill]=Math.max(1,Math.min(99,Math.trunc(numeric(el.value)||1)));el.value=skills[el.dataset.skill];rank();save();}));}
function renderMarket(){const q=$('itemSearch').value.trim().toLowerCase();$('itemRows').innerHTML=market.filter(x=>x.name.toLowerCase().includes(q)).slice(0,350).map(x=>`<tr><td>${escapeHtml(x.name)}</td>${['bestBuy','bestSell','last','guide','vol24h'].map(key=>`<td class="number">${x[key]===null||x[key]===undefined?'—':fmt(x[key])}</td>`).join('')}<td>${escapeHtml(ingredientPrice(x.name).source)}</td><td class="number">${ingredientPrice(x.name).price===null?'—':fmt(ingredientPrice(x.name).price)}</td></tr>`).join('')||'<tr><td colspan="7">No matching items.</td></tr>';}
function buildPairRows(id,entries,kind){
 const target=$(id);target.innerHTML='';
 Object.entries(entries||{}).forEach(([name,amount])=>addPairRow(id,name,amount,kind));
}
function addPairRow(id,name='',amount='',kind='item'){
 const row=document.createElement('div');row.className='pairrow';
 const values=kind==='skill'?defaults.SKILLS:[...new Set([...market.map(x=>x.name),...methods.flatMap(m=>Object.keys(m.inputs||{}).concat(Object.keys(m.outputs||{})) )])].sort();
 const field=document.createElement(kind==='skill'?'select':'input');
 if(kind==='skill'){values.forEach(v=>{let o=document.createElement('option');o.value=v;o.textContent=v;field.append(o)});field.value=name||values[0];}
 else{field.placeholder='Item name';field.value=name;field.setAttribute('list','marketItemsList');}
 field.className='pairname';field.required=true;
 const qty=document.createElement('input');qty.type='number';qty.step=kind==='skill'?'1':'any';qty.min=kind==='skill'?'1':'0.000001';qty.max=kind==='skill'?'99':'';qty.className='pairamount';qty.placeholder=kind==='skill'?'Level':'Qty/hour';qty.value=amount;qty.required=true;
 const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Remove';remove.addEventListener('click',()=>row.remove());row.append(field,qty,remove);$(id).append(row);
}
function collectPairs(id,kind){let result={};for(const row of $(id).querySelectorAll('.pairrow')){const key=row.querySelector('.pairname').value.trim();const value=Number(row.querySelector('.pairamount').value);if(!key||!Number.isFinite(value)||value<0||(kind==='skill'&&(value<1||value>99||!Number.isInteger(value))))throw Error('Check '+id+' values');if(Object.hasOwn(result,key))throw Error('Duplicate entry: '+key);result[key]=value;}return result;}
function renderMarketDatalist(){let dl=$('marketItemsList');dl.innerHTML='';[...new Set([...market.map(x=>x.name),...methods.flatMap(m=>Object.keys(m.inputs||{}).concat(Object.keys(m.outputs||{})))])].sort().forEach(name=>{let option=document.createElement('option');option.value=name;dl.append(option)});}
function renderAudit(){const results=compute();const unresolved=new Map();let complete=0;for(const r of results){if(!r.missing.length)complete++;else for(const key of r.missing){const item=key.replace(/ \(cost\)$/,'');unresolved.set(item,(unresolved.get(item)||0)+1);}}$('auditSummary').textContent=`${complete} of ${results.length} methods fully priced with current market/shop data. ${unresolved.size} distinct items unresolved.`;$('auditRows').innerHTML=[...unresolved].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`<tr><td>${escapeHtml(name)}</td><td>${count}</td><td>${escapeHtml(marketRecord(name)?'GE item exists, but usable quote missing':'No GE quote or documented shop fallback')}</td></tr>`).join('')||'<tr><td colspan="3">No missing prices.</td></tr>';
}
function renderCustomShops(){$('shopRows').innerHTML=Object.entries(customShops).sort().map(([name,v])=>`<tr><td>${escapeHtml(name)}</td><td>${fmt(v.price)}</td><td>${escapeHtml(v.shop)}</td><td><button type="button" class="secondary" data-shop-delete="${escapeHtml(name)}">Remove</button></td></tr>`).join('');$('shopRows').querySelectorAll('[data-shop-delete]').forEach(b=>b.addEventListener('click',()=>{delete customShops[b.dataset.shopDelete];save();renderCustomShops();rank();renderAudit();}));}
function addShopOverride(e){e.preventDefault();const name=$('shopItem').value.trim(),price=Number($('shopPrice').value),shop=$('shopName').value.trim();if(!name||!shop||!Number.isFinite(price)||price<0){status('Enter a valid item, shop name and nonnegative price.',true);return;}customShops[name.toLowerCase()]={price,shop};save();renderCustomShops();rank();renderAudit();status(`Shop price saved for ${name}. Local to this browser.`);$('shopForm').reset();}
function renderCustomSellShops(){
  $('sellShopRows').innerHTML=Object.entries(customSellShops).sort().map(([name,v])=>`<tr><td>${escapeHtml(name)}</td><td>${fmt(v.price)}</td><td>${escapeHtml(v.shop)}</td><td><button type="button" class="secondary" data-sell-delete="${escapeHtml(name)}">Remove</button></td></tr>`).join('');
  $('sellShopRows').querySelectorAll('[data-sell-delete]').forEach(b=>b.addEventListener('click',()=>{delete customSellShops[b.dataset.sellDelete];save();renderCustomSellShops();rank();renderAudit();}));
}
function addSellOverride(e){
 e.preventDefault();const name=$('sellShopItem').value.trim(),price=Number($('sellShopPrice').value),shop=$('sellShopName').value.trim();
 if(!name||!shop||!Number.isFinite(price)||price<0){status('Enter an item name, NPC shop and valid sell-to-shop price.',true);return;}
 customSellShops[name.toLowerCase()]={price,shop};save();renderCustomSellShops();rank();renderAudit();status(`NPC sell fallback saved for ${name}. GE quotes still take priority.`);$('sellShopForm').reset();
}
function renderMethodSelect(){let current=activeMethod;$('methodSelect').innerHTML=methods.map((m,i)=>`<option value="${i}">${escapeHtml(m.name)}</option>`).join('');activeMethod=Math.min(current,methods.length-1);$('methodSelect').selectedIndex=activeMethod;showMethod();}
function showMethod(){
  const m=methods[activeMethod];if(!m)return;
  // Editor is optional during startup. Old/mixed GitHub Pages HTML must not break the whole dashboard.
  for(const [id,key] of [['editName','name'],['editCategory','category'],['editNote','note']]){
    const field=$(id);if(field)field.value=m[key]??'';
  }
  for(const [id,key] of [['editIncome','flat_income'],['editCost','flat_cost'],['editXP','xp_per_action'],['editActions','base_actions_per_hour']]){
    const field=$(id);if(field)field.value=m[key]??0;
  }
  for(const [id,key,kind] of [['requirementsRows','requirements','skill'],['outputsRows','outputs','item'],['inputsRows','inputs','item']]){
    if($(id))buildPairRows(id,m[key],kind);
  }
}
function editMethod(e){e.preventDefault();try{const old=methods[activeMethod]||{},name=$('editName').value.trim();if(!name)throw Error('Method name required');methods[activeMethod]={...old,name,category:$('editCategory').value.trim(),note:$('editNote').value,requirements:collectPairs('requirementsRows','skill'),outputs:collectPairs('outputsRows','item'),inputs:collectPairs('inputsRows','item'),flat_income:numeric($('editIncome').value),flat_cost:numeric($('editCost').value),xp_per_action:numeric($('editXP').value),base_actions_per_hour:numeric($('editActions').value),rate_profile:old.rate_profile||null};save();renderMethodSelect();rank();renderAudit();status(`Saved method: ${name}`);}catch(err){status('Cannot save method: '+err.message,true);}}
function csvExport(){const header=['method','net_gp_hour','gross_gp_hour','cost_gp_hour','missing_prices','missing_skills','rate_info','liquidity_note','assumptions'],quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';let lines=[header, ...compute().sort((a,b)=>b.net-a.net).map(r=>[r.name,Math.round(r.net),Math.round(r.gross),Math.round(r.cost),r.missing.join(';'),r.short.join(';'),r.info, r.missing.length?'Missing prices':Object.entries(rateQuantities(methods.find(m=>m.name===r.name)).outputs).map(([name,qty])=>name+': '+liquidityFor(name,qty).label).join('; '),r.note])];const blob=new Blob([lines.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='runicworld_profit_ranking.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importFile(e){let f=e.target.files?.[0];if(!f)return;try{let blob=JSON.parse(await f.text());if(Array.isArray(blob.items))applyMarket(blob,`uploaded ${f.name}`);else if(Array.isArray(blob.players)){let name=$('playerName').value.trim();if(!name)throw Error('Enter a player name before importing hiscores JSON.');applyPlayer(importHiscores(blob,name));}else throw Error('Unrecognized JSON: expected items or players array.');}catch(err){status(`Import failed: ${err.message}`,true);}finally{e.target.value='';}}
async function init(){defaults=await fetchJson('data.json');const reference=await fetchJson('rune_shop_prices.json');const values=await fetchJson('npc_sell_values.json');itemValues=values.items||{};await loadWikiReference();runeShops=Object.fromEntries(Object.entries(reference.runes||{}).map(([name,entry])=>[name.toLowerCase(),entry]));let stored={};try{stored=JSON.parse(localStorage.getItem('rw_profit_web_v5')||'{}');}catch{}skills=Object.fromEntries(defaults.SKILLS.map(s=>[s,Math.max(1,Math.min(99,numeric(stored.skills?.[s]??defaults.DEFAULT_SKILLS[s]??1)))]));// Merge new catalogue entries without losing users' edited methods.
const storedMethods=Array.isArray(stored.methods)?stored.methods:[];
const byName=new Map(storedMethods.filter(m=>m&&m.name).map(m=>[String(m.name).toLowerCase(),m]));
methods=defaults.METHODS.map(m=>{const stored=byName.get(String(m.name).toLowerCase());return stored ? {...stored,rate_profile:(m.rate_profile && (!stored.rate_profile || ['wiki_reference','wiki_range_midpoint','modeled_not_verified'].includes(stored.rate_profile?.evidence))) ? m.rate_profile : (stored.rate_profile||null),rate_evidence:m.rate_evidence} : structuredClone(m);});
const defaultNames=new Set(defaults.METHODS.map(m=>String(m.name).toLowerCase()));
methods.push(...storedMethods.filter(m=>m&&m.name&&!defaultNames.has(String(m.name).toLowerCase())));customShops=stored.customShops&&typeof stored.customShops==='object'?stored.customShops:{};customSellShops=stored.customSellShops&&typeof stored.customSellShops==='object'?stored.customSellShops:{};profileName=stored.profileName||'';if($('playerName'))$('playerName').value=profileName;if($('priceMode'))$('priceMode').value=(stored.priceMode&&stored.priceMode!=='buy')?stored.priceMode:'blend';renderSkills();renderMethodSelect();renderCustomShops();renderCustomSellShops();$('shopForm').addEventListener('submit',addShopOverride);$('sellShopForm').addEventListener('submit',addSellOverride);for(const [btn,target,kind] of [['addRequirementRow','requirementsRows','skill'],['addOutputRow','outputsRows','item'],['addInputRow','inputsRows','item']])$(btn).addEventListener('click',()=>addPairRow(target,'','',kind));$('categoryFilter').innerHTML='<option value="">All categories</option>'+[...new Set(methods.map(m=>m.category||'Other'))].sort().map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');$('loadPlayer').addEventListener('click',fetchPlayer);$('playerName').addEventListener('keydown',e=>{if(e.key==='Enter')fetchPlayer();});$('refreshMarket').addEventListener('click',()=>liveMarket());$('refreshInterval').addEventListener('change',setRefreshSchedule);$('loadSample').addEventListener('click',snapshot);$('fileUpload').addEventListener('change',importFile);$('methodSearch').addEventListener('input',rank);$('categoryFilter').addEventListener('change',rank);$('volumeSort').addEventListener('change',()=>{try{localStorage.setItem(VOLUME_SORT_KEY,$('volumeSort').value)}catch(e){}rank();});$('eligibleOnly').addEventListener('change',rank);$('priceMode').addEventListener('change',()=>{rank();save();});$('itemSearch').addEventListener('input',renderMarket);$('exportCsv').addEventListener('click',csvExport);$('resetSkills').addEventListener('click',()=>{skills=Object.fromEntries(defaults.SKILLS.map(s=>[s,1]));renderSkills();rank();save();});$('methodSelect').addEventListener('change',e=>{activeMethod=Number(e.target.value);showMethod();});$('methodForm').addEventListener('submit',editMethod);$('addMethod').addEventListener('click',()=>{methods.push({name:'New method',category:'Other',requirements:{},outputs:{},inputs:{},flat_income:0,flat_cost:0,note:''});activeMethod=methods.length-1;renderMethodSelect();save();rank();});$('removeMethod').addEventListener('click',()=>{if(methods.length<=1)return;methods.splice(activeMethod,1);activeMethod=0;renderMethodSelect();save();rank();});$('resetMethods').addEventListener('click',()=>{if(confirm('Restore original methods? This overwrites local method edits.')){methods=structuredClone(defaults.METHODS);activeMethod=0;renderMethodSelect();rank();save();}});document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===button));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===button.dataset.tab));}));let savedInterval='5';try{savedInterval=localStorage.getItem(REFRESH_KEY)??'5';}catch(e){}if($('refreshInterval')){$('refreshInterval').value=['0','1','5','10','15','30','60'].includes(savedInterval)?savedInterval:'5';setRefreshSchedule();}readObservedTrades();try{$('volumeSort').value=localStorage.getItem(VOLUME_SORT_KEY)||'profit';}catch(e){}renderTradeCoverage();const hadCache=loadCachedMarket();if(!hadCache)await snapshot();await liveMarket();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lastSuccessfulLive&&Number($('refreshInterval').value)>0&&Date.now()-lastSuccessfulLive>=Number($('refreshInterval').value)*60000)liveMarket({automatic:true});});renderAudit();}
init().catch(e=>{console.error('RunicWorld initialization failure',e);status(`App could not start: ${e.message}. Ensure all v6.3.1 files were uploaded together and hard-refresh.`,true);});
