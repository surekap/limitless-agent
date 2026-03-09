/**
 * LIMITLESS v2.0 - AGENT-BASED LIFELOG PROCESSOR
 * 
 * 🎯 98% Code Reduction: 11,020 lines → ~300 lines
 * 
 * This file contains the core LifelogAgent class that replaces the entire 
 * complex intent processing system with a simple Claude-powered agent using
 * MCP (Model Context Protocol) tools.
 * 
 * ARCHITECTURE:
 * - Uses Claude Sonnet 4 for natural language understanding
 * - Multi-turn conversations handle complex workflows automatically
 * - MCP tools provide direct integration with Todoist, Notion, and stock APIs
 * - Intelligent database reuse prevents duplicates
 * - Full data population ensures databases aren't left empty
 * 
 * CORE FUNCTIONALITY:
 * - processLifelog(): Main entry point for processing individual lifelogs
 * - processBatch(): Processes multiple lifelogs for production use
 * - Multi-turn conversation loop with Claude for complex workflows
 * - Tool execution routing to appropriate MCP implementations
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * - ANTHROPIC_API_KEY: Claude API access
 * - DATABASE_URL: MySQL connection string  
 * - NOTION_TOKEN: Notion integration token
 * - TODOIST_API_TOKEN: Todoist API token
 * - PERPLEXITY_API_KEY: Stock analysis API
 */

require('dotenv').config({ path: '.env.local' });
const Anthropic = require('@anthropic-ai/sdk');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * LifelogAgent - Core agent class for processing lifelogs with Claude + MCP tools
 * 
 * Replaces 11,020 lines of complex intent processing with simple agent-based approach.
 * Uses Claude for natural language understanding and MCP tools for direct API integration.
 */
class LifelogAgent {
  /**
   * Initialize the agent with Claude client, database connection, and MCP tools
   */
  constructor() {
    // Initialize Claude client for natural language processing
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    // Initialize MySQL database connection pool
    this.db = mysql.createPool(process.env.DATABASE_URL);
    
    // Test database connection on startup
    this.initDatabase();
    
    // Initialize MCP tools dynamically
    this.tools = this.loadMCPTools();
  }

  /**
   * Process a single lifelog using Claude + MCP tools
   * 
   * This is the main entry point that:
   * 1. Formats the lifelog content for Claude
   * 2. Uses multi-turn conversation to handle complex workflows
   * 3. Routes tool calls to appropriate MCP implementations
   * 4. Ensures database reuse and full data population
   * 
   * @param {Object} lifelog - Lifelog object with id, title, markdown, etc.
   */
  async processLifelog(lifelog) {
    console.log(`🤖 Processing lifelog: ${lifelog.title}`);
    
    // Format lifelog content for Claude consumption
    const content = this.formatLifelogContent(lifelog);
    
    const prompt = `You are a lifelog processing agent. Analyze this lifelog and take ALL necessary actions to COMPLETELY fulfill the user's requests.

LIFELOG CONTENT:
${content}

CRITICAL RULES:
1. **ALWAYS REUSE EXISTING DATABASES** - Never create duplicate databases
2. **ALWAYS POPULATE DATABASES** - Don't leave databases empty
3. **SAVE ALL ANALYSES** - Stock analyses must be saved to Stock Analysis database

WORKFLOW INSTRUCTIONS:
- For "add X to database": 
  1) find_database first to check existing databases
  2) Use existing database if found, only create if none exists  
  3) add_to_database with detailed research
  
- For "analyze stock":
  1) analyze_stock to get comprehensive analysis
  2) save_stock_analysis to save results to Stock Analysis database
  
- For "create database of X and add items":
  1) find_database first to check if it exists
  2) If exists, use it; if not, create_database 
  3) add_to_database multiple times for different items
  
- For "create home theater database and research options":
  1) find_database type="home_theater" 
  2) If found, use existing; if not, create_database
  3) add_to_database for Sony, Yamaha, Denon systems etc.

CRITICAL: 
- NEVER create "Home Theater Systems India" if "Home Theater Systems" already exists
- ALWAYS populate databases with actual entries, not just create empty databases
- ALWAYS save stock analyses to the Stock Analysis database

Take ALL necessary actions to fulfill EVERY user request completely with NO duplicate databases and FULL data population.`;

    try {
      const toolDefinitions = this.tools.flatMap(tool => tool.getToolDefinitions());
      
      // Multi-turn conversation to handle complex workflows
      const messages = [{ role: 'user', content: prompt }];
      let maxTurns = 5; // Prevent infinite loops
      let turnCount = 0;
      
      while (turnCount < maxTurns) {
        turnCount++;
        console.log(`🔄 Turn ${turnCount}: Asking Claude...`);
        
        const response = await this.anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: messages,
          tools: toolDefinitions
        });

        console.log(`🧠 Claude response: ${response.content.length} content blocks`);
        
        let hasToolCalls = false;
        const toolResults = [];
        
        // Process tool calls and collect results
        for (const contentBlock of response.content) {
          if (contentBlock.type === 'tool_use') {
            console.log(`📞 Tool call found: ${contentBlock.name}`);
            hasToolCalls = true;
            
            const result = await this.executeTool(contentBlock.name, contentBlock.input);
            toolResults.push({
              tool_use_id: contentBlock.id,
              type: 'tool_result',
              content: JSON.stringify(result)
            });
          } else if (contentBlock.type === 'text') {
            console.log(`💭 Claude text: ${contentBlock.text.substring(0, 100)}...`);
          }
        }
        
        // Add Claude's response to conversation
        messages.push({ role: 'assistant', content: response.content });
        
        if (hasToolCalls) {
          // Add tool results and ask Claude to continue
          messages.push({
            role: 'user',
            content: toolResults.concat([{
              type: 'text',
              text: 'Continue with any remaining actions needed to complete the user\'s requests. If all requests are fully completed, respond with "WORKFLOW_COMPLETE".'
            }])
          });
        } else {
          // No more tool calls, check if workflow is complete
          const lastResponse = response.content.find(block => block.type === 'text')?.text || '';
          if (lastResponse.includes('WORKFLOW_COMPLETE') || !lastResponse.toLowerCase().includes('next') && !lastResponse.toLowerCase().includes('continue')) {
            console.log('✅ Claude indicates workflow is complete');
            break;
          }
        }
      }

