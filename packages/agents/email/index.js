#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.local') });

const cron = require('node-cron');
const fs   = require('fs');
const path = require('path');
const db   = require('@secondbrain/db');
const { createLogger } = require('./logger');

const log = createLogger('email');

log.info('Email Agent starting');

async function ensureSchema() {
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, 'sql/schema.sql'), 'utf8');
    await db.query(sql);
    log.info('Schema ready');
  } catch (err) {
    log.error(`Schema setup error: ${err.message}`);
  }
}

async function fetchEmails() {
  try {
    log.info('Fetching emails...');
    const { run } = require('./cron/fetchEmails');
    await run();
    log.info('Email fetch completed');
  } catch (err) {
    log.error(`Email fetch failed: ${err.message}`);
  }
}

log.info('Scheduling email fetch every 15 minutes');

cron.schedule('*/15 * * * *', fetchEmails);

log.info('Starting initial fetch...');
ensureSchema().then(() => fetchEmails());

process.on('SIGINT', () => {
  log.info('Shutting down...');
  const pool = require('@secondbrain/db');
  pool.end().then(() => process.exit(0));
});

log.info('Email Agent running — press Ctrl+C to stop');
