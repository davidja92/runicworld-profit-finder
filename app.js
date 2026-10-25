'use strict';
// Optional public-data proxy. Leave proxyBase blank to fetch directly.
const proxyBase = String(window.RUNICWORLD_CONFIG?.proxyBase || '').trim().replace(/\/+$/, '');
const API_MARKET=proxyBase ? `${proxyBase}/ge/market` : 'https://runicworld.com/api/site/ge/market';
const API_HISCORES=proxyBase ? `${proxyBase}/hiscores` : 'https://runicworld.com/api/site/hiscores';
const $=id=>document.getElementById(id), numeric=x=>Number.isFinite(Number(x))?Number(x):0;
const fmt=x=>Number(x).toLocaleString('en-US',{maximumFractionDigits:0});
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let defaults={},skills={},methods=[],market=[],marketMap=new Map(),activeMethod=0,profileName='',runeShops={},customShops={};
let refreshTimer=null,marketFetchPending=false,lastSuccessfulLive=0,marketSource='none';
const MARKET_CACHE_KEY='rw_profit_live_market_v63', REFRESH_KEY='rw_profit_auto_refresh_minutes';
const ITEM_ALIASES={'adamant bar':'adamantite bar','rune bar':'runite bar','runite ore':'runite ore','adamant ore':'adamantite ore','runecrafting essence':'rune essence'};
function marketRecord(name){const key=String(name).trim().toLowerCase();return marketMap.get(key)||marketMap.get(ITEM_ALIASES[key]||'');}
const save=()=>{try{localStorage.setItem('rw_profit_web_v5',JSON.stringify({skills,methods,profileName,customShops,priceMode:$('priceMode').value}));}catch{}};
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
function outPrice(rec,mode){if(!rec)return null;let fields=mode==='last'?['last','bestBuy']:mode==='guide'?['guide','last','bestBuy']:['bestBuy','last'];for(let k of fields)if(rec[k]!==null&&rec[k]!==undefined&&Number.isFinite(Number(rec[k])))return Number(rec[k]);return null;}
function inputPrice(rec){if(!rec)return null;for(let k of ['bestSell','last','guide'])if(rec[k]!==null&&rec[k]!==undefined&&Number.isFinite(Number(rec[k])))return Number(rec[k]);return null;}
// Rune inputs prioritize reference NPC shop prices; produced runes always sell at RunicWorld GE.
// Stock/access are not guaranteed and server pricing can differ from Wiki benchmarks.
function ingredientPrice(name){
  const key=String(name).trim().toLowerCase();
  const shop=customShops[key]||runeShops[key];
  if(shop && Number.isFinite(Number(shop.price)) && Number(shop.price)>=0)
    return {price:Number(shop.price),source:`NPC shop: ${shop.shop}`};
  const ge=inputPrice(marketRecord(key));
  return ge===null ? {price:null,source:'No shop reference or GE price'} : {price:ge,source:'RunicWorld GE'};
}
function rateQuantities(m){let outputs={...(m.outputs||{})},inputs={...(m.inputs||{})},income=numeric(m.flat_income),cost=numeric(m.flat_cost),info='Manual hourly estimates';let profile=m.rate_profile;if(!profile||typeof profile!=='object')return {outputs,inputs,income,cost,info};let skill=String(profile.skill||'');if(skill.toLowerCase()==='runecraft')skill='Runecrafting';const tier=(Array.isArray(profile.rates)?profile.rates:[]).filter(t=>numeric(t.level)<=numeric(skills[skill]||1)).sort((a,b)=>numeric(a.level)-numeric(b.level)).at(-1);if(!tier)return {outputs,inputs,income,cost,info:'No matching Wiki rate tier; manual estimates'};let baseline=numeric(m.base_actions_per_hour??Object.values(outputs)[0]??0),rate=numeric(tier.actions_per_hour);if(baseline<=0||rate<0)return {outputs,inputs,income,cost,info:'Invalid Wiki rate profile; manual estimates'};const factor=rate/baseline;outputs=Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,numeric(v)*factor]));inputs=Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,numeric(v)*factor]));return {outputs,inputs,income:income*factor,cost:cost*factor,info:`${rate} actions/hr • ${skill} ${tier.level} • ${tier.setup||''} • ${profile.source||'source not specified'}`};}
function compute(){return methods.map(m=>{let short=Object.entries(m.requirements||{}).filter(([k,v])=>numeric(skills[k]||1)<numeric(v)).map(([k,v])=>`${k} ${v}`);let {outputs,inputs,income,cost,info}=rateQuantities(m),missing=[];for(let [key,q] of Object.entries(outputs)){let price=outPrice(marketRecord(key),$('priceMode').value);if(price===null)missing.push(key);else income+=numeric(q)*price;}for(let [key,q] of Object.entries(inputs)){let value=ingredientPrice(key);if(value.price===null)missing.push(`${key} (cost)`);else cost+=numeric(q)*value.price;}const xpRate=numeric(m.xp_per_action)*numeric(m.base_actions_per_hour)*(m.rate_profile&&info.startsWith('No matching')?1:1);
return {name:m.name||'Unnamed',category:m.category||'Other',net:income-cost,gross:income,cost,short,missing,info,note:m.note||'',xpRate};});}
function rank(){let results=compute().sort((a,b)=>Number(a.missing.length>0)-Number(b.missing.length>0)||b.net-a.net);const qualified=results.filter(r=>!r.short.length),best=qualified.find(r=>!r.missing.length);$('bestProfit').textContent=best?fmt(best.net):'—';$('eligibleCount').textContent=fmt(qualified.length);let q=$('methodSearch').value.trim().toLowerCase(),eligibleOnly=$('eligibleOnly').checked,cat=$('categoryFilter').value;let rows=results.filter(r=>(!eligibleOnly||!r.short.length)&&(!cat||r.category===cat)&&r.name.toLowerCase().includes(q));$('rankRows').innerHTML=rows.map(r=>`<tr><td>${escapeHtml(r.name)}</td><td class="number ${r.missing.length?'warn':'good'}">${r.missing.length?'INCOMPLETE':fmt(r.net)}</td><td class="number">${fmt(r.gross)}</td><td class="number">${fmt(r.cost)}</td><td class="number">${r.xpRate?fmt(r.xpRate):'—'}</td><td>${escapeHtml(r.missing.join(', ')||'—')}</td><td>${escapeHtml(r.short.length?'LOCKED: '+r.short.join(', '):r.info)}${r.note?`<div class="footnote">${escapeHtml(r.note)}</div>`:''}</td></tr>`).join('')||'<tr><td colspan="7">No matching methods.</td></tr>';}
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
function renderAudit(){const results=compute();const unresolved=new Map();let complete=0;for(const r of results){if(!r.missing.length)complete++;else for(const key of r.missing){const item=key.replace(/ \(cost\)$/,'');unresolved.set(item,(unresolved.get(item)||0)+1);}}$('auditSummary').textContent=`${complete} of ${results.length} methods fully priced with current market/shop data. ${unresolved.size} distinct items unresolved.`;$('auditRows').innerHTML=[...unresolved].sort((a,b)=>b[1]-a[1]).map(([name,count])=>`<tr><td>${escapeHtml(name)}</td><td>${count}</td><td>${escapeHtml(marketRecord(name)?'GE item exists, but usable quote missing':'Not in loaded GE market')}</td></tr>`).join('')||'<tr><td colspan="3">No missing prices.</td></tr>';
}
function renderCustomShops(){$('shopRows').innerHTML=Object.entries(customShops).sort().map(([name,v])=>`<tr><td>${escapeHtml(name)}</td><td>${fmt(v.price)}</td><td>${escapeHtml(v.shop)}</td><td><button type="button" class="secondary" data-shop-delete="${escapeHtml(name)}">Remove</button></td></tr>`).join('');$('shopRows').querySelectorAll('[data-shop-delete]').forEach(b=>b.addEventListener('click',()=>{delete customShops[b.dataset.shopDelete];save();renderCustomShops();rank();renderAudit();}));}
function addShopOverride(e){e.preventDefault();const name=$('shopItem').value.trim(),price=Number($('shopPrice').value),shop=$('shopName').value.trim();if(!name||!shop||!Number.isFinite(price)||price<0){status('Enter a valid item, shop name and nonnegative price.',true);return;}customShops[name.toLowerCase()]={price,shop};save();renderCustomShops();rank();renderAudit();status(`Shop price saved for ${name}. Local to this browser.`);$('shopForm').reset();}
function renderMethodSelect(){let current=activeMethod;$('methodSelect').innerHTML=methods.map((m,i)=>`<option value="${i}">${escapeHtml(m.name)}</option>`).join('');activeMethod=Math.min(current,methods.length-1);$('methodSelect').selectedIndex=activeMethod;showMethod();}
function showMethod(){let m=methods[activeMethod];if(!m)return;for(let [id,key] of [['editName','name'],['editCategory','category'],['editNote','note']])$(id).value=m[key]??'';buildPairRows('requirementsRows',m.requirements,'skill');buildPairRows('outputsRows',m.outputs,'item');buildPairRows('inputsRows',m.inputs,'item');$('editIncome').value=m.flat_income||0;$('editCost').value=m.flat_cost||0;$('editXP').value=m.xp_per_action||0;$('editActions').value=m.base_actions_per_hour||0;}
function editMethod(e){e.preventDefault();try{const old=methods[activeMethod]||{},name=$('editName').value.trim();if(!name)throw Error('Method name required');methods[activeMethod]={...old,name,category:$('editCategory').value.trim(),note:$('editNote').value,requirements:collectPairs('requirementsRows','skill'),outputs:collectPairs('outputsRows','item'),inputs:collectPairs('inputsRows','item'),flat_income:numeric($('editIncome').value),flat_cost:numeric($('editCost').value),xp_per_action:numeric($('editXP').value),base_actions_per_hour:numeric($('editActions').value)};save();renderMethodSelect();rank();renderAudit();status(`Saved method: ${name}`);}catch(err){status('Cannot save method: '+err.message,true);}}
function csvExport(){const header=['method','net_gp_hour','gross_gp_hour','cost_gp_hour','missing_prices','missing_skills','rate_info','assumptions'],quote=x=>'"'+String(x??'').replaceAll('"','""')+'"';let lines=[header, ...compute().sort((a,b)=>b.net-a.net).map(r=>[r.name,Math.round(r.net),Math.round(r.gross),Math.round(r.cost),r.missing.join(';'),r.short.join(';'),r.info,r.note])];const blob=new Blob([lines.map(r=>r.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='runicworld_profit_ranking.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importFile(e){let f=e.target.files?.[0];if(!f)return;try{let blob=JSON.parse(await f.text());if(Array.isArray(blob.items))applyMarket(blob,`uploaded ${f.name}`);else if(Array.isArray(blob.players)){let name=$('playerName').value.trim();if(!name)throw Error('Enter a player name before importing hiscores JSON.');applyPlayer(importHiscores(blob,name));}else throw Error('Unrecognized JSON: expected items or players array.');}catch(err){status(`Import failed: ${err.message}`,true);}finally{e.target.value='';}}
async function init(){defaults=await fetchJson('data.json');const reference=await fetchJson('rune_shop_prices.json');runeShops=Object.fromEntries(Object.entries(reference.runes||{}).map(([name,entry])=>[name.toLowerCase(),entry]));let stored={};try{stored=JSON.parse(localStorage.getItem('rw_profit_web_v5')||'{}');}catch{}skills=Object.fromEntries(defaults.SKILLS.map(s=>[s,Math.max(1,Math.min(99,numeric(stored.skills?.[s]??defaults.DEFAULT_SKILLS[s]??1)))]));// Merge new catalogue entries without losing users' edited methods.
const storedMethods=Array.isArray(stored.methods)?stored.methods:[];
const byName=new Map(storedMethods.filter(m=>m&&m.name).map(m=>[String(m.name).toLowerCase(),m]));
methods=defaults.METHODS.map(m=>byName.get(String(m.name).toLowerCase())||structuredClone(m));
const defaultNames=new Set(defaults.METHODS.map(m=>String(m.name).toLowerCase()));
methods.push(...storedMethods.filter(m=>m&&m.name&&!defaultNames.has(String(m.name).toLowerCase())));customShops=stored.customShops&&typeof stored.customShops==='object'?stored.customShops:{};profileName=stored.profileName||'';$('playerName').value=profileName;$('priceMode').value=stored.priceMode||'buy';renderSkills();renderMethodSelect();renderCustomShops();$('shopForm').addEventListener('submit',addShopOverride);for(const [btn,target,kind] of [['addRequirementRow','requirementsRows','skill'],['addOutputRow','outputsRows','item'],['addInputRow','inputsRows','item']])$(btn).addEventListener('click',()=>addPairRow(target,'','',kind));$('categoryFilter').innerHTML='<option value="">All categories</option>'+[...new Set(methods.map(m=>m.category||'Other'))].sort().map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');$('loadPlayer').addEventListener('click',fetchPlayer);$('playerName').addEventListener('keydown',e=>{if(e.key==='Enter')fetchPlayer();});$('refreshMarket').addEventListener('click',()=>liveMarket());$('refreshInterval').addEventListener('change',setRefreshSchedule);$('loadSample').addEventListener('click',snapshot);$('fileUpload').addEventListener('change',importFile);$('methodSearch').addEventListener('input',rank);$('categoryFilter').addEventListener('change',rank);$('eligibleOnly').addEventListener('change',rank);$('priceMode').addEventListener('change',()=>{rank();save();});$('itemSearch').addEventListener('input',renderMarket);$('exportCsv').addEventListener('click',csvExport);$('resetSkills').addEventListener('click',()=>{skills=Object.fromEntries(defaults.SKILLS.map(s=>[s,1]));renderSkills();rank();save();});$('methodSelect').addEventListener('change',e=>{activeMethod=Number(e.target.value);showMethod();});$('methodForm').addEventListener('submit',editMethod);$('addMethod').addEventListener('click',()=>{methods.push({name:'New method',category:'Other',requirements:{},outputs:{},inputs:{},flat_income:0,flat_cost:0,note:''});activeMethod=methods.length-1;renderMethodSelect();save();rank();});$('removeMethod').addEventListener('click',()=>{if(methods.length<=1)return;methods.splice(activeMethod,1);activeMethod=0;renderMethodSelect();save();rank();});$('resetMethods').addEventListener('click',()=>{if(confirm('Restore original methods? This overwrites local method edits.')){methods=structuredClone(defaults.METHODS);activeMethod=0;renderMethodSelect();rank();save();}});document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===button));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===button.dataset.tab));}));let savedInterval='5';try{savedInterval=localStorage.getItem(REFRESH_KEY)??'5';}catch(e){}$('refreshInterval').value=['0','1','5','10','15','30','60'].includes(savedInterval)?savedInterval:'5';setRefreshSchedule();const hadCache=loadCachedMarket();if(!hadCache)await snapshot();await liveMarket();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&lastSuccessfulLive&&Number($('refreshInterval').value)>0&&Date.now()-lastSuccessfulLive>=Number($('refreshInterval').value)*60000)liveMarket({automatic:true});});renderAudit();}
init().catch(e=>status(`App could not start: ${e.message}. Publish with GitHub Pages or run from a local HTTP server.`,true));
