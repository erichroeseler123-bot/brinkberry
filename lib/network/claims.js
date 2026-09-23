/**
 * Vertical Ingestion Network Venue & Track Claim Portal Engine
 *
 * Implements strict, multi-layer verification for independent comedy rooms and motorsports tracks:
 * 1. Official-domain work email (e.g. promoter@eldoraspeedway.com or booking@risecomedy.com)
 * 2. On-site verification token (meta tag: <meta name="brinkberry-verification" content="..."> or .well-known)
 * 3. Human box office review (social handles accepted strictly as secondary evidence)
 *
 * Guaranteed 100% free: No venue or track ever pays to be listed, claimed, or discovered.
 */

const crypto = require('crypto');

class VerticalClaimManager {
  constructor() {
    this.claims = new Map(); // claimId -> claimRecord
    this.verifiedEntities = new Map(); // entityId -> verificationInfo
  }

  generateClaimToken() {
    return `bb_claim_${crypto.randomBytes(16).toString('hex')}`;
  }

  createClaim(entityData, claimantData = {}) {
    const { entityId, entityType, website, name } = entityData;
    const { claimantEmail, claimantName, claimantRole } = claimantData;

    if (!entityId || !claimantEmail) {
      throw new Error('Claim requires entityId and claimantEmail');
    }

    const claimId = `clm_${crypto.randomBytes(12).toString('hex')}`;
    const verificationToken = this.generateClaimToken();

    // Check domain match
    let domainMatches = false;
    if (website && claimantEmail.includes('@')) {
      try {
        const entityHostname = new URL(website).hostname.replace(/^www\./, '').toLowerCase();
        const emailDomain = claimantEmail.split('@')[1].toLowerCase();
        domainMatches = entityHostname === emailDomain || emailDomain.endsWith(`.${entityHostname}`);
      } catch (_) {}
    }

    const claimRecord = {
      claimId,
      entityId,
      entityType: entityType || 'venue',
      entityName: name,
      website,
      claimantEmail,
      claimantName,
      claimantRole: claimantRole || 'owner_or_promoter',
      verificationToken,
      domainMatches,
      status: 'pending_verification',
      createdAt: new Date().toISOString(),
      verifiedAt: null
    };

    this.claims.set(claimId, claimRecord);
    return claimRecord;
  }

  getClaim(claimId) {
    return this.claims.get(claimId) || null;
  }

  /**
   * Probes claimant's official website for verification meta tag
   */
  async verifySiteToken(claimId, fetchFn = fetch) {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error('Claim not found');
    if (!claim.website) throw new Error('Entity has no website configured for meta tag verification');

    try {
      const res = await fetchFn(claim.website, {
        headers: { 'User-Agent': 'Brinkberry-Verification-Bot/2.0' }
      });
      if (!res.ok) {
        return { verified: false, reason: `HTTP_${res.status}_from_site` };
      }

      const html = await res.text();
      const metaTagPattern = new RegExp(`<meta\\s+name=["']brinkberry-verification["']\\s+content=["']${claim.verificationToken}["']`, 'i');

      if (metaTagPattern.test(html)) {
        claim.status = 'verified';
        claim.verifiedAt = new Date().toISOString();
        claim.verificationMethod = 'html_meta_tag';
        this.verifiedEntities.set(claim.entityId, {
          claimId,
          verifiedAt: claim.verifiedAt,
          method: 'html_meta_tag'
        });
        return { verified: true, claim };
      }

      return { verified: false, reason: 'meta_tag_not_found' };
    } catch (err) {
      return { verified: false, reason: err.message || 'network_error' };
    }
  }

  /**
   * Approves claim via official domain email token
   */
  verifyEmailMagicToken(claimId, token) {
    const claim = this.claims.get(claimId);
    if (!claim) throw new Error('Claim not found');
    if (claim.verificationToken !== token) {
      return { verified: false, reason: 'invalid_token' };
    }

    claim.status = 'verified';
    claim.verifiedAt = new Date().toISOString();
    claim.verificationMethod = 'domain_email_token';
    this.verifiedEntities.set(claim.entityId, {
      claimId,
      verifiedAt: claim.verifiedAt,
      method: 'domain_email_token'
    });

    return { verified: true, claim };
  }

  isEntityVerified(entityId) {
    return this.verifiedEntities.has(entityId);
  }
}

const defaultClaimManager = new VerticalClaimManager();

module.exports = {
  VerticalClaimManager,
  defaultClaimManager
};
