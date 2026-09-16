class ProviderFetchError extends Error {
  constructor(provider, status, message) {
    super(`[${provider}] HTTP ${status}: ${message}`);
    this.name = 'ProviderFetchError';
    this.provider = provider;
    this.status = status;
  }
}

/**
 * Fetch wrapper with bounded exponential backoff, jitter, timeout handling, and timer cleanup.
 *
 * Retries: Timeouts, 429 (Rate Limit), 5xx (Server Errors).
 * Fails fast: 4xx client errors (400, 401, 403, 404, etc.) without retrying.
 */
async function fetchProviderWithRetry(provider, url, options = {}, retryOptions = {}) {
  const {
    maxRetries = 3,
    initialDelayMs = 200,
    maxDelayMs = 2000,
    backoffFactor = 2,
    timeoutMs = 5000,
    fetchFn = fetch
  } = retryOptions;

  let attempt = 0;
  let delay = initialDelayMs;
  const startTime = Date.now();
  const maxTotalBudgetMs = timeoutMs * (maxRetries + 1) + maxDelayMs * maxRetries;

  while (attempt <= maxRetries) {
    if (Date.now() - startTime > maxTotalBudgetMs) {
      throw new Error(`[${provider}] Total retry time budget (${maxTotalBudgetMs}ms) exceeded`);
    }

    const controller = new AbortController();
    let timer = null;

    try {
      const fetchPromise = fetchFn(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Brinkberry-Ingestion/1.0',
          ...(options.headers || {})
        }
      });

      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`[${provider}] Request timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      clearTimeout(timer);
      timer = null;

      if (response.ok) {
        return await response.json();
      }

      // Handle 429 Rate Limit and 5xx Server Errors
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt === maxRetries) {
          const bodyText = await response.text().catch(() => '');
          throw new ProviderFetchError(provider, response.status, bodyText);
        }

        const jitter = Math.random() * 100;
        const sleepTime = Math.min(delay + jitter, maxDelayMs);
        await new Promise(r => setTimeout(r, sleepTime));
        delay *= backoffFactor;
        attempt++;
        continue;
      }

      // Fast-fail ordinary 4xx errors
      const bodyText = await response.text().catch(() => '');
      throw new ProviderFetchError(provider, response.status, bodyText);
    } catch (err) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (err instanceof ProviderFetchError && err.status < 500 && err.status !== 429) {
        throw err;
      }

      if (attempt >= maxRetries) {
        throw err;
      }

      attempt++;
      const sleepTime = Math.min(delay, maxDelayMs);
      await new Promise(r => setTimeout(r, sleepTime));
      delay *= backoffFactor;
    }
  }

  throw new Error(`[${provider}] Failed after ${maxRetries} retry attempts`);
}

module.exports = {
  fetchProviderWithRetry,
  ProviderFetchError
};
