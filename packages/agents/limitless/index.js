#!/usr/bin/env node
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.local') });
const LifelogAgent = require('./agent');
const cron = require('node-cron');

console.log('🚀 LIMITLESS v2.0 - Agent-based Lifelog Processor');
console.log('🤖 Powered by Claude + MCP tools\n');

const agent = new LifelogAgent();

async function fetchLifelogs() {
    try {
        console.log('📥 Fetching new lifelogs...');
        const { run } = require('./cron/fetchLifelogs');
        await run();
        console.log('✅ Lifelog fetch completed');
    } catch (error) {
        console.error('❌ Lifelog fetch failed:', error.message);
    }
}

console.log('⏰ Setting up production schedules:');
console.log('   📥 Fetch lifelogs: every 5 minutes');
console.log('   🤖 Process lifelogs: every 30 seconds\n');

cron.schedule('*/5 * * * *', fetchLifelogs);

cron.schedule('*/30 * * * * *', async () => {
    try {
        await agent.processBatch(5);
    } catch (error) {
        console.error('❌ Batch processing error:', error);
    }
});

console.log('🏁 Starting initial fetch and process...\n');
fetchLifelogs().then(() => {
    setTimeout(() => agent.processBatch(10), 2000);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Graceful shutdown initiated...');
    try {
        if (agent.db && agent.db.end) {
            await agent.db.end();
            console.log('✅ Database connections closed');
        }
    } catch (error) {
        console.error('❌ Shutdown error:', error.message);
    }
    console.log('👋 Limitless Agent shutdown complete');
    process.exit(0);
});

console.log('✨ Limitless Agent v2.0 is running in production mode');
console.log('   Press Ctrl+C to stop\n');
