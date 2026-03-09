require("dotenv").config({ path: ".env.local" });
const pool = require("../db");
const { getLifelogs } = require("../services/limitless");

async function saveLifelogsToDB(logs) {
  const conn = await pool.getConnection();

  try {
    for (const log of logs) {
      // Convert start_time and end_time to UTC and format as MySQL DATETIME strings

      if (log.startTime) {
        log.start_time = new Date(log.startTime)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      }
      if (log.endTime) {
        log.end_time = new Date(log.endTime)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");
      }

      await conn.query(
        `INSERT INTO lifelogs (id, title, start_time, end_time, contents, markdown) VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE title = VALUES(title), start_time = VALUES(start_time), end_time = VALUES(end_time), contents = VALUES(contents), markdown = VALUES(markdown)`,
        [
          log.id,
          log.title,
          log.start_time || null, // Pass null if start_time is not available
          log.end_time || null, // Pass null if end_time is not available
          JSON.stringify(log.contents || ""),
          log.markdown || "",
        ]
      );
    }
  } finally {
    console.log("All lifelogs saved to database.");
    conn.release();
  }
}

async function getLatestStartTime() {
  const conn = await pool.getConnection();
  try {
    // Get the absolute latest start_time without any date filtering
    // This ensures we always resume from the most recent lifelog
    const [rows] = await conn.query(
      `SELECT MAX(start_time) AS latest_start_time FROM lifelogs`
    );
    return rows[0]?.latest_start_time || null;
  } finally {
    conn.release();
  }
}

async function run() {
  const days = parseInt(process.env.FETCH_DAYS || "10", 10); // Default to 10 days if not specified
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  // Query the database for the latest start_time within the N-day window
  const latestStartTime = await getLatestStartTime();
  console.log("latest start time:", latestStartTime);
  let adjustedStartDate = latestStartTime
    ? new Date(latestStartTime)
    : startDate;

  // Format adjustedStartDate as "YYYY-MM-DD HH:mm:SS"
  const formattedStartDate = adjustedStartDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  console.log(formattedStartDate);
  const lifelogs = await getLifelogs({
    apiKey: process.env.LIMITLESS_API_KEY,
    start: formattedStartDate, // Pass formatted start date
    end: endDate.toISOString().split("T")[0], // Format as YYYY-MM-DD
  });

  console.log(`Fetched ${lifelogs.length} lifelogs from Limitless API.`);
  console.log("Saving lifelogs to database...");

  await saveLifelogsToDB(lifelogs);
  console.log("Lifelogs saved successfully.");

  await pool.end();
  process.exit(0);
}

if (require.main === module) run();

module.exports = { run, saveLifelogsToDB, getLatestStartTime };
