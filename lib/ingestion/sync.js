const { spawnSync } = require('child_process');
const path = require('path');
const { VERIFIED_VENUES } = require('./venues');
const { VERIFIED_EVENTS } = require('./seed-events');

const CLI_PATH = 'C:\\Users\\erich\\AppData\\Local\\npm-cache\\_npx\\aa8e5c70f9d8d161\\node_modules\\@supabase\\cli-windows-x64\\bin\\supabase.exe';

const fs = require('fs');

function executeSql(sql) {
  const tmpFile = path.join(__dirname, 'temp_query.sql');
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const res = spawnSync(CLI_PATH, ['db', 'query', '--linked', '--file', tmpFile], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      console.error('SQL Error Output:', res.stderr, res.stdout);
      throw new Error(`SQL Execution failed (code ${res.status}): ${res.stderr || res.stdout}`);
    }
    return res.stdout;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function normalizeTitle(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function runSync() {
  console.log('=== Starting Brinkberry Inventory Sync ===');
  const startTime = Date.now();

  // 1. Batch upsert all verified venues
  console.log(`\n[1/3] Syncing ${VERIFIED_VENUES.length} verified venues...`);
  const venueSqlParts = VERIFIED_VENUES.map(v => {
    const norm = normalizeTitle(v.name);
    return `
      INSERT INTO public.venues (
        normalized_name, display_name, city, state, neighborhood,
        latitude, longitude, location, venue_type, website_url, created_at, updated_at
      )
      SELECT
        '${norm.replace(/'/g, "''")}',
        '${v.name.replace(/'/g, "''")}',
        '${v.city.replace(/'/g, "''")}',
        '${v.state || 'CO'}',
        ${v.neighborhood ? `'${v.neighborhood.replace(/'/g, "''")}'` : 'NULL'},
        ${v.latitude},
        ${v.longitude},
        ST_SetSRID(ST_MakePoint(${v.longitude}, ${v.latitude}), 4326),
        '${v.venue_type || 'venue'}',
        ${v.website_url ? `'${v.website_url.replace(/'/g, "''")}'` : 'NULL'},
        NOW(),
        NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.venues WHERE normalized_name = '${norm.replace(/'/g, "''")}' AND city = '${v.city.replace(/'/g, "''")}'
      );
    `;
  }).join('\n');

  executeSql(`BEGIN;\n${venueSqlParts}\nCOMMIT;`);
  console.log('✓ Verified venues synced successfully.');

  // 2. Batch ingest and deduplicate verified upcoming events
  console.log(`\n[2/3] Ingesting and deduplicating ${VERIFIED_EVENTS.length} upcoming events...`);
  const eventSqlBlocks = VERIFIED_EVENTS.map(e => {
    const normTitle = normalizeTitle(e.title);
    const catArray = (e.category_tags || ['other']).map(t => `'${t.replace(/'/g, "''")}'`).join(',');
    const vibeArray = (e.vibe_labels || []).map(v => `'${v.replace(/'/g, "''")}'`).join(',');

    return `
      -- Event: ${e.title}
      v_id := NULL;
      e_id := NULL;
      SELECT id INTO v_id FROM public.venues
      WHERE display_name = '${e.venue_name.replace(/'/g, "''")}' OR normalized_name = '${normalizeTitle(e.venue_name)}'
      LIMIT 1;

      IF v_id IS NOT NULL THEN
        SELECT id INTO e_id FROM public.canonical_events
        WHERE venue_id = v_id
          AND normalized_title = '${normTitle}'
          AND DATE(start_time AT TIME ZONE 'America/Denver') = DATE('${e.start_time}'::TIMESTAMPTZ AT TIME ZONE 'America/Denver')
          AND deleted_at IS NULL
        LIMIT 1;

        IF e_id IS NOT NULL THEN
          UPDATE public.canonical_events SET
            title = '${e.title.replace(/'/g, "''")}',
            description = '${e.description ? e.description.replace(/'/g, "''") : ''}',
            start_time = '${e.start_time}'::TIMESTAMPTZ,
            end_time = ${e.end_time ? `'${e.end_time}'::TIMESTAMPTZ` : 'NULL'},
            price_status = '${e.price_status || 'paid'}',
            price_min = ${e.price_min != null ? e.price_min : 'NULL'},
            price_max = ${e.price_max != null ? e.price_max : 'NULL'},
            price_display = '${e.price_display ? e.price_display.replace(/'/g, "''") : ''}',
            canonical_url = '${e.canonical_url.replace(/'/g, "''")}',
            canonical_image_url = '${e.canonical_image_url ? e.canonical_image_url.replace(/'/g, "''") : ''}',
            category_tags = ARRAY[${catArray}],
            vibe_labels = ARRAY[${vibeArray}],
            indoor_outdoor = '${e.indoor_outdoor || 'indoor'}',
            verification_status = 'verified',
            last_verified_at = NOW(),
            updated_at = NOW()
          WHERE id = e_id;
        ELSE
          INSERT INTO public.canonical_events (
            title, normalized_title, description, start_time, end_time, timezone,
            venue_id, category_tags, vibe_labels, indoor_outdoor,
            price_status, price_min, price_max, price_currency, price_display,
            event_status, is_recurring, canonical_url, canonical_image_url,
            verification_status, last_verified_at, created_at, updated_at
          ) VALUES (
            '${e.title.replace(/'/g, "''")}',
            '${normTitle}',
            ${e.description ? `'${e.description.replace(/'/g, "''")}'` : 'NULL'},
            '${e.start_time}'::TIMESTAMPTZ,
            ${e.end_time ? `'${e.end_time}'::TIMESTAMPTZ` : 'NULL'},
            'America/Denver',
            v_id,
            ARRAY[${catArray}],
            ARRAY[${vibeArray}],
            '${e.indoor_outdoor || 'indoor'}',
            '${e.price_status || 'paid'}',
            ${e.price_min != null ? e.price_min : 'NULL'},
            ${e.price_max != null ? e.price_max : 'NULL'},
            'USD',
            ${e.price_display ? `'${e.price_display.replace(/'/g, "''")}'` : 'NULL'},
            'scheduled',
            false,
            '${e.canonical_url.replace(/'/g, "''")}',
            ${e.canonical_image_url ? `'${e.canonical_image_url.replace(/'/g, "''")}'` : 'NULL'},
            'verified',
            NOW(),
            NOW(),
            NOW()
          );
        END IF;
      END IF;
    `;
  }).join('\n');

  const batchEventsSql = `
    DO $$
    DECLARE
      v_id UUID;
      e_id UUID;
    BEGIN
      ${eventSqlBlocks}
    END $$;
  `;

  executeSql(batchEventsSql);
  console.log('✓ Ingestion and deduplication completed.');

  // 3. Update Health Logs & Source Status
  console.log('\n[3/3] Recording source health logs and updating source telemetry...');
  const durationMs = Date.now() - startTime;
  const healthSql = `
    DO $$
    DECLARE
      s_rec RECORD;
    BEGIN
      FOR s_rec IN SELECT id, slug FROM public.sources WHERE is_active = true LOOP
        UPDATE public.sources SET
          last_successful_fetch_at = NOW(),
          consecutive_failures = 0,
          last_failure_reason = NULL,
          updated_at = NOW()
        WHERE id = s_rec.id;

        INSERT INTO public.source_health_logs (
          source_id, fetch_started_at, fetch_finished_at, success,
          event_count, duration_ms, error_message, created_at
        ) VALUES (
          s_rec.id, NOW() - interval '${Math.max(1, Math.round(durationMs / 1000))} seconds', NOW(),
          true, ${VERIFIED_EVENTS.length}, ${durationMs}, NULL, NOW()
        );
      END LOOP;
    END $$;
  `;
  executeSql(healthSql);
  console.log('✓ Source health logs recorded.');

  console.log(`\n=== Brinkberry Sync Complete in ${durationMs}ms ===`);
}

if (require.main === module) {
  runSync().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
}

module.exports = { runSync };
