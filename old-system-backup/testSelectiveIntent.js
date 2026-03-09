require('dotenv').config({ path: '.env.local' });
const intentProcessor = require('../services/intentProcessor');
const handlerRegistry = require('../services/handlerRegistry');
const database = require('../services/database');
const pool = require('../db');

class SelectiveIntentTest {
  constructor() {
    this.testCases = [
      {
        id: 'test-1',
        title: 'Explicit self-instruction - Email reminder',
        content: `- User (8/15/25 2:00 PM): I need to send an email to John about the project deadline tomorrow.

- User (8/15/25 2:01 PM): Remind me to follow up with Sarah on the budget proposal.`,
        expectedIntent: 'send_email',
        shouldTrigger: true
      },
      {
        id: 'test-2', 
        title: 'General conversation - No intent',
        content: `- John (8/15/25 10:00 AM): We should probably email the client about the delay.

- Sarah (8/15/25 10:01 AM): Yes, someone needs to send that update.`,
        expectedIntent: null,
        shouldTrigger: false
      },
      {
        id: 'test-3',
        title: 'Explicit todo creation',
        content: `- User (8/15/25 3:00 PM): Add to my todo list: Review the quarterly report by Friday.

- User (8/15/25 3:01 PM): I need to remember to call the dentist to reschedule.`,
        expectedIntent: 'create_todo',
        shouldTrigger: true
      },
      {
        id: 'test-4',
        title: 'Interview conversation - No intent',
        content: `- Interviewer (8/15/25 11:00 AM): Tell me about your experience at your previous company.

- Candidate (8/15/25 11:01 AM): I worked there for three years managing the finance team.`,
        expectedIntent: null,
        shouldTrigger: false
      },
      {
        id: 'test-5',
        title: 'Calendar instruction',
        content: `- User (8/15/25 4:00 PM): Schedule a meeting with the marketing team for next Tuesday at 2 PM.

- User (8/15/25 4:01 PM): Also add a reminder for the board meeting on Thursday.`,
        expectedIntent: 'create_calendar_event',
        shouldTrigger: true
      },
      {
        id: 'test-6',
        title: 'Financial discussion - No intent',
        content: `- Person A (8/15/25 1:00 PM): The loan amount is 12.6 crores.

- Person B (8/15/25 1:01 PM): That's related to the RRT LLP agreement.`,
        expectedIntent: null,
        shouldTrigger: false
      },
      {
        id: 'test-7',
        title: 'Mixed conversation with self-instruction',
        content: `- Client (8/15/25 9:00 AM): Can you send me the updated proposal?

- User (8/15/25 9:01 AM): Sure, I'll get that to you today.

- User (8/15/25 9:02 AM): Remind me to send the proposal to the client before 5 PM.`,
        expectedIntent: 'create_todo',
        shouldTrigger: true
      }
    ];
  }

  async runSelectiveIntentTest() {
    console.log('🎯 Testing Selective Intent Detection');
    console.log('='.repeat(60));

    try {
      await this.initializeHandlers();
      await this.runTestCases();
      await this.testRealLifelogs();
      this.printResults();
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeHandlers() {
    console.log('\n🔧 Initializing handlers...');
    
    const handlers = [
      {
        name: 'send_email',
        description: 'Send an email when user explicitly requests it',
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
        name: 'create_todo',
        description: 'Create a todo when user explicitly asks to be reminded or adds to todo list',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Todo title' },
            description: { type: 'string', description: 'Todo description' },
            due_date: { type: 'string', format: 'date', description: 'Due date' }
          },
          required: ['title']
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
            description: { type: 'string', description: 'Event description' }
          },
          required: ['title', 'start_time']
        }
      }
    ];

    for (const handler of handlers) {
      await handlerRegistry.registerHandler(
        handler.name,
        handler.description,
        handler.schema
      );
    }

