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

class CommunityPostDurableStore {
  constructor(options = {}) {
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

  get isConfigured() {
    return Boolean(
      this.supabaseUrl &&
      this.serviceKey &&
      typeof this.serviceKey === 'string' &&
      !this.serviceKey.includes('SENSITIVE') &&
      this.serviceKey.length > 20
    );
  }

  get authKey() {
    return this.serviceKey;
  }

  get isProductionDurable() {
    return Boolean(
      this.isConfigured &&
      this.serviceKey &&
      typeof this.serviceKey === 'string' &&
      !this.serviceKey.includes('SENSITIVE') &&
      this.serviceKey.length > 20
    );
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

    if (!this.isConfigured) {
      return { success: true, count: this.memoryPosts.size };
    }

    try {
      // 1. Fetch active community events from canonical_events
      const resActive = await fetch(`${this.supabaseUrl}/rest/v1/canonical_events?verification_status=eq.community_submitted&deleted_at=is.null&order=start_time.asc`, {
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

      // 2. Fetch deleted community events to sync tombstones across instances
      const resDeleted = await fetch(`${this.supabaseUrl}/rest/v1/canonical_events?verification_status=eq.community_submitted&deleted_at=not.is.null&select=id`, {
        headers: {
          apikey: this.authKey,
          authorization: `Bearer ${this.authKey}`
        },
        signal: AbortSignal.timeout(3000)
      });

      if (resDeleted.ok) {
        const delRows = await resDeleted.json();
        if (Array.isArray(delRows)) {
          for (const dr of delRows) {
            if (dr?.id) {
              this.deletedPostIds.add(dr.id);
              this.deletedPostIds.add(`comm_post_${dr.id}`);
              this.deletedPostIds.add(`comm_post_v1_${dr.id}`);
              this.memoryPosts.delete(`comm_post_${dr.id}`);
              this.memoryPosts.delete(dr.id);
            }
          }
        }
      }

      this.lastSyncTime = Date.now();
      this._saveLocal();
      return { success: true, count: this.memoryPosts.size };
    } catch (err) {
      // Offline fallback: rely on local storage without crashing
      return { success: false, error: err.message, count: this.memoryPosts.size };
    }
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

    if (!this.isConfigured) return true;

    try {
      const { envelopeDesc } = this._serializeEnvelope(post);

      const payload = {
        id: postUuid,
        title: post.title,
        normalized_title: (post.title || '').toLowerCase().replace(/[^a-z0-9]/g, ''),
        description: envelopeDesc,
        start_time: post.start_time,
        end_time: post.end_time || null,
        timezone: post.timezone || 'America/Denver',
        category_tags: post.category_tags || [post.category || 'community'],
        price_status: 'free',
        price_display: post.priceDisplay || 'Free / Walk-in',
        canonical_url: post.detailsUrl || '',
        verification_status: 'community_submitted',
        deleted_at: (post.isDeleted || !post.isDisplayable) ? new Date().toISOString() : null,
        created_at: post.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const res = await fetch(`${this.supabaseUrl}/rest/v1/canonical_events`, {
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

      return res.ok;
    } catch (_) {
      return false;
    }
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

    if (!this.isConfigured || !postUuid) return true;

    try {
      const { envelopeDesc } = this._serializeEnvelope(post);
      const res = await fetch(`${this.supabaseUrl}/rest/v1/canonical_events?id=eq.${encodeURIComponent(postUuid)}`, {
        method: 'PATCH',
        headers: {
          apikey: this.authKey,
          authorization: `Bearer ${this.authKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          description: envelopeDesc,
          canonical_url: post.detailsUrl || '',
          deleted_at: (post.isDeleted || !post.isDisplayable) ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch (_) {
      return false;
    }
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

    if (!this.isConfigured || !postUuid) return true;

    try {
      const { envelopeDesc } = this._serializeEnvelope(existing || { id, isDeleted: true, deletionReason });
      const res = await fetch(`${this.supabaseUrl}/rest/v1/canonical_events?id=eq.${encodeURIComponent(postUuid)}`, {
        method: 'PATCH',
        headers: {
          apikey: this.authKey,
          authorization: `Bearer ${this.authKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          deleted_at: new Date().toISOString(),
          description: envelopeDesc,
          updated_at: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(3000)
      });
      return res.ok;
    } catch (_) {
      return false;
    }
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
    const local = this.getPostById(id);
    if (local) return local;

    if (!this.isConfigured) return null;
    const postUuid = extractUuidFromId(id);
    if (!postUuid || this.deletedPostIds.has(id) || this.deletedPostIds.has(postUuid)) return null;

    try {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/canonical_events?id=eq.${encodeURIComponent(postUuid)}&select=*`, {
        headers: {
          apikey: this.authKey,
          authorization: `Bearer ${this.authKey}`
        }
      });
      if (!res.ok) return null;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return null;

      const post = this._deserializeRow(rows[0]);
      if (post && !post.isDeleted && post.isDisplayable) {
        this.memoryPosts.set(post.id, post);
        this.memoryPosts.set(`comm_post_${postUuid}`, post);
        return post;
      }
      return null;
    } catch (_) {
      return null;
    }
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
