require('dotenv').config({ path: '.env.local' });
const cron = require('node-cron');
const intentProcessor = require('./services/intentProcessor');
const handlerRegistry = require('./services/handlerRegistry');
const { getLifelogs } = require('./services/limitless');
const { saveLifelogsToDB } = require('./cron/fetchLifelogs');

class LifelogProcessingServer {
  constructor() {
    this.isRunning = false;
    this.stats = {
      totalProcessed: 0,
      successfulProcessed: 0,
      failedProcessed: 0,
      lastRunTime: null
    };
  }

  async start() {
    console.log('🚀 Starting Lifelog Processing Server...');
    
    try {
      await this.initializeHandlers();
      this.scheduleJobs();
      this.isRunning = true;
      
      console.log('✅ Server started successfully!');
      console.log('📊 Server will process lifelogs based on configured schedule');
      
      this.logStatus();
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  async initializeHandlers() {
    console.log('🔧 Initializing handlers...');
    
    const defaultHandlers = [
      {
        name: 'send_email',
        description: 'Send an email to specified recipients',
        schema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Email recipient' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body content' }
          },
          required: ['to', 'subject', 'body']
        }
      },
      {
        name: 'create_todo',
        description: 'Create a new todo item',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Todo title' },
            description: { type: 'string', description: 'Todo description' },
            due_date: { type: 'string', format: 'date', description: 'Due date (YYYY-MM-DD)' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority level' }
          },
          required: ['title']
        }
      },
      {
        name: 'mark_todo_complete',
        description: 'Mark a todo item as complete',
        schema: {
          type: 'object',
          properties: {
            todoId: { type: 'string', description: 'Todo item ID' },
            completionNote: { type: 'string', description: 'Optional completion note' }
          },
          required: ['todoId']
        }
      }
    ];

    for (const handler of defaultHandlers) {
      await handlerRegistry.registerHandler(
        handler.name,
        handler.description,
        handler.schema
      );
    }

    await handlerRegistry.loadHandlersFromDatabase();
    console.log(`✅ Initialized ${handlerRegistry.getAllHandlers().length} handlers`);
  }

  scheduleJobs() {
    const fetchInterval = process.env.FETCH_INTERVAL_CRON || '*/5 * * * *';
    const processInterval = process.env.PROCESS_INTERVAL_CRON || '*/2 * * * *';

    console.log(`📅 Scheduling lifelog fetch job: ${fetchInterval}`);
    cron.schedule(fetchInterval, () => {
      this.fetchNewLifelogs();
    });

    console.log(`📅 Scheduling lifelog processing job: ${processInterval}`);
    cron.schedule(processInterval, () => {
      this.processLifelogs();
    });

    cron.schedule('0 */6 * * *', () => {
      this.logStats();
    });
  }

  async fetchNewLifelogs() {
    if (!this.isRunning) return;
    
    console.log('🔄 Fetching new lifelogs...');
    
    try {
      // Use proper incremental fetch logic like in cron/fetchLifelogs.js
      const { getLatestStartTime } = require('./cron/fetchLifelogs');
      
      const days = parseInt(process.env.FETCH_DAYS || '7', 10);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      // Get the latest start time from database for incremental fetching
      const latestStartTime = await getLatestStartTime();
      console.log('Latest start time from DB:', latestStartTime);
      
      let adjustedStartDate = latestStartTime ? new Date(latestStartTime) : startDate;
      
      // If we have a latest start time, add 1 second to avoid fetching the same log again
      if (latestStartTime) {
        adjustedStartDate.setSeconds(adjustedStartDate.getSeconds() + 1);
      }

      // Format for API - use proper timezone handling
      const formattedStartDate = adjustedStartDate.toISOString().slice(0, 19).replace('T', ' ');
      
      // Fix: Add 1 day to end date to ensure we capture all of today's lifelogs
      const tomorrowDate = new Date(endDate);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const formattedEndDate = tomorrowDate.toISOString().split('T')[0];

      console.log('Incremental fetch parameters:', {
        days,
        latestStartTime,
        adjustedStartDate: adjustedStartDate.toISOString(),
        formattedStartDate,
        formattedEndDate
      });

      const lifelogs = await getLifelogs({
        apiKey: process.env.LIMITLESS_API_KEY,
        start: formattedStartDate,
        end: formattedEndDate,
        timezone: 'Asia/Kolkata', // Use Indian timezone
        limit: 100
      });

      if (lifelogs.length > 0) {
        console.log('Fetched lifelogs sample:', {
          count: lifelogs.length,
          firstLogId: lifelogs[0]?.id,
          firstLogTitle: lifelogs[0]?.title,
          firstLogStartTime: lifelogs[0]?.startTime,
          lastLogId: lifelogs[lifelogs.length - 1]?.id,
          lastLogStartTime: lifelogs[lifelogs.length - 1]?.startTime
        });
        
        await saveLifelogsToDB(lifelogs);
        console.log(`✅ Fetched and saved ${lifelogs.length} new lifelogs`);
      } else {
        console.log('ℹ️  No new lifelogs to fetch');
      }
      
    } catch (error) {
      console.error('❌ Error fetching lifelogs:', error.message);
      console.error('Stack trace:', error.stack);
    }
  }

  async processLifelogs() {
    if (!this.isRunning) return;
    
    console.log('🧠 Processing lifelogs for intent extraction...');
    this.stats.lastRunTime = new Date();
    
    try {
      const batchSize = parseInt(process.env.PROCESSING_BATCH_SIZE || '5', 10);
      await intentProcessor.processBatch(batchSize);
      
      console.log('✅ Lifelog processing completed');
      
    } catch (error) {
      console.error('❌ Error processing lifelogs:', error);
      this.stats.failedProcessed++;
    }
  }

  async logStats() {
    try {
      const stats = await intentProcessor.getProcessingStats();
      console.log('\n📊 Processing Statistics (Last 7 days):');
      console.log('=====================================');
      
      if (stats.length === 0) {
        console.log('No processing activity in the last 7 days');
      } else {
        stats.forEach(stat => {
          console.log(`Handler: ${stat.handler_name || 'Unknown'}`);
          console.log(`  Total Processed: ${stat.total_processed}`);
          console.log(`  Successful: ${stat.successful}`);
          console.log(`  Failed: ${stat.failed}`);
          console.log(`  Avg Duration: ${Math.round(stat.avg_duration_ms || 0)}ms`);
          console.log('');
        });
      }
      
      console.log(`Server Status: ${this.isRunning ? '🟢 Running' : '🔴 Stopped'}`);
      console.log(`Last Processing Run: ${this.stats.lastRunTime || 'Never'}`);
      console.log('=====================================\n');
      
    } catch (error) {
      console.error('Error logging stats:', error);
    }
  }

  logStatus() {
    console.log('\n🔄 Server Status:');
    console.log('================');
    console.log(`Status: ${this.isRunning ? '🟢 Running' : '🔴 Stopped'}`);
    console.log(`Fetch Interval: ${process.env.FETCH_INTERVAL_CRON || '*/5 * * * *'}`);
    console.log(`Process Interval: ${process.env.PROCESS_INTERVAL_CRON || '*/2 * * * *'}`);
    console.log(`Batch Size: ${process.env.PROCESSING_BATCH_SIZE || '5'}`);
    console.log(`Fetch Days: ${process.env.FETCH_DAYS || '1'}`);
    console.log('================\n');
  }

  async stop() {
    console.log('🛑 Stopping Lifelog Processing Server...');
    this.isRunning = false;
    console.log('✅ Server stopped');
  }
}

const server = new LifelogProcessingServer();

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

server.start().catch(console.error);

module.exports = server;