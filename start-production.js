#!/usr/bin/env node
/**
 * LIMITLESS v2.0 - PRODUCTION DEPLOYMENT SCRIPT
 * 
 * 🎯 98% Code Reduction: 11,020 lines → ~300 lines
 * 
 * This is the main production entry point that replaces the entire complex
 * intent processing system with a simple agent-based approach.
 * 
 * WHAT THIS SCRIPT DOES:
 * - Initializes the LifelogAgent with Claude + MCP tools
 * - Sets up cron schedules for fetching and processing lifelogs
 * - Handles graceful shutdown with proper cleanup
 * - Provides production monitoring and error handling
 * 
 * PRODUCTION SCHEDULE:
 * - Fetch lifelogs: every 5 minutes (keeps existing cron functionality)
 * - Process lifelogs: every 30 seconds (agent processes batches)
 * - Rate limiting: 1 second delay between lifelog processing
 * - Batch size: 5 lifelogs per processing cycle
 * 
 * MONITORING:
 * - Real-time console logging with emojis for status
 * - Error handling with detailed error messages
 * - Graceful shutdown handling (Ctrl+C)
 * - Database connection cleanup on exit
 * 
 * USAGE:
 * - npm start (runs this script)
 * - Press Ctrl+C to stop gracefully
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * - All variables needed by LifelogAgent (see agent.js)
 * - Database connection for lifelog storage
 * - API keys for Claude, Notion, Todoist, Perplexity
 */

require('dotenv').config({ path: '.env.local' });
const LifelogAgent = require('./agent');
const cron = require('node-cron');

console.log('🚀 LIMITLESS v2.0 - Agent-based Lifelog Processor');
console.log('📈 98% code reduction from v1.0 (11,020 lines → ~300 lines)');
console.log('🤖 Powered by Claude + MCP tools\n');

/**
 * Initialize the LifelogAgent with Claude + MCP tools
 * This single agent replaces the entire 11,020-line old system
 */
const agent = new LifelogAgent();

/**
 * Fetch new lifelogs from the Limitless API
 * 
 * Keeps the existing cron functionality from the old system but now
 * feeds the simple agent instead of complex intent processing pipelines.
 */
async function fetchLifelogs() {
  try {
    console.log('📥 Fetching new lifelogs...');
    // Reuse existing fetch logic (one of the few parts we kept)
    const fetchScript = require('./cron/fetchLifelogs');
    await fetchScript();
    console.log('✅ Lifelog fetch completed');
  } catch (error) {
    console.error('❌ Lifelog fetch failed:', error.message);
  }
}

// Production schedule:
// - Fetch lifelogs every 5 minutes
// - Process lifelogs every 30 seconds

console.log('⏰ Setting up production schedules:');
console.log('   📥 Fetch lifelogs: every 5 minutes');
console.log('   🤖 Process lifelogs: every 30 seconds\n');

/**
 * PRODUCTION CRON SCHEDULES
 * 
 * These replace all the complex workflow orchestration from the old system
 * with simple periodic calls to the agent.
 */

// Fetch new lifelogs every 5 minutes (keeps existing schedule)
cron.schedule('*/5 * * * *', fetchLifelogs);

// Process lifelogs every 30 seconds with the agent (replaces complex workflows)
cron.schedule('*/30 * * * * *', async () => {
  try {
    // Single agent call replaces hundreds of lines of intent processing
    await agent.processBatch(5); // Process up to 5 lifelogs per batch
  } catch (error) {
    console.error('❌ Batch processing error:', error);
  }
});

// Initial fetch and process
console.log('🏁 Starting initial fetch and process...\n');
fetchLifelogs().then(() => {
  setTimeout(() => agent.processBatch(10), 2000); // Wait 2s for fetch to complete
});

/**
 * GRACEFUL SHUTDOWN HANDLER
 * 
 * Properly cleanup database connections and resources when the production
 * system is stopped (Ctrl+C). Much simpler than the old system's cleanup.
 */
process.on('SIGINT', async () => {
  console.log('\n🛑 Graceful shutdown initiated...');
  
  try {
    // Close database connection pool
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