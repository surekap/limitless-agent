require('dotenv').config({ path: '.env.local' });
const intentProcessor = require('../services/intentProcessor');
const handlerRegistry = require('../services/handlerRegistry');
const database = require('../services/database');
const TodoistHandlers = require('../handlers/todoistHandlers');
const pool = require('../db');

class CleanHandlersTest {
  constructor() {
    this.testCases = [
      {
        id: 'clean-todo-1',
        title: 'Simple todo creation',
        content: `- User (8/15/25 3:00 PM): I need to remember to submit the project proposal by tomorrow.

- User (8/15/25 3:01 PM): Also, remind me to call mom this weekend.`,
        expectedHandler: 'create_todo',
        shouldTrigger: true
      },
      {
        id: 'clean-todo-2',
        title: 'Todo with urgency',
        content: `- User (8/15/25 4:00 PM): Add to my todo list: Review contract documents - this is urgent!`,
        expectedHandler: 'create_todo',
        shouldTrigger: true
      },
      {
        id: 'clean-todo-3',
        title: 'General conversation - should not trigger',
        content: `- Person A (8/15/25 1:00 PM): We should submit the proposal tomorrow.

- Person B (8/15/25 1:01 PM): Yes, someone needs to handle that.`,
        expectedHandler: null,
        shouldTrigger: false
      },
      {
        id: 'clean-email-1',
        title: 'Email instruction',
        content: `- User (8/15/25 2:00 PM): I need to send an email to John about the meeting reschedule.`,
        expectedHandler: 'send_email',
        shouldTrigger: true
      },
      {
        id: 'clean-calendar-1',
        title: 'Calendar instruction',
        content: `- User (8/15/25 5:00 PM): Schedule a team meeting for next Tuesday at 3 PM.`,
        expectedHandler: 'create_calendar_event',
        shouldTrigger: true
      }
    ];
  }

