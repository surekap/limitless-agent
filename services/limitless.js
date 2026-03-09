const axios = require("axios");

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
}) {
  if (!apiKey) {
    throw new Error("Missing LIMITLESS_API_KEY");
  }

  const allLifelogs = [];
  let cursor;
  const perRequestLimit = Math.max(1, Math.min(10, batchSize));
  const seenCursors = new Set();
  let pages = 0;

  while (true) {
    pages += 1;
    if (pages > maxPages) {
      throw new Error(
        `Limitless pagination exceeded maxPages=${maxPages} for ${start || "?"}..${end || "?"}`
      );
    }

    const params = {
      limit: perRequestLimit.toString(),
      includeMarkdown: includeMarkdown.toString(),
      includeHeadings: includeHeadings.toString(),
      direction,
      timezone,
      start,
      end,
    };

    if (date) params.date = date;
    if (cursor) params.cursor = cursor;

    let response;
    try {
      response = await axios.get(`${apiUrl}/${endpoint}`, {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        params,
        timeout: timeoutMs,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          throw new Error(
            `Limitless API error ${error.response.status}: ${error.response.statusText}`
          );
        }
        if (error.request) {
          throw new Error(
            `Limitless API network error: no response from ${apiUrl}/${endpoint}`
          );
        }
      }
      throw error;
    }

    const lifelogs = response.data?.data?.lifelogs || [];
    allLifelogs.push(...lifelogs);

    if (limit !== null && allLifelogs.length >= limit) {
      return allLifelogs.slice(0, limit);
    }

    const nextCursor = response.data?.meta?.lifelogs?.nextCursor;
    if (!nextCursor || lifelogs.length === 0) break;
    if (seenCursors.has(nextCursor)) {
      throw new Error(
        `Limitless pagination loop detected (cursor repeated: ${nextCursor})`
      );
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return allLifelogs;
}

module.exports = { getLifelogs };
