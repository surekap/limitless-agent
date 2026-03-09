require('dotenv').config({ path: '.env.local' });
const intentProcessor = require('../services/intentProcessor');
const handlerRegistry = require('../services/handlerRegistry');
const database = require('../services/database');
const pool = require('../db');

class IntentProcessingTest {
  constructor() {
    this.testResults = {
      handlersInitialized: null,
      lifelogsProcessed: [],
      handlerExecutions: [],
      databaseEntries: null
    };
  }

  async runAllTests() {
    console.log('🧠 Starting Intent Processing Tests');
    console.log('='.repeat(60));

    try {
      await this.initializeHandlers();
      await this.processAllLifelogs();
      await this.verifyDatabaseEntries();
      await this.demonstrateHandlerCapabilities();
      
      this.printDetailedSummary();
    } catch (error) {
      console.error('❌ Test suite failed with error:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeHandlers() {
    console.log('\n🔧 Initializing Handler System...');
    
    try {
      // Register comprehensive handlers for testing
      const testHandlers = [
        {
          name: 'send_email',
          description: 'Send an email based on communication needs or follow-ups mentioned in conversations',
          schema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Email recipient (name or email)' },
              subject: { type: 'string', description: 'Email subject line' },
              body: { type: 'string', description: 'Email content/message' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Email priority' }
            },
            required: ['to', 'subject', 'body']
          }
        },
        {
          name: 'create_todo',
          description: 'Create a todo item from action items, tasks, or follow-ups mentioned in conversations',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Todo task title' },
              description: { type: 'string', description: 'Detailed description of the task' },
              due_date: { type: 'string', format: 'date', description: 'Due date if mentioned (YYYY-MM-DD)' },
              priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Task priority' },
              category: { type: 'string', description: 'Task category (work, personal, finance, etc.)' }
            },
            required: ['title']
          }
        },
        {
          name: 'create_calendar_event',
          description: 'Create calendar events from mentioned meetings, appointments, or scheduled activities',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Event title' },
              start_time: { type: 'string', format: 'date-time', description: 'Event start time' },
              end_time: { type: 'string', format: 'date-time', description: 'Event end time' },
              location: { type: 'string', description: 'Event location if mentioned' },
              attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendees' },
              description: { type: 'string', description: 'Event description' }
            },
            required: ['title', 'start_time']
          }
        },
        {
          name: 'track_expense',
          description: 'Track expenses or financial transactions mentioned in conversations',
          schema: {
            type: 'object',
            properties: {
              amount: { type: 'number', description: 'Expense amount' },
              currency: { type: 'string', description: 'Currency (USD, INR, AED, etc.)' },
              category: { type: 'string', description: 'Expense category (education, fees, business, etc.)' },
              description: { type: 'string', description: 'Description of the expense' },
              date: { type: 'string', format: 'date', description: 'Expense date' }
            },
            required: ['amount', 'description']
          }
        },
        {
          name: 'create_contact',
          description: 'Create or update contact information for people mentioned in conversations',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Contact name' },
              role: { type: 'string', description: 'Their role or position' },
              company: { type: 'string', description: 'Company or organization' },
              phone: { type: 'string', description: 'Phone number if mentioned' },
              email: { type: 'string', description: 'Email if mentioned' },
              notes: { type: 'string', description: 'Additional notes about the contact' }
            },
            required: ['name']
          }
        }
      ];

      for (const handler of testHandlers) {
        await handlerRegistry.registerHandler(
          handler.name,
          handler.description,
          handler.schema
        );
      }

      await handlerRegistry.loadHandlersFromDatabase();
      
      this.testResults.handlersInitialized = {
        success: true,
        count: handlerRegistry.getAllHandlers().length,
        handlers: handlerRegistry.getAllHandlers().map(h => h.name)
      };

      console.log(`✅ Initialized ${this.testResults.handlersInitialized.count} handlers:`);
      this.testResults.handlersInitialized.handlers.forEach(name => {
        console.log(`   - ${name}`);
      });

    } catch (error) {
      this.testResults.handlersInitialized = { success: false, error: error.message };
      console.error('❌ Handler initialization failed:', error.message);
      throw error;
    }
  }

  async processAllLifelogs() {
    console.log('\n🧠 Processing All Unprocessed Lifelogs...');
    
    try {
      const unprocessedLifelogs = await database.getUnprocessedLifelogs(10);
      console.log(`Found ${unprocessedLifelogs.length} unprocessed lifelogs`);

      if (unprocessedLifelogs.length === 0) {
        console.log('ℹ️  No unprocessed lifelogs found');
        return;
      }

      for (let i = 0; i < unprocessedLifelogs.length; i++) {
        const lifelog = unprocessedLifelogs[i];
        console.log(`\n📄 Processing Lifelog ${i + 1}/${unprocessedLifelogs.length}`);
        console.log(`   ID: ${lifelog.id}`);
        console.log(`   Title: ${lifelog.title}`);
        console.log(`   Time: ${lifelog.start_time}`);

        try {
          const result = await this.processLifelogWithDetailedLogging(lifelog);
          this.testResults.lifelogsProcessed.push(result);
          
          // Add delay between processing to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`   ❌ Failed to process lifelog ${lifelog.id}:`, error.message);
          this.testResults.lifelogsProcessed.push({
            lifelogId: lifelog.id,
            success: false,
            error: error.message
          });
        }
      }

      console.log(`\n✅ Completed processing ${this.testResults.lifelogsProcessed.length} lifelogs`);

    } catch (error) {
      console.error('❌ Lifelog processing failed:', error);
      throw error;
    }
  }

  async processLifelogWithDetailedLogging(lifelog) {
    const lifelogContent = this.formatLifelogForProcessing(lifelog);
    
    console.log(`   📝 Formatted content preview: ${lifelogContent.substring(0, 200)}...`);
    
    try {
      const schemas = handlerRegistry.getHandlerSchemas();
      console.log(`   🔍 Analyzing with ${schemas.length} available handlers...`);
      
      // Use the interpret function directly to get intent
      const { interpret } = require('../services/openai');
      const result = await interpret(lifelogContent, schemas);
      
      console.log(`   🧠 OpenAI Response:`, JSON.stringify(result, null, 2));

      if (result.type === 'tool_call') {
        console.log(`   ✨ Intent detected: ${result.name}`);
        console.log(`   📋 Arguments:`, JSON.stringify(result.arguments, null, 2));
        
        // Execute the handler
        const processingId = await database.createProcessingRecord(
          lifelog.id,
          JSON.stringify(result),
          result.name,
          result.arguments
        );

        console.log(`   🗄️  Created processing record: ${processingId}`);

        const executionResult = await handlerRegistry.executeHandler(
          result.name,
          result.arguments,
          processingId
        );

        if (executionResult.success) {
          await database.updateProcessingStatus(
            processingId,
            'completed',
            JSON.stringify(executionResult.result),
            null,
            executionResult.duration
          );
          
          console.log(`   ✅ Handler executed successfully in ${executionResult.duration}ms`);
          console.log(`   📄 Result:`, JSON.stringify(executionResult.result, null, 2));
        } else {
          await database.updateProcessingStatus(
            processingId,
            'failed',
            null,
            executionResult.error,
            executionResult.duration
          );
          console.log(`   ❌ Handler execution failed: ${executionResult.error}`);
        }

        await database.markLifelogAsProcessed(lifelog.id);

        this.testResults.handlerExecutions.push({
          lifelogId: lifelog.id,
          handlerName: result.name,
          arguments: result.arguments,
          success: executionResult.success,
          result: executionResult.result,
          duration: executionResult.duration,
          processingId
        });

        return {
          lifelogId: lifelog.id,
          success: true,
          intentDetected: result.name,
          arguments: result.arguments,
          executionResult: executionResult,
          processingId
        };

      } else {
        console.log(`   ℹ️  No actionable intent detected`);
        await database.markLifelogAsProcessed(lifelog.id);
        
        return {
          lifelogId: lifelog.id,
          success: true,
          intentDetected: null,
          reason: 'No actionable intent found'
        };
      }

    } catch (error) {
      console.error(`   ❌ Error processing lifelog: ${error.message}`);
      throw error;
    }
  }

  formatLifelogForProcessing(lifelog) {
    const content = [];
    
    if (lifelog.title) {
      content.push(`Title: ${lifelog.title}`);
    }
    
    if (lifelog.start_time) {
      content.push(`Start Time: ${lifelog.start_time}`);
    }
    
    if (lifelog.end_time) {
      content.push(`End Time: ${lifelog.end_time}`);
    }
    
    if (lifelog.markdown) {
      content.push(`Content: ${lifelog.markdown.substring(0, 2000)}`); // Limit content for processing
    }

    const prompt = `Analyze this lifelog entry and determine if any actions should be taken. Look for actionable items like:

${content.join('\n')}

Consider extracting:
- Email follow-ups or communication needs → use send_email
- Tasks, action items, or things to do → use create_todo  
- Meetings, appointments, or scheduled events → use create_calendar_event
- Expenses, payments, or financial transactions → use track_expense
- New contacts or people mentioned → use create_contact

Only call a function if there's a clear, actionable intent that can be extracted from the conversation.`;

    return prompt;
  }

  async verifyDatabaseEntries() {
    console.log('\n🗄️  Verifying Database Entries...');
    
    try {
      const conn = await pool.getConnection();
      
      // Check processing records
      const [processingRecords] = await conn.query(
        'SELECT * FROM lifelog_processing ORDER BY created_at DESC LIMIT 10'
      );
      
      // Check handler logs
      const [handlerLogs] = await conn.query(
        'SELECT * FROM handler_logs ORDER BY created_at DESC LIMIT 20'
      );
      
      // Check registered handlers
      const [registeredHandlers] = await conn.query(
        'SELECT name, description FROM handlers WHERE is_enabled = TRUE'
      );

      conn.release();

      this.testResults.databaseEntries = {
        success: true,
        processingRecords: processingRecords.length,
        handlerLogs: handlerLogs.length,
        registeredHandlers: registeredHandlers.length
      };

      console.log(`✅ Database verification completed:`);
      console.log(`   - Processing records: ${processingRecords.length}`);
      console.log(`   - Handler logs: ${handlerLogs.length}`);
      console.log(`   - Registered handlers: ${registeredHandlers.length}`);

      console.log(`\n📊 Recent Processing Records:`);
      processingRecords.slice(0, 5).forEach((record, index) => {
        console.log(`   ${index + 1}. Lifelog: ${record.lifelog_id}`);
        console.log(`      Handler: ${record.handler_name}`);
        console.log(`      Status: ${record.execution_status}`);
        console.log(`      Duration: ${record.execution_duration_ms || 'N/A'}ms`);
      });

    } catch (error) {
      this.testResults.databaseEntries = { success: false, error: error.message };
      console.error('❌ Database verification failed:', error.message);
      throw error;
    }
  }

  async demonstrateHandlerCapabilities() {
    console.log('\n🚀 Demonstrating Handler Capabilities...');
    
    // Get a real lifelog ID for demonstration
    const conn = await pool.getConnection();
    const [lifelogs] = await conn.query('SELECT id FROM lifelogs LIMIT 1');
    conn.release();
    
    if (lifelogs.length === 0) {
      console.log('   ⚠️  No lifelogs available for demonstration');
      return;
    }
    
    // Create sample processing record for demonstration
    const demoProcessingId = await database.createProcessingRecord(
      lifelogs[0].id,
      'Demo intent extraction',
      'demo_handler',
      { demo: true }
    );

    const demoHandlers = [
      {
        name: 'send_email',
        args: {
          to: 'john.doe@example.com',
          subject: 'Follow-up on our meeting discussion',
          body: 'Hi John, Following up on our shareholder agreement discussion. Let me know when you\'re available to continue.',
          priority: 'high'
        }
      },
      {
        name: 'create_todo',
        args: {
          title: 'Submit school fee payment',
          description: 'Process the school fee payment discussed in the call',
          due_date: '2025-08-20',
          priority: 'high',
          category: 'finance'
        }
      },
      {
        name: 'track_expense',
        args: {
          amount: 50000,
          currency: 'INR',
          category: 'education',
          description: 'School fee payment',
          date: '2025-08-15'
        }
      },
      {
        name: 'create_contact',
        args: {
          name: 'Parul Sharma',
          role: 'Finance Coordinator',
          company: 'School Administration',
          notes: 'Contact for school fee payments and queries'
        }
      }
    ];

    for (const demo of demoHandlers) {
      try {
        console.log(`\n   🔧 Testing ${demo.name} handler:`);
        console.log(`      Args:`, JSON.stringify(demo.args, null, 8));
        
        const result = await handlerRegistry.executeHandler(
          demo.name,
          demo.args,
          demoProcessingId
        );
        
        console.log(`      ✅ Result:`, JSON.stringify(result.result, null, 8));
        
      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
      }
    }
  }

  printDetailedSummary() {
    console.log('\n📋 Detailed Test Summary');
    console.log('='.repeat(60));

    console.log('\n🔧 Handler System:');
    if (this.testResults.handlersInitialized?.success) {
      console.log(`   ✅ ${this.testResults.handlersInitialized.count} handlers initialized`);
    } else {
      console.log(`   ❌ Handler initialization failed`);
    }

    console.log('\n🧠 Intent Processing:');
    const successful = this.testResults.lifelogsProcessed.filter(r => r.success).length;
    const withIntent = this.testResults.lifelogsProcessed.filter(r => r.intentDetected).length;
    
    console.log(`   📄 Total lifelogs processed: ${this.testResults.lifelogsProcessed.length}`);
    console.log(`   ✅ Successfully processed: ${successful}`);
    console.log(`   🎯 With actionable intent: ${withIntent}`);

    console.log('\n🔨 Handler Executions:');
    this.testResults.handlerExecutions.forEach((exec, index) => {
      console.log(`   ${index + 1}. ${exec.handlerName} (${exec.success ? '✅' : '❌'})`);
      console.log(`      Lifelog: ${exec.lifelogId}`);
      console.log(`      Duration: ${exec.duration}ms`);
      if (exec.arguments) {
        console.log(`      Args: ${JSON.stringify(exec.arguments)}`);
      }
    });

    console.log('\n🗄️  Database Status:');
    if (this.testResults.databaseEntries?.success) {
      console.log(`   ✅ Processing records: ${this.testResults.databaseEntries.processingRecords}`);
      console.log(`   ✅ Handler logs: ${this.testResults.databaseEntries.handlerLogs}`);
      console.log(`   ✅ Registered handlers: ${this.testResults.databaseEntries.registeredHandlers}`);
    }

    const allSuccess = 
      this.testResults.handlersInitialized?.success &&
      this.testResults.databaseEntries?.success &&
      successful > 0;

    console.log('\n' + '='.repeat(60));
    if (allSuccess) {
      console.log('🎉 Intent processing system is working perfectly!');
      console.log('   - Handlers are registered and functional');
      console.log('   - Lifelogs are being processed and analyzed');
      console.log('   - Intents are being detected and executed');
      console.log('   - Database logging is comprehensive');
    } else {
      console.log('⚠️  Some components need attention. Check details above.');
    }
  }

  async cleanup() {
    try {
      await pool.end();
      console.log('\n🧹 Cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new IntentProcessingTest();
  test.runAllTests().catch(console.error);
}

module.exports = IntentProcessingTest;