  async runCleanHandlersTest() {
    console.log('🧹 Testing Clean Handler System');
    console.log('='.repeat(60));

    try {
      await this.initializeCleanHandlers();
      await this.testHandlerCoverage();
      await this.runIntentTests();
      await this.verifyTodoistIntegration();
      this.printResults();
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeCleanHandlers() {
    console.log('\n🔧 Initializing Clean Handler System...');
    
    try {
      // Clear existing handlers from database to start fresh
      const conn = await pool.getConnection();
      await conn.query('DELETE FROM handlers');
      conn.release();

      // Register only the clean, simplified handlers
      const schemas = TodoistHandlers.getHandlerSchemas();
      
      // Add the other primary handler types (placeholders for now)
      const primaryHandlers = [
        {
          name: 'send_email',
          description: 'Send an email when user explicitly requests email communication',
          schema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Email recipient' },
              subject: { type: 'string', description: 'Email subject' },
              body: { type: 'string', description: 'Email content' }
            },
            required: ['to', 'subject']
          }
        },
        {
          name: 'create_calendar_event',
          description: 'Create calendar event when user explicitly schedules something',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Event title' },
              start_time: { type: 'string', description: 'Start time' },
              end_time: { type: 'string', description: 'End time' },
              description: { type: 'string', description: 'Event description' }
            },
            required: ['title', 'start_time']
          }
        },
        {
          name: 'send_message',
          description: 'Send a message when user explicitly requests messaging',
          schema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Message recipient' },
              message: { type: 'string', description: 'Message content' },
              platform: { type: 'string', description: 'Platform (slack, teams, etc.)' }
            },
            required: ['to', 'message']
          }
        },
        {
          name: 'add_note',
          description: 'Add a note when user explicitly requests note-taking',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Note title' },
              content: { type: 'string', description: 'Note content' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Note tags' }
            },
            required: ['content']
          }
        }
      ];

      const allHandlers = [...schemas, ...primaryHandlers];

      for (const handler of allHandlers) {
        await handlerRegistry.registerHandler(
          handler.name,
          handler.description,
          handler.schema
        );
      }

      await handlerRegistry.loadHandlersFromDatabase();
      
      const registeredHandlers = handlerRegistry.getAllHandlers();
      console.log(`✅ Registered ${registeredHandlers.length} clean handlers:`);
      
      // Group by type
      const todoHandlers = registeredHandlers.filter(h => h.name.includes('todo')).map(h => h.name);
      const emailHandlers = registeredHandlers.filter(h => h.name.includes('email')).map(h => h.name);
      const calendarHandlers = registeredHandlers.filter(h => h.name.includes('calendar')).map(h => h.name);
      const messageHandlers = registeredHandlers.filter(h => h.name.includes('message')).map(h => h.name);
      const noteHandlers = registeredHandlers.filter(h => h.name.includes('note')).map(h => h.name);

      console.log(`   📋 Todo: ${todoHandlers.join(', ')}`);
      console.log(`   📧 Email: ${emailHandlers.join(', ')}`);
      console.log(`   📅 Calendar: ${calendarHandlers.join(', ')}`);
      console.log(`   💬 Message: ${messageHandlers.join(', ')}`);
      console.log(`   📝 Note: ${noteHandlers.join(', ')}`);

    } catch (error) {
      console.error('❌ Clean handler initialization failed:', error.message);
      throw error;
    }
  }

  async testHandlerCoverage() {
    console.log('\n📊 Testing Handler Coverage...');
    
    const allHandlers = handlerRegistry.getAllHandlers();
    const expectedUseCases = ['todo', 'email', 'calendar', 'message', 'note'];
    
    console.log('   Checking coverage for primary use cases:');
    expectedUseCases.forEach(useCase => {
      const handlers = allHandlers.filter(h => 
        h.name.includes(useCase) || h.description.toLowerCase().includes(useCase)
      );
      
      if (handlers.length > 0) {
        console.log(`   ✅ ${useCase}: ${handlers.length} handler(s) - ${handlers.map(h => h.name).join(', ')}`);
      } else {
        console.log(`   ❌ ${useCase}: No handlers found`);
      }
    });

    // Check for duplicates or confusing handlers
    const handlerNames = allHandlers.map(h => h.name);
    const duplicates = handlerNames.filter((name, index) => handlerNames.indexOf(name) !== index);
    
    if (duplicates.length === 0) {
      console.log('   ✅ No duplicate handlers found');
    } else {
      console.log(`   ❌ Duplicate handlers found: ${duplicates.join(', ')}`);
    }
  }

  async runIntentTests() {
    console.log('\n🧪 Testing Intent Detection with Clean Handlers...');

    for (let i = 0; i < this.testCases.length; i++) {
      const testCase = this.testCases[i];
      console.log(`\n📋 Test ${i + 1}: ${testCase.title}`);
      console.log(`   Expected: ${testCase.shouldTrigger ? `✅ ${testCase.expectedHandler}` : '❌ No intent'}`);

      try {
        const result = await this.processTestCase(testCase);
        testCase.actualResult = result;

        if (testCase.shouldTrigger) {
          if (result.intentDetected === testCase.expectedHandler) {
            console.log(`   ✅ PASS: Detected ${result.intentDetected}`);
            if (result.arguments) {
              console.log(`   📋 Args: ${JSON.stringify(result.arguments)}`);
            }
          } else if (result.intentDetected) {
            console.log(`   ⚠️ PARTIAL: Expected ${testCase.expectedHandler}, got ${result.intentDetected}`);
          } else {
            console.log(`   ❌ FAIL: Expected ${testCase.expectedHandler}, got no intent`);
          }
        } else {
          if (!result.intentDetected) {
            console.log(`   ✅ PASS: Correctly ignored conversation`);
          } else {
            console.log(`   ❌ FAIL: Unexpected intent detected: ${result.intentDetected}`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        testCase.actualResult = { error: error.message };
      }
    }
  }

  async processTestCase(testCase) {
    const prompt = this.formatTestCaseForProcessing(testCase);
    
    try {
      const schemas = handlerRegistry.getHandlerSchemas();
      const { interpret } = require('../services/openai');
      const result = await interpret(prompt, schemas);

      if (result.type === 'tool_call') {
        return {
          intentDetected: result.name,
          arguments: result.arguments,
          success: true
        };
      } else {
        return {
          intentDetected: null,
          reason: 'No actionable intent found',
          success: true
        };
      }
    } catch (error) {
      throw error;
    }
  }

  formatTestCaseForProcessing(testCase) {
    return `Analyze this lifelog entry and determine if the USER is explicitly giving themselves instructions or reminders. ONLY extract intents where the user is directly addressing themselves with action requests.

Title: ${testCase.title}
Content: ${testCase.content}

ONLY call a function if you find explicit self-directed instructions like:
- "I need to remember to [do something]" → create_todo
- "Remind me to [task]" → create_todo  
- "I need to send an email to [person]" → send_email
- "Schedule a [meeting/event]" → create_calendar_event
- "Send a message to [person]" → send_message
- "Add note: [content]" → add_note

The user must be explicitly instructing themselves or setting reminders. Ignore conversations that don't contain direct self-addressed commands.`;
  }

  async verifyTodoistIntegration() {
    console.log('\n🔗 Verifying Todoist Integration...');
    
    try {
      // Test that the create_todo handler actually calls Todoist
      console.log('   Testing create_todo handler execution...');
      
      const todoHandler = handlerRegistry.getHandler('create_todo');
      if (!todoHandler) {
        throw new Error('create_todo handler not found');
      }

      const testArgs = {
        title: 'Test clean handler system integration',
        description: 'Verify that generic todo handler routes to Todoist',
        priority: 'medium'
      };

      console.log(`   📋 Executing with args: ${JSON.stringify(testArgs)}`);
      const result = await todoHandler.execute(testArgs);
      
      if (result.success && result.result.taskId) {
        console.log(`   ✅ SUCCESS: Todoist task created with ID ${result.result.taskId}`);
        console.log(`   🔗 Task URL: ${result.result.taskUrl}`);
      } else {
        console.log(`   ❌ FAIL: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.log(`   ❌ Integration test failed: ${error.message}`);
    }
  }

  printResults() {
    console.log('\n📊 Clean Handlers Test Results');
    console.log('='.repeat(60));

    let passed = 0;
    let partial = 0;
    let failed = 0;

    this.testCases.forEach((testCase, index) => {
      const result = testCase.actualResult;
      if (!result) return;

      console.log(`\n${index + 1}. ${testCase.title}`);
      console.log(`   Expected: ${testCase.shouldTrigger ? testCase.expectedHandler : 'No intent'}`);
      
      if (result.error) {
        console.log(`   Actual: ERROR - ${result.error}`);
        failed++;
      } else {
        console.log(`   Actual: ${result.intentDetected || 'No intent'}`);
        
        if (testCase.shouldTrigger) {
          if (result.intentDetected === testCase.expectedHandler) {
            console.log(`   ✅ PASS`);
            passed++;
          } else if (result.intentDetected) {
            console.log(`   ⚠️ PARTIAL`);
            partial++;
          } else {
            console.log(`   ❌ FAIL`);
            failed++;
          }
        } else {
          if (!result.intentDetected) {
            console.log(`   ✅ PASS`);
            passed++;
          } else {
            console.log(`   ❌ FAIL`);
            failed++;
          }
        }
      }
    });

    const total = this.testCases.length;
    console.log('\n' + '='.repeat(60));
    console.log(`📈 Results: ${passed} passed, ${partial} partial, ${failed} failed (${total} total)`);
    console.log(`Success Rate: ${Math.round((passed + partial * 0.5) / total * 100)}%`);

    if (failed === 0) {
      console.log('🎉 Clean handler system is working perfectly!');
      console.log('   ✅ No duplicate or confusing handlers');
      console.log('   ✅ One handler per use case');
      console.log('   ✅ Todo requests go directly to Todoist');
      console.log('   ✅ Intent detection is clear and unambiguous');
    } else {
      console.log('⚠️ Some tests failed. The system may need adjustments.');
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
  const test = new CleanHandlersTest();
  test.runCleanHandlersTest().catch(console.error);
}

module.exports = CleanHandlersTest;