const axios = require("axios");
const moment = require("moment-timezone");

/**
 * Fetch lifelogs from the Limitless API
 * @param {Object} options
 * @param {string} options.apiKey - Your Limitless API key
 * @param {string} [options.apiUrl] - Base API URL
 * @param {string} [options.endpoint] - API endpoint path
 * @param {number|null} [options.limit] - Max number of logs to fetch
 * @param {number} [options.batchSize] - Number of logs per request
 * @param {boolean} [options.includeMarkdown] - Include markdown field
 * @param {boolean} [options.includeHeadings] - Include headings
 * @param {string} [options.date] - Specific date to filter logs
 * @param {string} [options.timezone] - Timezone string
 * @param {"asc"|"desc"} [options.direction] - Order of logs
 * @param {string} [options.start] - Start date for filtering logs (YYYY-MM-DD)
 * @param {string} [options.end] - End date for filtering logs (YYYY-MM-DD)
 * @returns {Promise<Array>} - Array of lifelogs
 */
async function getLifelogs({
  apiKey,
  apiUrl = process.env.LIMITLESS_API_URL || "https://api.limitless.ai",
  endpoint = "v1/lifelogs",
  limit = 50,
  batchSize = 10,
  includeMarkdown = true,
  includeHeadings = false,
  date,
  timezone,
  direction = "asc",
  start,
  end,
}) {
  const allLifelogs = [];
  let cursor;

  if (limit !== null) {
    batchSize = Math.min(batchSize, limit);
  }

  while (true) {
    const params = {
      limit: batchSize.toString(),
      includeMarkdown: includeMarkdown.toString(),
      includeHeadings: includeHeadings.toString(),
      direction,
      timezone: timezone || "UTC",
      start, // Add startDate to the request
      end, // Add endDate to the request
    };

    if (date) params.date = date;
    if (cursor) params.cursor = cursor;

    console.log("Fetching lifelogs with params: ", params);

    try {
      const response = await axios.get(`${apiUrl}/${endpoint}`, {
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        params,
      });

      const lifelogs = response.data.data.lifelogs;
      console.log("Lifelogs fetched:", lifelogs.length);

      allLifelogs.push(...lifelogs);

      if (limit !== null && allLifelogs.length >= limit) {
        return allLifelogs.slice(0, limit);
      }

      const nextCursor = response.data.meta.lifelogs.nextCursor;
      if (!nextCursor || lifelogs.length < batchSize) break;

      console.log(
        `Fetched ${lifelogs.length} lifelogs, next cursor: ${nextCursor}`
      );
      cursor = nextCursor;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Log the request headers to the console
        console.error("Request headers:", error.config?.headers);
        console.error("Error response data:", error.response?.data);
        console.error("Error response headers:", error.response?.headers);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        
        if (error.response) {
          // Server responded with error status
          throw new Error(`HTTP error! Status: ${error.response.status} - ${error.response.statusText}`);
        } else if (error.request) {
          // Request was made but no response received
          throw new Error(`Network error: No response received from ${apiUrl}/${endpoint}`);
        } else {
          // Something else happened
          throw new Error(`Request error: ${error.message}`);
        }
      }
      throw error;
    }
  }

  return allLifelogs;
}

module.exports = { getLifelogs };
