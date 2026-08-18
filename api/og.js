import React from "react";
import { ImageResponse } from "@vercel/og";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

async function sb(path){
  if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase server configuration missing");
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    headers:{
      apikey:SUPABASE_SERVICE_ROLE_KEY,
      authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if(!r.ok) throw new Error(`Supabase ${r.status}`);
  return r.json();
}
const enc=encodeURIComponent;
async function getCanonical(id){
  const rows=await sb(`canonical_events?id=eq.${enc(id)}&deleted_at=is.null&select=*`);
  const e=rows?.[0]; if(!e)return null;
  const vs=await sb(`venues?id=eq.${e.venue_id}&select=display_name`);
  return {...e,venue:vs?.[0]||null};
}

export default async function handler(req,res){
  try{
    const id=req.query?.id;
    if(!id) return res.status(400).send("Missing id");
    const e=await getCanonical(id);
    if(!e) return res.status(404).send("Not found");
    const price=e.price_status==="free"?"Free":(e.price_display||"Details");
    const when=new Date(e.start_time).toLocaleString("en-US",{timeZone:"America/Denver",weekday:"long",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
    return new ImageResponse(
      React.createElement("div",{style:{width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between",background:"#080610",color:"#f4eff8",padding:"64px",fontFamily:"sans-serif"}},
        React.createElement("div",{style:{fontSize:34,fontWeight:900,color:"#ffb86b"}},"● Brinkberry"),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:"20px"}},
          React.createElement("div",{style:{fontSize:68,fontWeight:900,lineHeight:1.05}},e.title),
          React.createElement("div",{style:{fontSize:30,color:"#c5bbd0"}},[e.venue?.display_name,when,price,e.vibe_labels?.[0]].filter(Boolean).join(" · "))
        ),
        React.createElement("div",{style:{fontSize:28,color:"#90869e"}},"What’s happening near you right now?")
      ),
      {width:1200,height:630}
    );
  }catch(err){
    console.error(err);
    res.status(500).send("OG image failed");
  }
}
