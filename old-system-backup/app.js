require('dotenv').config({ path: '.env.local' });
const cron = require('node-cron');
const { run } = require('./cron/fetchLifelogs');

cron.schedule(process.env.FETCH_INTERVAL_CRON, run);
console.log('Lifelog cron job started.');
