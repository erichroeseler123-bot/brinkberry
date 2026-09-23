import test from 'node:test';
import assert from 'node:assert/strict';

// Mock helper to simulate request/response objects
function createMockReqRes(options = {}) {
  let statusCode = 200;
  let headers = {};
  let bodyData = '';
  let ended = false;

  const req = {
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    query: options.query || {},
    async *[Symbol.asyncIterator]() {
      if (options.body) {
        yield typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      }
    }
  };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return res;
    },
    setHeader(key, val) {
      headers[key.toLowerCase()] = val;
      return res;
    },
    json(obj) {
      bodyData = JSON.stringify(obj);
      ended = true;
      return res;
    },
    send(data) {
      bodyData = data;
      ended = true;
      return res;
    },
    end(data) {
      if (data) bodyData = data;
      ended = true;
      return res;
    }
  };

  return {
    req,
    res,
    getStatus: () => res.statusCode,
    getBody: () => bodyData,
    getJson: () => {
      try {
        return JSON.parse(bodyData);
      } catch (_) {
        return bodyData;
      }
    }
  };
}

test('Admin & Dashboard Token Security Suite', async (t) => {
  const indexHandler = (await import('../api/index.js')).default;
  const adminApiHandler = (await import('../api/admin-api.js')).default;
  const cronIngestHandler = (await import('../api/cron-ingest.js')).default;

  await t.test('1. /api/my-events rejects unauthenticated and malformed tokens with 401', async () => {
    // 1a. Missing token
    const { req: r1, res: s1, getStatus: status1, getJson: json1 } = createMockReqRes({
      url: '/api/my-events'
    });
    await indexHandler(r1, s1);
    assert.equal(status1(), 401);
    assert.equal(json1().error, 'Token required');

    // 1b. Malformed token (not a UUID) - MUST NOT return 500
    const { req: r2, res: s2, getStatus: status2, getJson: json2 } = createMockReqRes({
      url: '/api/my-events?token=bogus_token_123'
    });
    await indexHandler(r2, s2);
    assert.equal(status2(), 401);
    assert.equal(json2().error, 'Invalid management token format');

    // 1c. Arbitrary non-existent UUID token - MUST NOT return 200 { events: [] }
    const { req: r3, res: s3, getStatus: status3, getJson: json3 } = createMockReqRes({
      url: '/api/my-events?token=00000000-0000-0000-0000-000000000000'
    });
    await indexHandler(r3, s3);
    assert.equal(status3(), 401);
    assert.ok(json3().error.includes('Unauthorized'));
  });

  await t.test('2. /api/duplicate rejects unauthenticated and malformed tokens with 401', async () => {
    // 2a. Missing token
    const { req: r1, res: s1, getStatus: status1, getJson: json1 } = createMockReqRes({
      method: 'POST',
      url: '/api/duplicate',
      body: { source_id: 'test' }
    });
    await indexHandler(r1, s1);
    assert.equal(status1(), 401);
    assert.equal(json1().error, 'Token required');

    // 2b. Malformed token - MUST NOT return 500
    const { req: r2, res: s2, getStatus: status2, getJson: json2 } = createMockReqRes({
      method: 'POST',
      url: '/api/duplicate',
      body: { source_id: 'test', token: 'bogus_token_123' }
    });
    await indexHandler(r2, s2);
    assert.equal(status2(), 401);
    assert.equal(json2().error, 'Invalid management token format');
  });

  await t.test('3. /api/events/:id DELETE & PATCH in admin-api reject malformed tokens with 401', async () => {
    // 3a. DELETE with malformed token
    const { req: r1, res: s1, getStatus: status1, getJson: json1 } = createMockReqRes({
      method: 'DELETE',
      query: { id: '00000000-0000-0000-0000-000000000000', token: 'bogus_token_123' }
    });
    await adminApiHandler(r1, s1);
    assert.equal(status1(), 401);
    assert.equal(json1().error, 'Invalid management token format');

    // 3b. PATCH with malformed token
    const { req: r2, res: s2, getStatus: status2, getJson: json2 } = createMockReqRes({
      method: 'PATCH',
      query: { id: '00000000-0000-0000-0000-000000000000', token: 'bogus_token_123' },
      body: { title: 'New Title' }
    });
    await adminApiHandler(r2, s2);
    assert.equal(status2(), 401);
    assert.equal(json2().error, 'Invalid management token format');
  });

  await t.test('4. Non-interchangeable Roles: CRON_SECRET strictly for cron, ADMIN_TOKEN for admin', async () => {
    const oldCron = process.env.CRON_SECRET;
    const oldAdmin = process.env.ADMIN_TOKEN;
    const oldEnv = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    process.env.CRON_SECRET = 'dedicated_cron_secret_abc_123';
    process.env.ADMIN_TOKEN = 'dedicated_admin_token_xyz_789';

    try {
      // 4a. Cron ingestion with NO token -> 401 specifying CRON_SECRET
      const { req: r1, res: s1, getStatus: status1, getJson: json1 } = createMockReqRes({
        method: 'POST',
        url: '/api/cron-ingest'
      });
      await cronIngestHandler(r1, s1);
      assert.equal(status1(), 401);
      assert.equal(json1().error, 'Unauthorized: Valid CRON_SECRET required for cron ingestion.');

      // 4b. Cron ingestion with wrong token -> 401 specifying CRON_SECRET
      const { req: r2, res: s2, getStatus: status2, getJson: json2 } = createMockReqRes({
        method: 'POST',
        url: '/api/cron-ingest',
        headers: { authorization: 'Bearer wrong_token' }
      });
      await cronIngestHandler(r2, s2);
      assert.equal(status2(), 401);
      assert.equal(json2().error, 'Unauthorized: Valid CRON_SECRET required for cron ingestion.');

      // 4c. Administrative audit with NO token -> 401 specifying ADMIN_TOKEN
      const { req: r3, res: s3, getStatus: status3, getJson: json3 } = createMockReqRes({
        method: 'GET',
        url: '/api/cron-ingest?source=supabase_audit'
      });
      await cronIngestHandler(r3, s3);
      assert.equal(status3(), 401);
      assert.equal(json3().error, 'Unauthorized: Valid ADMIN_TOKEN required for administrative audit.');

      // 4d. Administrative audit with CRON_SECRET -> REJECTED (roles not interchangeable)
      const { req: r4, res: s4, getStatus: status4, getJson: json4 } = createMockReqRes({
        method: 'GET',
        url: '/api/cron-ingest?source=supabase_audit',
        headers: { authorization: 'Bearer dedicated_cron_secret_abc_123' }
      });
      await cronIngestHandler(r4, s4);
      assert.equal(status4(), 401);
      assert.equal(json4().error, 'Unauthorized: Valid ADMIN_TOKEN required for administrative audit.');

      // 4e. Administrative audit with ADMIN_TOKEN -> SUCCESS
      const { req: r5, res: s5, getStatus: status5, getJson: json5 } = createMockReqRes({
        method: 'GET',
        url: '/api/cron-ingest?source=supabase_audit',
        headers: { authorization: 'Bearer dedicated_admin_token_xyz_789' }
      });
      await cronIngestHandler(r5, s5);
      assert.equal(status5(), 200);
      assert.equal(json5().success, true);
      assert.equal(json5().zeroRowProofVerified, true);
    } finally {
      process.env.CRON_SECRET = oldCron;
      process.env.ADMIN_TOKEN = oldAdmin;
      process.env.VERCEL_ENV = oldEnv;
    }
  });

});