    await handlerRegistry.loadHandlersFromDatabase();
    console.log(`✅ Initialized ${handlerRegistry.getAllHandlers().length} handlers`);
  }

  async runTestCases() {
    console.log('\n🧪 Running Test Cases...');

    for (let i = 0; i < this.testCases.length; i++) {
      const testCase = this.testCases[i];
      console.log(`\n📋 Test ${i + 1}: ${testCase.title}`);
      console.log(`   Expected: ${testCase.shouldTrigger ? `✅ ${testCase.expectedIntent}` : '❌ No intent'}`);

      try {
        const result = await this.processTestCase(testCase);
        testCase.actualResult = result;

        if (testCase.shouldTrigger) {
          if (result.intentDetected) {
            console.log(`   ✅ PASS: Detected ${result.intentDetected}`);
          } else {
            console.log(`   ❌ FAIL: Expected ${testCase.expectedIntent}, got no intent`);
          }
        } else {
          if (!result.intentDetected) {
            console.log(`   ✅ PASS: Correctly ignored conversation`);
          } else {
            console.log(`   ❌ FAIL: Unexpected intent detected: ${result.intentDetected}`);
          }
        }

        // Add delay to avoid rate limits
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
    const prompt = `Analyze this lifelog entry and determine if the USER is explicitly giving themselves instructions or reminders. ONLY extract intents where the user is directly addressing themselves with action requests.

Title: ${testCase.title}
Content: ${testCase.content}

ONLY call a function if you find explicit self-directed instructions like:
- "I need to send an email to [person] about [topic]"
- "Remind me to [do something]"
- "I should email [person] to follow up on [topic]"
- "Add to my calendar: [event details]"
- "Create a todo: [task description]"
- "I need to remember to [action]"
- "Schedule a meeting with [person] for [time]"

DO NOT extract intents from:
- General conversations between multiple people
- Discussions about what others should do
- Mentions of events that already happened
- Third-party conversations or interviews
- Financial discussions that don't include explicit user instructions
- Casual mentions of tasks or events without direct user commands

The user must be explicitly instructing themselves or setting reminders. Ignore conversations, interviews, or discussions that don't contain direct self-addressed commands.`;

    return prompt;
  }

  async testRealLifelogs() {
    console.log('\n🔍 Testing Real Lifelogs with Selective Processing...');

    // Reset processed flag for testing
    const conn = await pool.getConnection();
    await conn.query('UPDATE lifelogs SET processed = FALSE');
    conn.release();

    // Process with new selective logic
    const unprocessedLifelogs = await database.getUnprocessedLifelogs(3);
    console.log(`Found ${unprocessedLifelogs.length} lifelogs to test`);

    for (const lifelog of unprocessedLifelogs) {
      console.log(`\n📄 Testing: ${lifelog.title}`);
      
      try {
        const result = await intentProcessor.processLifelog(lifelog);
        console.log(`   Result: ${result ? '✅ Processed' : '❌ Failed'}`);
        
        // Check what was detected
        const processingRecords = await database.getProcessingHistory(lifelog.id);
        if (processingRecords.length > 0) {
          const latest = processingRecords[0];
          console.log(`   Intent: ${latest.handler_name || 'None detected'}`);
        } else {
          console.log(`   Intent: None detected`);
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }

  printResults() {
    console.log('\n📊 Selective Intent Detection Results');
    console.log('='.repeat(60));

    let passed = 0;
    let total = this.testCases.length;

    this.testCases.forEach((testCase, index) => {
      const result = testCase.actualResult;
      if (!result) return;

      console.log(`\n${index + 1}. ${testCase.title}`);
      console.log(`   Expected: ${testCase.shouldTrigger ? `${testCase.expectedIntent}` : 'No intent'}`);
      
      if (result.error) {
        console.log(`   Actual: ERROR - ${result.error}`);
      } else {
        console.log(`   Actual: ${result.intentDetected || 'No intent'}`);
        
        const isCorrect = testCase.shouldTrigger ? 
          (result.intentDetected === testCase.expectedIntent) :
          (!result.intentDetected);
          
        if (isCorrect) {
          console.log(`   ✅ PASS`);
          passed++;
        } else {
          console.log(`   ❌ FAIL`);
        }
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📈 Results: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
    
    if (passed === total) {
      console.log('🎉 All tests passed! Selective intent detection is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. The system may need further tuning.');
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
  const test = new SelectiveIntentTest();
  test.runSelectiveIntentTest().catch(console.error);
}

module.exports = SelectiveIntentTest;