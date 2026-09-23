/**
 * Brinkberry Community Posts Durable Production Storage Adapter
 *
 * Persists community events, deletion tombstones, ladder step-up approvals,
 * and safety flags across Vercel cold starts, restarts, and concurrent serverless instances.
 *
 * Production Backend: Supabase PostgreSQL (`community_events` table)
 * Development/Test Backend: Local file fallback with memory cache
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { GcsClientDriver } = require('../storage/raw-source-storage');

const LOCAL_STORAGE_FILE = path.join(os.tmpdir(), 'brinkberry_community_posts.json');
const LOCAL_DELETED_FILE = path.join(os.tmpdir(), 'brinkberry_deleted_community_posts.json');

function extractUuidFromId(id = '') {
  if (!id || typeof id !== 'string') return null;
  const clean = id.replace(/^comm_post_(v1_)?/, '');
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(clean)) return clean;
  // If id itself is a UUID
  if (uuidRegex.test(id)) return id;
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ensureValidUuid(str) {
  if (typeof str === 'string' && UUID_REGEX.test(str.trim())) {
    return str.trim();
  }
  return crypto.randomUUID();
}

class CommunityPostDurableStore {
  constructor(options = {}) {
    this.bucketName = options.bucketName || process.env.GCS_BUCKET_NAME;
    this.gcsDriver = options.gcsDriver || (this.bucketName ? new GcsClientDriver({ bucketName: this.bucketName }) : null);

    this.supabaseUrl = (options.supabaseUrl || process.env.SUPABASE_URL || 'https://onsnxawujlzfrzhwndyu.supabase.co')
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1$/, '');
    this.serviceKey = options.serviceKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.publishableKey = options.publishableKey || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';

    this.localFilePath = options.filePath || LOCAL_STORAGE_FILE;
    this.localDeletedPath = options.deletedFilePath || LOCAL_DELETED_FILE;

    this.memoryPosts = new Map();
    this.deletedPostIds = new Set();
    this.rateLimitLedger = new Map();

    this.lastSyncTime = 0;
    this.syncTtlMs = options.syncTtlMs || 5000; // 5s cache for fast serverless responses
    this.lastLocalFileMtime = 0;
    this.lastDeletedFileMtime = 0;

    this._initLocal();
  }

  get isGcsConfigured() {
    return Boolean(this.gcsDriver && this.gcsDriver.isConfigured?.());
  }

  get authKey() {
    return this.publishableKey || process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_2ygc158CkPm28E9j6zNdmA_Cvvj5kGr';
  }

  get isConfigured() {
    return this.isGcsConfigured || Boolean(
      this.supabaseUrl &&
      this.authKey &&
      typeof this.authKey === 'string' &&
      !this.authKey.includes('SENSITIVE') &&
      this.authKey.length > 10
    );
  }

  get isProductionDurable() {
    return this.isConfigured;
  }

  _initLocal() {
    this._reloadLocalIfModified();
  }

  _reloadLocalIfModified() {
    try {
      if (fs.existsSync(this.localDeletedPath)) {
        const stat = fs.statSync(this.localDeletedPath);
        if (stat.mtimeMs > this.lastDeletedFileMtime) {
          this.lastDeletedFileMtime = stat.mtimeMs;
          const raw = fs.readFileSync(this.localDeletedPath, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const id of parsed) {
              this.deletedPostIds.add(id);
              this.memoryPosts.delete(id);
              const postUuid = extractUuidFromId(id);
              if (postUuid) {
                this.deletedPostIds.add(postUuid);
                this.deletedPostIds.add(`comm_post_${postUuid}`);
                this.memoryPosts.delete(`comm_post_${postUuid}`);
                this.memoryPosts.delete(postUuid);
              }
            }
          }
        }
      }
    } catch (_) {}

    try {
      if (fs.existsSync(this.localFilePath)) {
        const stat = fs.statSync(this.localFilePath);
        if (stat.mtimeMs > this.lastLocalFileMtime) {
          this.lastLocalFileMtime = stat.mtimeMs;
          const raw = fs.readFileSync(this.localFilePath, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && item.id) {
                if (!this.deletedPostIds.has(item.id)) {
                  this.memoryPosts.set(item.id, item);
                  const postUuid = extractUuidFromId(item.id);
                  if (postUuid && !this.deletedPostIds.has(postUuid)) {
                    this.memoryPosts.set(`comm_post_${postUuid}`, item);
                  }
                }
              }
            }
          }
        }
      }
    } catch (_) {}
  }

  _saveLocal() {
    try {
      const dir = path.dirname(this.localFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const list = Array.from(this.memoryPosts.values());
      fs.writeFileSync(this.localFilePath, JSON.stringify(list, null, 2), 'utf8');
      const stat = fs.statSync(this.localFilePath);
      this.lastLocalFileMtime = stat.mtimeMs;
    } catch (_) {}

    try {
      const dir = path.dirname(this.localDeletedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const delList = Array.from(this.deletedPostIds);
      fs.writeFileSync(this.localDeletedPath, JSON.stringify(delList, null, 2), 'utf8');
      const stat = fs.statSync(this.localDeletedPath);
      this.lastDeletedFileMtime = stat.mtimeMs;
    } catch (_) {}
  }

  _serializeEnvelope(post = {}) {
    const rawDesc = String(post.description || '').replace(/\n\n<!--BB_META:[\s\S]*?-->/g, '').trim();
    const meta = {
      cleanId: post.id,
      venue: post.venue || post.venue_name || 'Community Location',
      address: post.address || null,
      city: post.city || 'Nearby',
      lat: Number.isFinite(Number(post.lat)) ? Number(post.lat) : null,
      lon: Number.isFinite(Number(post.lon)) ? Number(post.lon) : null,
      priceDisplay: post.priceDisplay || 'Free / Walk-in',
      category: post.category || 'community',
      category_tags: post.category_tags || [post.category || 'community'],
      locationMode: post.locationMode || 'exact',
      isApproximateLocation: Boolean(post.isApproximateLocation),
      isNeighborhoodOnly: Boolean(post.isNeighborhoodOnly),
      isPrivateResidence: Boolean(post.isPrivateResidence),
      broadcastRadiusMiles: post.broadcastRadiusMiles,
      approvedRadiusMiles: post.approvedRadiusMiles,
      desiredBroadcastLevel: post.desiredBroadcastLevel,
      currentLadderLevel: post.currentLadderLevel,
      currentLevelName: post.currentLevelName,
      ladderStatus: post.ladderStatus,
      contact: post.contact,
      detailsUrl: post.detailsUrl,
      sourceQualityLabel: post.sourceQualityLabel,
      sourceQualityTooltip: post.sourceQualityTooltip,
      expiresAt: post.expiresAt,
      reportCount: post.reportCount || 0,
      reports: post.reports || [],
      isDisplayable: post.isDisplayable !== false,
      isDeleted: Boolean(post.isDeleted),
      deletionKey: post.deletionKey,
      deletionKeyHash: post.deletionKeyHash,
      auditRecord: post.auditRecord,
      email_provided: post.email_provided || null,
      emailStatus: post.emailStatus || null,
      emailConfirmed: Boolean(post.emailConfirmed),
      emailVerificationCode: post.emailVerificationCode || null,
      phone_provided: post.phone_provided || null,
      phoneStatus: post.phoneStatus || null,
      phoneConfirmed: Boolean(post.phoneConfirmed),
      phoneVerificationCode: post.phoneVerificationCode || null,
      deletedAt: post.deletedAt || null,
      deletionReason: post.deletionReason || null
    };

    const envelopeDesc = rawDesc
      ? `${rawDesc}\n\n<!--BB_META:${JSON.stringify(meta)}-->`
      : `<!--BB_META:${JSON.stringify(meta)}-->`;

    return { rawDesc, envelopeDesc, meta };
  }

  _deserializeRow(row = {}) {
    if (!row || !row.id) return null;
    const postUuid = row.id;
    const displayId = `comm_post_${postUuid}`;

    let meta = {};
    let cleanDesc = row.description || '';
    if (typeof cleanDesc === 'string') {
      const match = cleanDesc.match(/<!--BB_META:([\s\S]*?)-->/);
      if (match) {
        try {
          meta = JSON.parse(match[1]);
          cleanDesc = cleanDesc.replace(/\n\n<!--BB_META:[\s\S]*?-->/g, '').trim();
        } catch (_) {}
      }
    }

    const isDeleted = Boolean(row.deleted_at || row.active === false || meta.isDeleted);
    const isDisplayable = Boolean(!row.deleted_at && row.active !== false && meta.isDisplayable !== false && !isDeleted);

    return {
      id: meta.cleanId || displayId,
      postUuid,
      fingerprint: meta.auditRecord?.fingerprint || crypto.createHash('sha256').update(`${row.title}:${row.start_time}:${meta.lat}:${meta.lon}`).digest('hex'),
      title: row.title || 'Community Event',
      description: cleanDesc,
      category: meta.category || (Array.isArray(row.category_tags) ? row.category_tags[0] : 'community'),
      category_tags: meta.category_tags || row.category_tags || ['community'],
      start_time: row.start_time,
      start: row.start_time,
      end_time: row.end_time || row.start_time,
      end: row.end_time || row.start_time,
      venue: meta.venue || row.venue || 'Community Location',
      venue_name: meta.venue || row.venue || 'Community Location',
      address: meta.address || row.address || null,
      city: meta.city || row.city || 'Nearby',
      lat: meta.lat != null ? Number(meta.lat) : (row.lat != null ? Number(row.lat) : null),
      lon: meta.lon != null ? Number(meta.lon) : (row.lon != null ? Number(row.lon) : null),
      venue_latitude: meta.lat != null ? Number(meta.lat) : (row.lat != null ? Number(row.lat) : null),
      venue_longitude: meta.lon != null ? Number(meta.lon) : (row.lon != null ? Number(row.lon) : null),
      locationMode: meta.locationMode || 'exact',
      isApproximateLocation: Boolean(meta.isApproximateLocation),
      isNeighborhoodOnly: Boolean(meta.isNeighborhoodOnly),
      isPrivateResidence: Boolean(meta.isPrivateResidence),
      broadcastRadiusMiles: meta.broadcastRadiusMiles || 2,
      approvedRadiusMiles: meta.approvedRadiusMiles || 2,
      desiredBroadcastLevel: meta.desiredBroadcastLevel || 'block',
      currentLadderLevel: meta.currentLadderLevel || 1,
      currentLevelName: meta.currentLevelName || 'Block / Neighborhood',
      ladderStatus: meta.ladderStatus || [],
      detailsUrl: meta.detailsUrl || row.canonical_url || row.ticket_url || null,
      contact: meta.contact || null,
      source: 'community_post',
      sourceType: 'community_submission',
      isCommunityPost: true,
      isAutonomousCommunityPost: true,
      confirmationStatus: 'community_submitted',
      sourceQualityLabel: meta.sourceQualityLabel || 'Community-submitted*',
      sourceQualityTooltip: meta.sourceQualityTooltip || '*This event was submitted by a Brinkberry user and has not been independently verified. Details may change.',
      hasTicket: false,
      price_status: 'free',
      price_min: 0,
      price_max: 0,
      priceDisplay: meta.priceDisplay || row.price_display || 'Free / Walk-in',
      createdAt: row.created_at || meta.createdAt || new Date().toISOString(),
      expiresAt: meta.expiresAt || new Date(new Date(row.start_time).getTime() + 48 * 3600 * 1000).toISOString(),
      reportCount: meta.reportCount || 0,
      reports: meta.reports || [],
      isDisplayable,
      isDeleted,
      deletionKey: meta.deletionKey || null,
      deletionKeyHash: meta.deletionKeyHash || null,
      auditRecord: meta.auditRecord || null,
      email_provided: meta.email_provided || null,
      emailStatus: meta.emailStatus || null,
      emailConfirmed: Boolean(meta.emailConfirmed),
      emailVerificationCode: meta.emailVerificationCode || null,
      phone_provided: meta.phone_provided || null,
      phoneStatus: meta.phoneStatus || null,
      phoneConfirmed: Boolean(meta.phoneConfirmed),
      phoneVerificationCode: meta.phoneVerificationCode || null,
      deletedAt: row.deleted_at || meta.deletedAt || null,
      deletionReason: meta.deletionReason || null
    };
  }

  async syncFromDurableStore(force = false) {
    this._initLocal();
    const now = Date.now();
    if (!force && (now - this.lastSyncTime) < this.syncTtlMs) {
      return { success: true, count: this.memoryPosts.size };
    }

    // 1. Sync from Supabase community_events table (durable production database)
    if (this.supabaseUrl && this.authKey) {
      try {
        // First sync any tombstones so deletions across instances take immediate effect
        const resTomb = await fetch(`${this.supabaseUrl}/rest/v1/community_events?category=eq.tombstone&select=id`, {
          headers: {
            apikey: this.authKey,
            authorization: `Bearer ${this.authKey}`
          },
          signal: AbortSignal.timeout(3000)
        });
        if (resTomb.ok) {
          const tombstones = await resTomb.json();
          if (Array.isArray(tombstones)) {
            for (const t of tombstones) {
              this.deletedPostIds.add(t.id);
              this.deletedPostIds.add(`comm_post_${t.id}`);
              this.deletedPostIds.add(`comm_post_v1_${t.id}`);
              this.memoryPosts.delete(t.id);
              this.memoryPosts.delete(`comm_post_${t.id}`);
            }
          }
        }

        const resActive = await fetch(`${this.supabaseUrl}/rest/v1/community_events?category=neq.tombstone&active=eq.true&order=start_time.asc`, {
          headers: {
            apikey: this.authKey,
            authorization: `Bearer ${this.authKey}`
          },
          signal: AbortSignal.timeout(3000)
        });

        if (resActive.ok) {
          const rows = await resActive.json();
          if (Array.isArray(rows)) {
            for (const row of rows) {
              if (row.category === 'tombstone' || row.title === '__DELETED__') continue;
              const post = this._deserializeRow(row);
              if (post && !this.deletedPostIds.has(post.id) && !this.deletedPostIds.has(row.id)) {
                this.memoryPosts.set(post.id, post);
                if (row.id) {
                  this.memoryPosts.set(`comm_post_${row.id}`, post);
                }
              }
            }
          }
        }

        this.lastSyncTime = Date.now();
        this._saveLocal();
        return { success: true, count: this.memoryPosts.size };
      } catch (err) {
        // Fall through to GCS/local
      }
    }

    // 2. Sync from GCS if configured (production multi-instance storage)
    if (this.isGcsConfigured) {
      try {
        const tombstones = await this.gcsDriver.listObjects('community-posts/tombstones/');
        if (Array.isArray(tombstones)) {
          for (const item of tombstones) {
            const id = item.objectPath.replace(/^community-posts\/tombstones\//, '').replace(/\.json$/, '');
            this.deletedPostIds.add(id);
            this.memoryPosts.delete(id);
            const postUuid = extractUuidFromId(id);
            if (postUuid) {
              this.deletedPostIds.add(postUuid);
              this.deletedPostIds.add(`comm_post_${postUuid}`);
              this.memoryPosts.delete(`comm_post_${postUuid}`);
            }
          }
        }

        const eventObjects = await this.gcsDriver.listObjects('community-posts/events/');
        if (Array.isArray(eventObjects)) {
          for (const item of eventObjects) {
            const id = item.objectPath.replace(/^community-posts\/events\//, '').replace(/\.json$/, '');
            if (!this.deletedPostIds.has(id) && !this.memoryPosts.has(id)) {
              const post = await this.gcsDriver.getObject(item.objectPath);
              if (post && typeof post === 'object' && !post.isDeleted && post.isDisplayable !== false) {
                this.memoryPosts.set(post.id, post);
                const postUuid = extractUuidFromId(post.id);
                if (postUuid) this.memoryPosts.set(`comm_post_${postUuid}`, post);
              }
            }
          }
        }

        this.lastSyncTime = Date.now();
        this._saveLocal();
        return { success: true, count: this.memoryPosts.size };
      } catch (err) {
        console.error('[CommunityStore] GCS sync error:', err);
      }
    }

    return { success: true, count: this.memoryPosts.size };
  }

  async persistPost(post = {}) {
    if (!post || !post.id) return false;
    this._initLocal();

    // 1. Save to memory cache immediately
    this.memoryPosts.set(post.id, post);
    const postUuid = extractUuidFromId(post.id) || crypto.randomUUID();
    const cleanDisplayId = `comm_post_${postUuid}`;
    this.memoryPosts.set(cleanDisplayId, post);
    this._saveLocal();

    let saved = false;

    // 2. Dual-persist to Supabase community_events table
    if (this.supabaseUrl && this.authKey) {
      try {
        const { envelopeDesc } = this._serializeEnvelope(post);
        const payload = {
          id: postUuid,
          title: post.title,
          start_time: post.start_time,
          end_time: post.end_time || null,
          venue: post.venue || (post.location ? post.location.split(',')[0].trim() : 'Community Location'),
          address: post.address || post.location || null,
          city: post.city || 'Denver',
          lat: typeof post.lat === 'number' ? post.lat : null,
          lon: typeof post.lon === 'number' ? post.lon : null,
          category: post.category || 'community',
          price_display: post.priceDisplay || 'Free / Walk-in',
          price_low: typeof post.price_min === 'number' ? post.price_min : 0,
          price_high: typeof post.price_max === 'number' ? post.price_max : null,
          description: envelopeDesc,
          ticket_url: post.detailsUrl || '',
          source: 'Brinkberry',
          active: true,
          submitter_email: post.contactEmail || post.submitterEmail || null,
          manage_token: ensureValidUuid(post.deletionKey)
        };

        const res = await fetch(`${this.supabaseUrl}/rest/v1/community_events`, {
          method: 'POST',
          headers: {
            apikey: this.authKey,
            authorization: `Bearer ${this.authKey}`,
            'content-type': 'application/json',
            prefer: 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          saved = true;
        } else {
          console.error('[CommunityStore] Supabase persist failed:', res.status, await res.text());
        }
      } catch (err) {
        console.error('[CommunityStore] Supabase persist error:', err);
      }
    }

    // 3. Persist to GCS bucket if configured
    if (this.isGcsConfigured) {
      try {
        await this.gcsDriver.putObject(`community-posts/events/${post.id}.json`, post);
        if (cleanDisplayId !== post.id) {
          await this.gcsDriver.putObject(`community-posts/events/${cleanDisplayId}.json`, post);
        }
        saved = true;
      } catch (err) {
        console.error('[CommunityStore] GCS persist error:', err);
      }
    }

    return saved || !this.isConfigured;
  }

  async updatePost(post = {}) {
    if (!post || !post.id) return false;
    this._initLocal();

    this.memoryPosts.set(post.id, post);
    const postUuid = extractUuidFromId(post.id);
    if (postUuid) {
      this.memoryPosts.set(`comm_post_${postUuid}`, post);
    }
    this._saveLocal();

    if (postUuid && this.supabaseUrl && this.authKey) {
      try {
        const { envelopeDesc } = this._serializeEnvelope(post);
        const payload = {
          id: postUuid,
          title: post.title,
          start_time: post.start_time,
          end_time: post.end_time || null,
          venue: post.venue || (post.location ? post.location.split(',')[0].trim() : 'Community Location'),
          address: post.address || post.location || null,
          city: post.city || 'Denver',
          lat: typeof post.lat === 'number' ? post.lat : null,
          lon: typeof post.lon === 'number' ? post.lon : null,
          category: post.category || 'community',
          price_display: post.priceDisplay || 'Free / Walk-in',
          price_low: typeof post.price_min === 'number' ? post.price_min : 0,
          price_high: typeof post.price_max === 'number' ? post.price_max : null,
          description: envelopeDesc,
          ticket_url: post.detailsUrl || '',
          source: 'Brinkberry',
          active: true,
          submitter_email: post.contactEmail || post.submitterEmail || null,
          manage_token: ensureValidUuid(post.deletionKey)
        };

        await fetch(`${this.supabaseUrl}/rest/v1/community_events`, {
          method: 'POST',
          headers: {
            apikey: this.authKey,
            authorization: `Bearer ${this.authKey}`,
            'content-type': 'application/json',
            prefer: 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000)
        });
      } catch (err) {
        console.error('[CommunityStore] Supabase update error:', err);
      }
    }

    if (this.isGcsConfigured) {
      try {
        await this.gcsDriver.putObject(`community-posts/events/${post.id}.json`, post);
        if (postUuid) {
          await this.gcsDriver.putObject(`community-posts/events/comm_post_${postUuid}.json`, post);
        }
      } catch (err) {
        console.error('[CommunityStore] GCS update error:', err);
      }
    }

    return true;
  }

  async deletePost(id, deletionReason = 'user_deleted') {
    if (!id) return false;
    this._initLocal();

    const postUuid = extractUuidFromId(id);

    // Record tombstone locally
    this.deletedPostIds.add(id);
    if (postUuid) {
      this.deletedPostIds.add(postUuid);
      this.deletedPostIds.add(`comm_post_${postUuid}`);
      this.deletedPostIds.add(`comm_post_v1_${postUuid}`);
    }

    const existing = this.memoryPosts.get(id) || (postUuid ? this.memoryPosts.get(`comm_post_${postUuid}`) : null);
    if (existing) {
      existing.isDeleted = true;
      existing.isDisplayable = false;
      existing.deletedAt = new Date().toISOString();
      existing.deletionReason = deletionReason;
    }

    this.memoryPosts.delete(id);
    if (postUuid) {
      this.memoryPosts.delete(`comm_post_${postUuid}`);
      this.memoryPosts.delete(postUuid);
    }
    this._saveLocal();

    // 1. Supabase PostgreSQL durable tombstone upsert
    if (postUuid && this.supabaseUrl && this.authKey) {
      try {
        const payload = {
          id: postUuid,
          title: '__DELETED__',
          start_time: new Date().toISOString(),
          venue: '__TOMBSTONE__',
          address: null,
          city: '',
          category: 'tombstone',
          price_display: 'Deleted',
          description: JSON.stringify({ isDeleted: true, deletionReason, deletedAt: new Date().toISOString() }),
          ticket_url: '',
          source: 'Brinkberry',
          active: true,
          manage_token: '00000000-0000-0000-0000-000000000000'
        };
        const delRes = await fetch(`${this.supabaseUrl}/rest/v1/community_events`, {
          method: 'POST',
          headers: {
            apikey: this.authKey,
            authorization: `Bearer ${this.authKey}`,
            'content-type': 'application/json',
            prefer: 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000)
        });
        if (!delRes.ok) {
          console.error('[CommunityStore] Supabase delete tombstone failed:', delRes.status, await delRes.text());
        }
      } catch (err) {
        console.error('[CommunityStore] Supabase delete tombstone error:', err);
      }
    }

    // 2. Delete and record tombstone in GCS if configured
    if (this.isGcsConfigured) {
      try {
        await this.gcsDriver.deleteObject(`community-posts/events/${id}.json`);
        if (postUuid) {
          await this.gcsDriver.deleteObject(`community-posts/events/comm_post_${postUuid}.json`);
        }
        await this.gcsDriver.putObject(`community-posts/tombstones/${id}.json`, {
          id,
          postUuid,
          deletedAt: new Date().toISOString(),
          deletionReason
        });
      } catch (err) {
        console.error('[CommunityStore] GCS delete error:', err);
      }
    }

    return true;
  }

  getPostById(id) {
    this._initLocal();
    if (!id) return null;
    if (this.deletedPostIds.has(id)) return null;

    const postUuid = extractUuidFromId(id);
    if (postUuid && this.deletedPostIds.has(postUuid)) return null;

    let post = this.memoryPosts.get(id);
    if (!post && postUuid) {
      post = this.memoryPosts.get(`comm_post_${postUuid}`) || this.memoryPosts.get(postUuid);
    }

    if (post) {
      if (post.isDeleted || !post.isDisplayable) return null;
      return post;
    }

    return null;
  }

  async fetchPostByIdRemote(id) {
    if (!id || this.deletedPostIds.has(id)) return null;
    const postUuid = extractUuidFromId(id);
    if (postUuid && (this.deletedPostIds.has(postUuid) || this.deletedPostIds.has(`comm_post_${postUuid}`))) return null;

    // 1. Check Supabase community_events table
    if (postUuid && this.supabaseUrl && this.authKey) {
      try {
        const res = await fetch(`${this.supabaseUrl}/rest/v1/community_events?id=eq.${encodeURIComponent(postUuid)}&select=*`, {
          headers: {
            apikey: this.authKey,
            authorization: `Bearer ${this.authKey}`
          },
          signal: AbortSignal.timeout(3000)
        });
        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) {
            const row = rows[0];
            if (row.category === 'tombstone' || row.title === '__DELETED__') {
              this.deletedPostIds.add(id);
              if (postUuid) {
                this.deletedPostIds.add(postUuid);
                this.deletedPostIds.add(`comm_post_${postUuid}`);
              }
              this.memoryPosts.delete(id);
              if (postUuid) {
                this.memoryPosts.delete(postUuid);
                this.memoryPosts.delete(`comm_post_${postUuid}`);
              }
              this._saveLocal();
              return null;
            }
            const post = this._deserializeRow(row);
            if (post && !post.isDeleted && post.isDisplayable) {
              this.memoryPosts.set(post.id, post);
              this.memoryPosts.set(`comm_post_${postUuid}`, post);
              this._saveLocal();
              return post;
            } else {
              this.deletedPostIds.add(id);
              if (postUuid) this.deletedPostIds.add(postUuid);
              this.memoryPosts.delete(id);
              if (postUuid) this.memoryPosts.delete(`comm_post_${postUuid}`);
              this._saveLocal();
              return null;
            }
          }
        }
      } catch (err) {
        console.error('[CommunityStore] Supabase fetchById error:', err);
      }
    }

    // 2. Fetch from GCS if configured
    if (this.isGcsConfigured) {
      try {
        let post = await this.gcsDriver.getObject(`community-posts/events/${id}.json`);
        if (!post && postUuid) {
          post = await this.gcsDriver.getObject(`community-posts/events/comm_post_${postUuid}.json`);
        }
        if (post && typeof post === 'object' && !post.isDeleted && post.isDisplayable !== false) {
          this.memoryPosts.set(post.id, post);
          if (postUuid) this.memoryPosts.set(`comm_post_${postUuid}`, post);
          this._saveLocal();
          return post;
        }
      } catch (err) {
        console.error('[CommunityStore] GCS fetchById error:', err);
      }
    }

    // Fall back to local memory if Supabase fetch failed or wasn't configured
    return this.getPostById(id);
  }

  resetForTesting() {
    this.memoryPosts.clear();
    this.deletedPostIds.clear();
    this.rateLimitLedger.clear();
    this.lastSyncTime = 0;
    this.isLoadedFromDisk = false;
    try {
      if (fs.existsSync(this.localFilePath)) fs.unlinkSync(this.localFilePath);
    } catch (_) {}
    try {
      if (fs.existsSync(this.localDeletedPath)) fs.unlinkSync(this.localDeletedPath);
    } catch (_) {}
  }
}

const defaultCommunityPostStore = new CommunityPostDurableStore();

module.exports = {
  CommunityPostDurableStore,
  defaultCommunityPostStore,
  extractUuidFromId
};
