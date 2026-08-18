import { URL } from "node:url";
import React from "react";
import { ImageResponse } from "@vercel/og";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SEATGEEK_CLIENT_ID,
  SEATGEEK_CLIENT_SECRET,
  BRINKBERRY_ADMIN_SECRET,
  BRINKBERRY_ORIGIN = "https://brinkberry.vercel.app",
} = process.env;

function send(res,status,body,type="application/json; charset=utf-8"){
  res.statusCode=status;
  res.setHeader("content-type",type);
  res.setHeader("access-control-allow-origin","*");
  if(type.startsWith("application/json")) res.end(JSON.stringify(body));
  else res.end(body);
}
function enc(v){return encodeURIComponent(v)}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function requireSb(){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration missing");
}
async function sb(path,opts={}){
  requireSb();
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    ...opts,
    headers:{
      apikey:SUPABASE_SERVICE_ROLE_KEY,
      authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type":"application/json",
      prefer:opts.prefer||"return=representation",
      ...(opts.headers||{})
    }
  });
  const t=await r.text(); let d=null;
  if(t){try{d=JSON.parse(t)}catch{d=t}}
  if(!r.ok) throw new Error(`Supabase ${r.status}: ${typeof d==="string"?d:JSON.stringify(d)}`);
  return d;
}
async function rpc(name,args){return sb(`rpc/${name}`,{method:"POST",body:JSON.stringify(args)})}

function denverBounds(windowName){
  const now=new Date();
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Denver",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const localDate=`${p.year}-${p.month}-${p.day}`;
  const localHour=Number(p.hour);
  function zonedIso(dateStr,h,m=0){
    const guess=new Date(`${dateStr}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00Z`);
    const zparts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Denver",timeZoneName:"longOffset",hour:"2-digit"}).formatToParts(guess);
    const off=(zparts.find(x=>x.type==="timeZoneName")?.value||"GMT-06:00").replace("GMT","");
    return new Date(`${dateStr}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00${off}`);
  }
  const addDays=(dateStr,n)=>{
    const d=new Date(dateStr+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10)
  };
  if(windowName==="now") return [now,new Date(now.getTime()+4*3600e3)];
  if(windowName==="tomorrow"){
    const d=addDays(localDate,1); return [zonedIso(d,0),zonedIso(addDays(d,1),0)];
  }
  if(windowName==="weekend"){
    const wd=new Intl.DateTimeFormat("en-US",{timeZone:"America/Denver",weekday:"short"}).format(now);
    const map={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}; const day=map[wd];
    const delta=day===0?-2:day===6?-1:5-day;
    const fri=addDays(localDate,delta); return [zonedIso(fri,15),zonedIso(addDays(fri,3),2)];
  }
  let d=localDate;
  const start=zonedIso(d,17), end=zonedIso(addDays(d,1),2);
  if(localHour<2){ d=addDays(localDate,-1); return [zonedIso(d,17),zonedIso(localDate,2)]}
  return [start,end];
}
async function feed(lat,lng,windowName="tonight",mode=""){
  const [start,end]=denverBounds(windowName);
  const rows=await rpc("bb_get_feed_events",{
    p_user_lat:lat,p_user_lng:lng,p_radius_miles:25,
    p_window_start:start.toISOString(),p_window_end:end.toISOString(),p_mode:mode||null
  });
  return (rows||[]).map(e=>{
    const mins=Math.round((new Date(e.start_time)-Date.now())/60000);
    const why=[
      mins>=0&&mins<240?`Starts in ${mins} min`:null,
      e.price_status==="free"?"Free":null,
      e.distance_miles==null?null:`${Number(e.distance_miles).toFixed(1)} mi`
    ].filter(Boolean).slice(0,3);
    return {
      id:e.id,title:e.title,start:e.start_time,end:e.end_time,venue:e.venue_name,city:e.city,
      neighborhood:e.neighborhood||null,category:e.category_tags?.[0]||"other",
      priceStatus:e.price_status,priceLow:e.price_min,priceHigh:e.price_max,
      priceDisplay:e.price_status==="free"?"Free":(e.price_display||"Details →"),
      desc:e.description||"",ticketUrl:e.canonical_url,image:e.canonical_image_url,
      distanceMiles:e.distance_miles==null?null:Number(e.distance_miles),
      shareUrl:`${BRINKBERRY_ORIGIN}/event/${e.id}`,whyThis:why
    };
  });
}
async function getCanonical(id){
  const rows=await sb(`canonical_events?id=eq.${enc(id)}&deleted_at=is.null&select=*`);
  const e=rows?.[0]; if(!e) return null;
  const vs=await sb(`venues?id=eq.${e.venue_id}&select=id,display_name,city,state,neighborhood`);
  return {...e,venue:vs?.[0]||null};
}

