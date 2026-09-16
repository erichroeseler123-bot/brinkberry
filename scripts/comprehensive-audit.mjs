import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';

async function runAudit() {
  console.log('================================================================');
  console.log('BRINKBERRY LIVE DATABASE & 48-HOUR BOUNDARY PROVENANCE AUDIT');
  console.log('================================================================\n');

  const now = new Date();
  const max48 = new Date(now.getTime() + 48 * 3600 * 1000);
  console.log('Current Audit Timestamp (UTC):', now.toISOString());
  console.log('Strict 48-Hour Boundary Cutoff:', max48.toISOString(), '\n');

  const rVenues = await fetch(SUPABASE_URL + '/rest/v1/venues?select=id,display_name,address_line_1,city,state,latitude,longitude,venue_type&order=display_name.asc', {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  const venues = await rVenues.json();
  console.log('--- VENUE AUDIT (Total: ' + venues.length + ' Verified Venues) ---');
  const venuesByCity = {};
  for (const v of venues) {
    venuesByCity[v.city || 'Unknown'] = (venuesByCity[v.city || 'Unknown'] || 0) + 1;
  }
  console.log('Venues by City:', venuesByCity);

  const missingCoords = venues.filter(v => v.latitude == null || v.longitude == null);
  console.log('Venues with missing coordinates:', missingCoords.length);

  console.log('\n--- VERIFIED FRONT RANGE VENUES ---');
  venues.forEach(v => {
    console.log(v.display_name.padEnd(42), '| ' + (v.city || 'Denver').padEnd(14), '| [' + Number(v.latitude).toFixed(4) + ', ' + Number(v.longitude).toFixed(4) + '] | ' + (v.address_line_1 || ''));
  });

  const rSources = await fetch(SUPABASE_URL + '/rest/v1/sources?select=*&order=source_priority.desc', {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  const sources = await rSources.json();
  console.log('\n--- SOURCES AUDIT (Total: ' + sources.length + ' Configured Sources) ---');
  for (const s of sources) {
    console.log(
      s.slug.padEnd(30),
      '| ' + (s.type || 'unknown').padEnd(14),
      '| ' + String(s.source_priority || 0).padEnd(8),
      '| ' + (s.last_successful_fetch_at || 'Never').slice(0, 26).padEnd(26),
      '| Active: ' + s.is_active
    );
  }

  const rEvents = await fetch(SUPABASE_URL + '/rest/v1/canonical_events?select=id,title,start_time,end_time,price_status,price_display,price_min,canonical_url,canonical_image_url,event_status,venue_id&deleted_at=is.null&order=start_time.asc', {
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY }
  });
  const events = await rEvents.json();
  
  const pastEvents = events.filter(e => new Date(e.start_time).getTime() < now.getTime());
  const in48Events = events.filter(e => {
    const t = new Date(e.start_time).getTime();
    return t >= now.getTime() && t <= max48.getTime();
  });
  const futureEvents = events.filter(e => new Date(e.start_time).getTime() > max48.getTime());

  console.log('\n--- CANONICAL EVENTS SUMMARY ---');
  console.log('Total Active Events in DB:', events.length);
  console.log('Past Events (< NOW):', pastEvents.length);
  console.log('Rolling 48-Hour Window Events ([NOW, NOW+48h]):', in48Events.length);
  console.log('Future Events (> NOW+48h):', futureEvents.length);

  console.log('\n--- ALL EVENTS IN ROLLING 48-HOUR WINDOW (' + in48Events.length + ' Items) ---');
  const venueMap = Object.fromEntries(venues.map(v => [v.id, v]));

  in48Events.forEach((e, idx) => {
    const v = venueMap[e.venue_id] || {};
    const hoursFromNow = ((new Date(e.start_time).getTime() - now.getTime()) / 3600000).toFixed(1);
    console.log('\n[#' + (idx + 1) + '] ' + e.title);
    console.log('  Starts in: +' + hoursFromNow + ' hours (' + e.start_time + ')');
    console.log('  Venue: ' + (v.display_name || 'Unknown') + ' (' + (v.city || 'Unknown') + ', CO)');
    console.log('  Coordinates: [' + v.latitude + ', ' + v.longitude + ']');
    console.log('  Ticket URL: ' + e.canonical_url);
    console.log('  Price: ' + e.price_status + ' (' + (e.price_display || 'N/A') + ')');
  });

  const rRpc = await fetch(SUPABASE_URL + '/rest/v1/rpc/bb_get_feed_events_v2', {
    method: 'POST',
    headers: { apikey: KEY, authorization: 'Bearer ' + KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      p_user_lat: 39.7392,
      p_user_lng: -104.9903,
      p_radius_miles: 50,
      p_window_start: now.toISOString(),
      p_window_end: max48.toISOString(),
      p_mode: null
    })
  });
  const rpcResults = await rRpc.json();
  console.log('\n--- LIVE FEED RPC EXECUTION CHECK ---');
  console.log('bb_get_feed_events_v2 returned ' + rpcResults.length + ' events for Denver 50-mile radius.');
}

runAudit();
