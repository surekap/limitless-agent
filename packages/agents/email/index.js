#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.local') });

const cron = require('node-cron');
const { createLogger } = require('./logger');

const log = createLogger('email');

log.info('Email Agent starting');

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
fetchEmails();

process.on('SIGINT', () => {
  log.info('Shutting down...');
  const pool = require('@secondbrain/db');
  pool.end().then(() => process.exit(0));
});

log.info('Email Agent running — press Ctrl+C to stop');