const APP_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brinkberry — What’s Happening Near You Right Now?</title>
<style>
body{margin:0;background:#080610;color:#f4eff8;font:15px system-ui}.app{max-width:980px;margin:auto;padding:18px}header,.actions,.filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}header{justify-content:space-between}.brand{font-size:26px;font-weight:900}.brand b{color:#ff2e63}.hero{padding:28px 0}.hero h1{font-size:clamp(32px,7vw,54px);line-height:1;margin:0 0 10px}.dim{color:#90869e}button,a.btn{border:1px solid #2a2437;background:#110e19;color:#fff;padding:9px 13px;border-radius:999px;text-decoration:none;cursor:pointer}.primary{background:#ffb86b;color:#201000;border:0;font-weight:800}.status,.manage{margin:14px 0;padding:10px 12px;border:1px solid #2a2437;border-radius:12px}.status.ok{color:#52d68e}.filters button.on{background:#ff2e63}.bucket{margin:25px 0}.bucket h3{font-size:12px;text-transform:uppercase;letter-spacing:.15em;color:#90869e}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}.card{background:#171321;border:1px solid #2a2437;border-radius:18px;overflow:hidden;cursor:pointer}.img{height:135px;background:linear-gradient(135deg,#2a1535,#5a1e3a);background-size:cover;background-position:center}.body{padding:14px}.title{font-weight:800;font-size:18px}.meta{color:#90869e;margin-top:6px}.why{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.why span{font-size:12px;border:1px solid #332c43;padding:4px 7px;border-radius:999px}.minebuttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.empty{text-align:center;color:#90869e;padding:50px 10px}dialog{border:1px solid #2a2437;background:#110e19;color:#fff;border-radius:20px;width:min(560px,94vw);padding:20px}dialog::backdrop{background:#05030acc}.field{margin:10px 0}.field label{display:block;color:#90869e;font-size:12px;margin-bottom:5px}.field input,.field textarea,.field select{width:100%;box-sizing:border-box;background:#1a1624;border:1px solid #2a2437;color:#fff;padding:10px;border-radius:10px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.windowbar{margin:8px 0 4px}.windowbar button{font-weight:800}.locprompt{display:flex;gap:8px;align-items:center;flex-wrap:wrap}@media(max-width:600px){.row{grid-template-columns:1fr}}
</style></head><body><div class="app">
<header><div class="brand"><b>●</b> Brinkberry</div><button id="loc">Use my location</button></header>
<section class="hero"><h1>What’s happening near you right now?</h1><p class="dim">Real things. Nearby. Pick a time, find a reason, go.</p></section>
<div class="actions"><button class="primary" id="post">+ List an event</button><button id="exit" style="display:none">Exit dashboard</button></div>
<div id="manage" class="manage" style="display:none"><b>Your private event dashboard</b><div class="dim">Bookmark this URL. Anyone with the link can manage these listings.</div></div>
<div id="status" class="status"><div class="locprompt">Choose your location to begin. <button id="denver">Use Denver</button></div></div>
<div id="windows" class="filters windowbar"></div><div id="filters" class="filters"></div>
<main id="feed"><div class="empty">Use your location or choose Denver.</div></main></div>
<dialog id="dlg"><form id="form"><h2 id="formTitle">List an event</h2><input type="hidden" id="edit"><div class="field"><label>Event title</label><input id="title" required></div><div class="row"><div class="field"><label>Start</label><input id="start" type="datetime-local" required></div><div class="field"><label>End</label><input id="end" type="datetime-local"></div></div><div class="field"><label>Venue</label><input id="venue" required></div><div class="row"><div class="field"><label>City</label><input id="city"></div><div class="field"><label>Category</label><select id="cat"><option>music</option><option>sports</option><option>comedy</option><option>arts</option><option>food</option><option>other</option></select></div></div><div class="row"><div class="field"><label>Price</label><input id="price" placeholder="Free / $15 / leave blank if unknown"></div><div class="field"><label>Your email</label><input id="email" type="email"></div></div><div class="field"><label>Event / ticket link</label><input id="link" type="url" required placeholder="https://..."></div><div class="field"><label>Description</label><textarea id="desc" rows="4"></textarea></div><div class="actions"><button class="primary" type="submit">Save event</button><button type="button" id="cancel">Cancel</button></div></form></dialog>
<dialog id="detail"><div id="detailBody"></div><div class="actions"><button id="closeDetail">Close</button></div></dialog>
<script>
const S={lat:null,lon:null,city:null,events:[],mine:[],token:new URLSearchParams(location.search).get('mine'),cat:'all',window:'tonight'},
$=x=>document.getElementById(x),esc=s=>String(s??'').replace(/[&<>\\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;',"'":'&#039;'}[c])),
fmt=x=>new Date(x).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),
local=x=>{const d=new Date(x);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
function status(t,ok=true){$('status').textContent=t;$('status').className='status '+(ok?'ok':'')}
function windows(){let w=[['now','Now'],['tonight','Tonight'],['tomorrow','Tomorrow'],['weekend','Weekend']];$('windows').innerHTML=w.map(([x,l])=>`<button class="${S.window===x?'on':''}" onclick="S.window='${x}';load()">${l}</button>`).join('')}
function filters(){let c=['all','music','sports','comedy','arts','food','other'];$('filters').innerHTML=c.map(x=>`<button class="${S.cat===x?'on':''}" onclick="S.cat='${x}';render()">${x}</button>`).join('')}
function card(e,m=false){return `<article class="card" onclick="openEvent('${e.id}')"><div class="img" style="${e.image?`background-image:url('${encodeURI(e.image)}')`:''}"></div><div class="body"><div class="dim">${esc(e.category||'other')}${e.neighborhood?' · '+esc(e.neighborhood):''}</div><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.venue)}${e.city?', '+esc(e.city):''}</div><div class="meta">${esc(fmt(e.start))}${e.distanceMiles!=null?' · '+esc(e.distanceMiles.toFixed(1))+' mi':''}</div><div><b>${esc(e.priceDisplay||'Details →')}</b></div>${e.whyThis?.length?`<div class="why">${e.whyThis.map(x=>'<span>'+esc(x)+'</span>').join('')}</div>`:''}${m?`<div class="minebuttons"><button onclick="event.stopPropagation();editEvent('${e.id}')">Edit</button><button onclick="event.stopPropagation();dup('${e.id}')">Duplicate +7d</button><button onclick="event.stopPropagation();del('${e.id}')">Unpublish</button></div>`:''}</div></article>`}
function render(){windows();filters();if(S.token){$('windows').style.display='none';$('filters').style.display='none';$('exit').style.display='inline-block';$('manage').style.display='block';$('feed').innerHTML=S.mine.length?`<div class="grid">${S.mine.map(e=>card(e,true)).join('')}</div>`:'<div class="empty">No events yet.</div>';return}$('windows').style.display='flex';$('filters').style.display='flex';let p=S.cat==='all'?S.events:S.events.filter(e=>e.category===S.cat);$('feed').innerHTML=p.length?`<div class="bucket"><h3>${esc(S.window)}</h3><div class="grid">${p.map(e=>card(e)).join('')}</div></div>`:'<div class="empty">Nothing matched this window yet.</div>'}
async function load(){if(S.token)return loadMine();windows();filters();if(S.lat==null||S.lon==null){status('Choose your location to begin.',false);return}status('Finding real events near '+S.city+'…');try{let r=await fetch(`/api/feed?lat=${encodeURIComponent(S.lat)}&lng=${encodeURIComponent(S.lon)}&window=${encodeURIComponent(S.window)}`),j=await r.json();if(!r.ok)throw Error(j.error||r.status);S.events=j.events||[];status(`${S.events.length} canonical events · ${S.window} · ${S.city}`);render()}catch(e){status('Could not load events: '+e.message,false)}}
async function loadMine(){status('Loading your events…');let r=await fetch('/api/my-events?token='+encodeURIComponent(S.token)),j=await r.json();if(!r.ok){status(j.error||'Could not load dashboard',false);return}S.mine=(j.events||[]).map(e=>({...e,start:e.start_time,end:e.end_time,priceDisplay:e.price_display,ticketUrl:e.ticket_url,desc:e.description}));status(`${S.mine.length} events posted`);render()}
$('post').onclick=()=>{if(!S.token)$('form').reset();$('edit').value='';$('city').value=S.city||'';let d=new Date(Date.now()+86400000);d.setHours(20,0,0,0);$('start').value=local(d);$('dlg').showModal()};
$('cancel').onclick=()=>$('dlg').close();$('exit').onclick=()=>location.href=location.pathname;$('closeDetail').onclick=()=>$('detail').close();
$('loc').onclick=()=>navigator.geolocation.getCurrentPosition(p=>{S.lat=p.coords.latitude;S.lon=p.coords.longitude;S.city='your location';load()},()=>status('Location unavailable. Choose Denver to continue.',false),{timeout:8000});
$('denver').onclick=()=>{S.lat=39.7392;S.lon=-104.9903;S.city='Denver';load()};
$('form').onsubmit=async e=>{e.preventDefault();let id=$('edit').value,p={title:$('title').value.trim(),start_time:new Date($('start').value).toISOString(),end_time:$('end').value?new Date($('end').value).toISOString():null,venue:$('venue').value.trim(),city:$('city').value.trim(),lat:S.lat,lon:S.lon,category:$('cat').value,price:$('price').value.trim()||null,ticket_url:$('link').value.trim(),description:$('desc').value.trim(),submitter_email:$('email').value.trim()||null,manage_token:S.token||null},r=await fetch(id?`/api/events/${id}?token=${encodeURIComponent(S.token)}`:'/api/events',{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(id?{title:p.title,start_time:p.start_time,end_time:p.end_time,venue:p.venue,city:p.city,category:p.category,price_display:p.price||'Check event',ticket_url:p.ticket_url,description:p.description}:p)}),j=await r.json();if(!r.ok)return alert(j.error||'Save failed');$('dlg').close();if(!S.token&&j.event?.manage_token){S.token=j.event.manage_token;history.replaceState(null,'',location.pathname+'?mine='+S.token)}loadMine()};
function editEvent(id){let e=S.mine.find(x=>x.id===id);if(!e)return;$('edit').value=id;$('title').value=e.title;$('start').value=local(e.start);$('end').value=e.end?local(e.end):'';$('venue').value=e.venue;$('city').value=e.city||'';$('cat').value=e.category||'other';$('price').value=e.priceDisplay==='Check event'?'':(e.priceDisplay||'');$('link').value=e.ticketUrl||'';$('desc').value=e.desc||'';$('dlg').showModal()}
async function dup(id){let r=await fetch('/api/duplicate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_id:id,token:S.token})});if(!r.ok)return alert('Duplicate failed');loadMine()}
async function del(id){let r=await fetch(`/api/events/${id}?token=${encodeURIComponent(S.token)}`,{method:'DELETE'});if(!r.ok)return alert('Unpublish failed');loadMine()}
async function shareEvent(e){const url=e.shareUrl||`${location.origin}/event/${encodeURIComponent(e.id)}`;const text=`${e.title} — ${fmt(e.start)} at ${e.venue}`;if(navigator.share){try{return await navigator.share({title:e.title,text,url})}catch{}}await navigator.clipboard.writeText(text+' '+url);alert('Brinkberry link copied')}
function openEvent(id){let e=[...S.events,...S.mine].find(x=>x.id===id);if(!e)return;let share=e.shareUrl||`${location.origin}/event/${encodeURIComponent(e.id)}`;$('detailBody').innerHTML=`<h2>${esc(e.title)}</h2><p class="dim">${esc(fmt(e.start))} · ${esc(e.venue)}${e.distanceMiles!=null?' · '+esc(e.distanceMiles.toFixed(1))+' mi':''}</p>${e.whyThis?.length?`<p><b>${e.whyThis.map(esc).join(' · ')}</b></p>`:''}<p>${esc(e.desc||'')}</p><div class="actions"><a class="btn" href="${esc(share)}">Brinkberry page</a>${e.ticketUrl?`<a class="btn primary" target="_blank" rel="noopener" href="${esc(e.ticketUrl)}">Event page</a>`:''}<button id="shareBtn">Share</button></div>`;$('detail').showModal();setTimeout(()=>{$('shareBtn').onclick=()=>shareEvent(e)},0)}
(async()=>{windows();filters();if(S.token){$('loc').style.display='none';$('denver').style.display='none';return loadMine()}try{let p=await new Promise((o,n)=>navigator.geolocation.getCurrentPosition(o,n,{timeout:5000}));S.lat=p.coords.latitude;S.lon=p.coords.longitude;S.city='your location';load()}catch{status('Location unavailable. Choose Denver to continue.',false)}})();
</script></body></html>`;

async function handler(req,res){
  try{
    const u=new URL(req.url,"https://brinkberry.local"), path=u.pathname;
    if(req.method==="OPTIONS") return send(res,204,{});
    if(path==="/"&&req.method==="GET") return send(res,200,APP_HTML,"text/html; charset=utf-8");

    if(path==="/api/feed"&&req.method==="GET"){
      const lat=Number(u.searchParams.get("lat")),lng=Number(u.searchParams.get("lng")??u.searchParams.get("lon"));
      if(!Number.isFinite(lat)||!Number.isFinite(lng)) return send(res,400,{error:"Location required"});
      const windowName=u.searchParams.get("window")||"tonight",mode=u.searchParams.get("mode")||"";
      const events=await feed(lat,lng,windowName,mode);
      return send(res,200,{events,meta:{count:events.length,window:windowName}});
    }

    if(path==="/api/my-events"&&req.method==="GET"){
      const token=u.searchParams.get("token"); if(!token)return send(res,401,{error:"Token required"});
      return send(res,200,{events:await rpc("bb_my_events",{p_token:token})});
    }
    if(path==="/api/events"&&req.method==="POST"){
      let body="";for await(const c of req)body+=c;const p=JSON.parse(body||"{}");
      const rows=await rpc("bb_create_event",{p_title:p.title,p_start_time:p.start_time,p_end_time:p.end_time,p_venue:p.venue,p_address:p.address||null,p_city:p.city||"",p_lat:p.lat??null,p_lon:p.lon??null,p_category:p.category||"other",p_price_display:p.price||"Check event",p_price_low:p.price_low??null,p_price_high:p.price_high??null,p_description:p.description||null,p_ticket_url:p.ticket_url,p_submitter_email:p.submitter_email||null,p_manage_token:p.manage_token||null});
      return send(res,200,{event:rows?.[0]});
    }
    const legacy=path.match(/^\/api\/events\/([0-9a-f-]+)$/i);
    if(legacy&&req.method==="PATCH"){
      let body="";for await(const c of req)body+=c;const p=JSON.parse(body||"{}"),token=u.searchParams.get("token");
      if(!token)return send(res,401,{error:"Token required"});
      const ok=await rpc("bb_update_event",{p_id:legacy[1],p_token:token,p_title:p.title??null,p_start_time:p.start_time??null,p_end_time:p.end_time??null,p_venue:p.venue??null,p_address:p.address??null,p_city:p.city??null,p_category:p.category??null,p_price_display:p.price_display??null,p_price_low:p.price_low??null,p_price_high:p.price_high??null,p_description:p.description??null,p_ticket_url:p.ticket_url??null});
      return send(res,200,{ok:Boolean(ok)});
    }
    if(legacy&&req.method==="DELETE"){
      const token=u.searchParams.get("token");if(!token)return send(res,401,{error:"Token required"});
      const ok=await rpc("bb_unpublish_event",{p_id:legacy[1],p_token:token});return send(res,200,{ok:Boolean(ok)});
    }
    if(path==="/api/duplicate"&&req.method==="POST"){
      let body="";for await(const c of req)body+=c;const p=JSON.parse(body||"{}");
      if(!p.token)return send(res,401,{error:"Token required"});
      return send(res,200,{event:await rpc("bb_duplicate_event",{p_id:p.source_id,p_token:p.token})});
    }

    const eventMatch=path.match(/^\/event\/([0-9a-f-]+)$/i);
    if(eventMatch&&req.method==="GET"){
      const e=await getCanonical(eventMatch[1]); if(!e)return send(res,404,"Not found","text/plain; charset=utf-8");
      const price=e.price_status==="free"?"Free":(e.price_display||"Details");
      const desc=[e.venue?.display_name,price,new Date(e.start_time).toLocaleString("en-US",{timeZone:"America/Denver",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})].filter(Boolean).join(" · ");
      const og=`${BRINKBERRY_ORIGIN}/og/event/${e.id}.png`;
      const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(e.title)} — Brinkberry</title><meta name="description" content="${esc(desc)}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(e.title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${BRINKBERRY_ORIGIN}/event/${e.id}"><meta property="og:image" content="${og}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(e.title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${og}"></head><body style="margin:0;background:#080610;color:#f4eff8;font:16px system-ui"><main style="max-width:760px;margin:auto;padding:32px 20px"><a href="/" style="color:#ffb86b;text-decoration:none">← Brinkberry</a><h1 style="font-size:42px;line-height:1.05">${esc(e.title)}</h1><p style="color:#aaa0b6">${esc(desc)}</p>${e.description?`<p>${esc(e.description)}</p>`:""}<p><a href="${esc(e.canonical_url)}" style="display:inline-block;background:#ffb86b;color:#201000;padding:12px 16px;border-radius:999px;text-decoration:none;font-weight:800">Event / ticket page</a></p></main></body></html>`;
      return send(res,200,html,"text/html; charset=utf-8");
    }

    const ogMatch=path.match(/^\/og\/event\/([0-9a-f-]+)\.png$/i);
    if(ogMatch&&req.method==="GET"){
      const e=await getCanonical(ogMatch[1]);if(!e)return send(res,404,{error:"Not found"});
      const price=e.price_status==="free"?"Free":(e.price_display||"Details");
      const when=new Date(e.start_time).toLocaleString("en-US",{timeZone:"America/Denver",weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
      const node=React.createElement("div",{style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between",background:"#080610",color:"#f4eff8",padding:"64px",fontFamily:"sans-serif"}},
        React.createElement("div",{style:{fontSize:34,fontWeight:900,color:"#ffb86b"}},"● Brinkberry"),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"20px"}},
          React.createElement("div",{style:{fontSize:68,fontWeight:900,lineHeight:1.05}},e.title),
          React.createElement("div",{style:{fontSize:30,color:"#c5bbd0"}},[e.venue?.display_name,when,price,e.vibe_labels?.[0]].filter(Boolean).join(" · "))
        ),
        React.createElement("div",{style:{fontSize:28,color:"#90869e"}},"What’s happening near you right now?")
      );
      const img=new ImageResponse(node,{width:1200,height:630});
      res.statusCode=img.status;
      img.headers.forEach((v,k)=>res.setHeader(k,v));
      const ab=await img.arrayBuffer();return res.end(Buffer.from(ab));
    }

    if(path==="/api/brink"&&req.method==="GET"){
      return send(res,410,{error:"Legacy consumer route retired. Use /api/feed."});
    }
    return send(res,404,{error:"Not found"});
  }catch(err){console.error(err);return send(res,500,{error:String(err.message||err)})}
}
export default handler;
