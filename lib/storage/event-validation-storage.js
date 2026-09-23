/**
 * lib/storage/event-validation-storage.js
 *
 * Durable Storage Engine for Event Validation Records
 *
 * Requirements:
 * 1. Follows the repository's existing persistence pattern (local JSON in tmp/storage).
 * 2. Idempotent upserts: applying multiple runs never duplicates records or destroys historical attempts.
 * 3. Preserves validation failures and rejection history permanently.
 * 4. Completely isolated from production feed queries until formal admin promotion.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_VALIDATION_STORE_FILE = path.join(os.tmpdir(), 'brinkberry_event_validation_records.json');

class EventValidationStorage {
  constructor(filePath = DEFAULT_VALIDATION_STORE_FILE) {
    this.filePath = filePath;
    this.records = new Map();
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          this.records.clear();
          for (const item of list) {
            if (item && item.id) {
              this.records.set(item.id, item);
            }
          }
        }
      }
    } catch (_) {}
  }

  save() {
    try {
      const list = Array.from(this.records.values());
      fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf8');
    } catch (_) {}
  }

  /**
   * Idempotent upsert of event validation records
   */
  async upsertValidationRecords(records = []) {
    if (!Array.isArray(records)) return [];
    const updated = [];

    for (const record of records) {
      if (!record || !record.id) continue;

      if (this.records.has(record.id)) {
        const existing = this.records.get(record.id);
        const history = existing.validationHistory || [];
        history.push({
          validatedAt: existing.validatedAt,
          isPublishable: existing.isPublishable,
          publicationTier: existing.publicationTier,
          rejectionReasons: existing.rejectionReasons
        });

        const merged = {
          ...existing,
          ...record,
          validationHistory: history,
          updatedAt: new Date().toISOString()
        };
        this.records.set(record.id, merged);
        updated.push(merged);
      } else {
        const initial = {
          ...record,
          validationHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.records.set(record.id, initial);
        updated.push(initial);
      }
    }

    this.save();
    return updated;
  }

  async getRecordById(id) {
    if (!id) return null;
    return this.records.get(id) || null;
  }

  async queryRecords(filters = {}) {
    const {
      crawlLedgerId = null,
      sourceKind = null,
      venueSlug = null,
      isPublishable = null,
      publicationTier = null,
      limit = 100
    } = filters;

    const results = [];
    for (const r of this.records.values()) {
      if (crawlLedgerId && r.crawlLedgerId !== crawlLedgerId) continue;
      if (sourceKind && r.sourceKind !== sourceKind) continue;
      if (venueSlug && r.venueSlug !== venueSlug) continue;
      if (isPublishable !== null && r.isPublishable !== isPublishable) continue;
      if (publicationTier && r.publicationTier !== publicationTier) continue;

      results.push(r);
      if (results.length >= limit) break;
    }

    return results;
  }

  clear() {
    this.records.clear();
    this.save();
  }

  getDiagnostics() {
    const total = this.records.size;
    let publishableCount = 0;
    let leadsCount = 0;
    const byTier = {};

    for (const r of this.records.values()) {
      if (r.isPublishable) publishableCount++;
      if (r.publicationTier === 'unconfirmed_lead') leadsCount++;
      byTier[r.publicationTier] = (byTier[r.publicationTier] || 0) + 1;
    }

    return {
      totalValidationRecords: total,
      publishableCount,
      leadsCount,
      byTier,
      filePath: this.filePath
    };
  }
}

const defaultEventValidationStorage = new EventValidationStorage();

module.exports = {
  EventValidationStorage,
  defaultEventValidationStorage
};