      await this.markLifelogProcessed(lifelog.id);
      console.log(`✅ Completed processing lifelog: ${lifelog.id}`);
      
    } catch (error) {
      console.error(`❌ Error processing lifelog ${lifelog.id}:`, error.message);
    }
  }

  /**
   * Execute a tool call by routing to appropriate MCP implementation
   * 
   * @param {string} toolName - Name of tool to execute (e.g., 'create_task', 'analyze_stock')
   * @param {Object} input - Tool input parameters
   * @returns {Object} Tool execution result
   */
  async executeTool(toolName, input) {
    console.log(`🔧 Executing tool: ${toolName}`);
    
    // Route tool call to appropriate MCP handler
    for (const tool of this.tools) {
      if (tool.canHandle(toolName)) {
        try {
          const result = await tool.execute(toolName, input);
          console.log(`✅ Tool ${toolName} completed:`, result);
          return result;
        } catch (error) {
          console.error(`❌ Tool ${toolName} failed:`, error.message);
          throw error;
        }
      }
    }
    
    throw new Error(`Unknown tool: ${toolName}`);
  }

  /**
   * Format lifelog data into readable text for Claude processing
   * 
   * @param {Object} lifelog - Raw lifelog object from database
   * @returns {string} Formatted content string for Claude
   */
  formatLifelogContent(lifelog) {
    const parts = [];
    
    // Extract available lifelog fields
    if (lifelog.title) parts.push(`Title: ${lifelog.title}`);
    if (lifelog.start_time) parts.push(`Time: ${lifelog.start_time}`);
    if (lifelog.markdown) parts.push(`Content: ${lifelog.markdown}`);
    else if (lifelog.contents) {
      try {
        // Handle both string and object content formats
        const parsed = typeof lifelog.contents === 'string' 
          ? JSON.parse(lifelog.contents) 
          : lifelog.contents;
        parts.push(`Content: ${JSON.stringify(parsed)}`);
      } catch {
        parts.push(`Content: ${lifelog.contents}`);
      }
    }
    
    return parts.join('\n');
  }

  /**
   * Fetch unprocessed lifelogs from database
   * 
   * @param {number} limit - Maximum number of lifelogs to fetch (default: 10)
   * @returns {Array} Array of unprocessed lifelog objects
   */
  async getUnprocessedLifelogs(limit = 10) {
    const [rows] = await this.db.execute(
      'SELECT * FROM lifelogs WHERE processed = FALSE ORDER BY start_time DESC LIMIT ?',
      [limit]
    );
    return rows;
  }

  /**
   * Mark a lifelog as processed in the database
   * 
   * @param {string} lifelogId - ID of the lifelog to mark as processed
   * @returns {Object} Database update result
   */
  async markLifelogProcessed(lifelogId) {
    const [result] = await this.db.execute(
      'UPDATE lifelogs SET processed = TRUE WHERE id = ?',
      [lifelogId]
    );
    return result;
  }

  /**
   * Test database connection on startup
   * 
   * @private
   */
  async initDatabase() {
    try {
      await this.db.execute('SELECT 1');
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
    }
  }

  /**
   * Process a batch of unprocessed lifelogs (main production method)
   * 
   * This method is called by the production scheduler to process multiple
   * lifelogs in sequence with rate limiting to avoid API limits.
   * 
   * @param {number} batchSize - Maximum number of lifelogs to process (default: 5)
   */
  async processBatch(batchSize = 5) {
    console.log(`🚀 Starting agent-based batch processing (${batchSize} lifelogs)`);
    
    try {
      // Fetch unprocessed lifelogs from database
      const lifelogs = await this.getUnprocessedLifelogs(batchSize);
      
      if (lifelogs.length === 0) {
        console.log('No unprocessed lifelogs found');
        return;
      }

      console.log(`Found ${lifelogs.length} unprocessed lifelogs`);

      // Process each lifelog sequentially with rate limiting
      for (const lifelog of lifelogs) {
        await this.processLifelog(lifelog);
        // Small delay to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`✅ Batch completed: processed ${lifelogs.length} lifelogs`);
      
    } catch (error) {
      console.error('❌ Batch processing error:', error);
    }
  }
}

// Export the LifelogAgent class for use in other files (tests, production script)
module.exports = LifelogAgent;

/**
 * DEVELOPMENT MODE - Run agent directly for testing
 * 
 * When this file is run directly (not imported), it starts a simple
 * development mode that processes lifelogs every 30 seconds.
 * 
 * For production use, run start-production.js instead which includes
 * cron scheduling for fetching lifelogs and proper error handling.
 */
if (require.main === module) {
  console.log('🔧 DEVELOPMENT MODE - Agent only (no cron scheduling)');
  console.log('   For production use: npm start');
  console.log('   For full testing: npm run test:comprehensive\\n');
  
  const agent = new LifelogAgent();
  
  // Process batch every 30 seconds for development/testing
  setInterval(async () => {
    await agent.processBatch();
  }, 30000);
  
  // Run initial batch
  agent.processBatch();
  
  console.log('🤖 Lifelog Agent started - processing every 30 seconds');
  console.log('   Press Ctrl+C to stop\\n');
}