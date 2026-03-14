const axios = require("axios");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 429 || (typeof status === "number" && status >= 500);
}

function shouldRetryCode(code) {
  return (
    code === "ECONNABORTED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND"
  );
}

function normalizeApiUrl(apiUrl) {
  return apiUrl.replace(/\/+$/, "");
}

async function getWithRetries({
  apiKey,
  apiUrl,
  endpoint,
  params,
  timeoutMs = 30000,
  requestRetries = 4,
  retryDelayMs = 1000,
  responseType = "json",
  acceptStatuses = [200],
}) {
  const url = `${normalizeApiUrl(apiUrl)}/${endpoint.replace(/^\/+/, "")}`;

  for (let attempt = 0; attempt <= requestRetries; attempt += 1) {
    try {
      const response = await axios.get(url, {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        params,
        timeout: timeoutMs,
        responseType,
        validateStatus: () => true,
      });

      if (acceptStatuses.includes(response.status)) {
        return response;
      }

      const canRetry =
        shouldRetryStatus(response.status) && attempt < requestRetries;
      if (!canRetry) {
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data);
        throw new Error(
          `Limitless API error ${response.status} for ${endpoint}: ${body}`
        );
      }
    } catch (error) {
      if (!axios.isAxiosError(error)) throw error;

      const status = error.response?.status;
      const code = error.code;
      const noResponse = Boolean(error.request && !error.response);
      const canRetry =
        attempt < requestRetries &&
        (noResponse || shouldRetryStatus(status) || shouldRetryCode(code));

      if (!canRetry) {
        if (status) {
          throw new Error(
            `Limitless API error ${status}: ${error.response.statusText}`
          );
        }
        if (noResponse) {
          throw new Error(`Limitless API network error: no response from ${url}`);
        }
        throw new Error(`Limitless API request error: ${error.message}`);
      }
    }

    const backoff = retryDelayMs * 2 ** attempt;
    await sleep(backoff);
  }

  throw new Error(`Limitless API request failed for ${endpoint}`);
}

async function paginateCollection({
  apiKey,
  apiUrl,
  endpoint,
  collectionKey,
  baseParams = {},
  limit = null,
  batchSize = 10,
  maxPages = 2000,
  timeoutMs = 30000,
  requestRetries = 4,
  retryDelayMs = 1000,
}) {
  const allItems = [];
  const seenCursors = new Set();
  let cursor;
  let pages = 0;

  while (true) {
    pages += 1;
    if (pages > maxPages) {
      throw new Error(
        `Limitless pagination exceeded maxPages=${maxPages} for ${endpoint}`
      );
    }

    const params = {
      ...baseParams,
      limit: String(Math.max(1, batchSize)),
    };
    if (cursor) {
      params.cursor = cursor;
    }

    const response = await getWithRetries({
      apiKey,
      apiUrl,
      endpoint,
      params,
      timeoutMs,
      requestRetries,
      retryDelayMs,
    });

    const items = response.data?.data?.[collectionKey] || [];
    allItems.push(...items);

    if (limit !== null && allItems.length >= limit) {
      return allItems.slice(0, limit);
    }

    const meta = response.data?.meta || {};
    const nextCursor =
      meta?.[collectionKey]?.nextCursor || meta?.nextCursor || null;

    if (!nextCursor || items.length === 0) {
      break;
    }
    if (seenCursors.has(nextCursor)) {
      throw new Error(
        `Limitless pagination loop detected for ${endpoint} (cursor repeated: ${nextCursor})`
      );
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return allItems;
}

/**
 * Fetch lifelogs from Limitless API with cursor pagination.
 * Docs: GET /v1/lifelogs, max 10 items per request.
 */
async function getLifelogs({
  apiKey,
  apiUrl = process.env.LIMITLESS_API_URL || "https://api.limitless.ai",
  endpoint = "v1/lifelogs",
  limit = null,
  batchSize = 10,
  includeMarkdown = true,
  includeHeadings = false,
  date,
  timezone = "UTC",
  direction = "asc",
  start,
  end,
  timeoutMs = 30000,
  maxPages = 2000,
  requestRetries = 4,
  retryDelayMs = 1000,
}) {
  if (!apiKey) {
    throw new Error("Missing LIMITLESS_API_KEY");
  }
  return paginateCollection({
    apiKey,
    apiUrl,
    endpoint,
    collectionKey: "lifelogs",
    baseParams: {
      includeMarkdown: includeMarkdown.toString(),
      includeHeadings: includeHeadings.toString(),
      direction,
      timezone,
      start,
      end,
      date,
    },
    limit,
    batchSize: Math.min(10, batchSize),
    maxPages,
    timeoutMs,
    requestRetries,
    retryDelayMs,
  });
}

/**
 * Fetch chats from Limitless API with cursor pagination.
 */
async function getChats({
  apiKey,
  apiUrl = process.env.LIMITLESS_API_URL || "https://api.limitless.ai",
  endpoint = "v1/chats",
  limit = null,
  batchSize = 10,
  direction = "desc",
  isScheduled,
  timeoutMs = 30000,
  maxPages = 2000,
  requestRetries = 4,
  retryDelayMs = 1000,
}) {
  if (!apiKey) {
    throw new Error("Missing LIMITLESS_API_KEY");
  }

  const baseParams = { direction };
  if (typeof isScheduled === "boolean") {
    baseParams.isScheduled = isScheduled;
  }

  return paginateCollection({
    apiKey,
    apiUrl,
    endpoint,
    collectionKey: "chats",
    baseParams,
    limit,
    batchSize,
    maxPages,
    timeoutMs,
    requestRetries,
    retryDelayMs,
  });
}

/**
 * Download audio bytes for a given range.
 */
async function downloadAudioRange({
  apiKey,
  apiUrl = process.env.LIMITLESS_API_URL || "https://api.limitless.ai",
  endpoint = "v1/download-audio",
  startMs,
  endMs,
  audioSource,
  timeoutMs = 120000,
  requestRetries = 4,
  retryDelayMs = 1000,
}) {
  if (!apiKey) {
    throw new Error("Missing LIMITLESS_API_KEY");
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error("Invalid startMs/endMs for audio download");
  }

  const params = { startMs, endMs };
  if (audioSource && audioSource !== "auto") {
    params.audioSource = audioSource;
  }

  const response = await getWithRetries({
    apiKey,
    apiUrl,
    endpoint,
    params,
    timeoutMs,
    requestRetries,
    retryDelayMs,
    responseType: "arraybuffer",
    acceptStatuses: [200, 404],
  });

  if (response.status === 404) {
    return {
      status: "no_audio",
      httpStatus: 404,
      byteLength: 0,
      buffer: null,
      mimeType: null,
    };
  }

  const buffer = Buffer.from(response.data);
  return {
    status: "downloaded",
    httpStatus: 200,
    byteLength: buffer.length,
    buffer,
    mimeType: response.headers["content-type"] || null,
  };
}

module.exports = { getLifelogs, getChats, downloadAudioRange };
