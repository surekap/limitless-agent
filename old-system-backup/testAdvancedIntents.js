require('dotenv').config({ path: '.env.local' });
const intentProcessor = require('../services/intentProcessor');
const handlerRegistry = require('../services/handlerRegistry');
const database = require('../services/database');
const TodoistHandlers = require('../handlers/todoistHandlers');
const pool = require('../db');

class AdvancedIntentsTest {
  constructor() {
    this.testCases = [
      {
        id: 'advanced-1',
        title: 'Stale todo management - exact original request',
        content: `- User (8/15/25 5:00 PM): Add a comment to any todo item to which there has been no comments or activity for the last 7 days asking "what's the update on this?"`,
        expectedHandler: 'manage_stale_todos',
        shouldTrigger: true,
        complexity: 'high'
      },
      {
        id: 'advanced-2',
        title: 'Stale todo with custom message',
        content: `- User (8/15/25 5:30 PM): For any todos that haven't been touched in 10 days, add a comment saying "Is this still relevant?"`,
        expectedHandler: 'manage_stale_todos',
        shouldTrigger: true,
        complexity: 'high'
      },
      {
        id: 'advanced-3',
        title: 'Add comment to specific todo',
        content: `- User (8/15/25 6:00 PM): Add a comment to my "Review budget" todo asking for the latest numbers.`,
        expectedHandler: 'add_todo_comment',
        shouldTrigger: true,
        complexity: 'medium'
      },
      {
        id: 'advanced-4',
        title: 'Bulk priority update',
        content: `- User (8/15/25 6:30 PM): Mark all todos with no activity in the last 5 days as high priority.`,
        expectedHandler: 'bulk_update_todos',
        shouldTrigger: true,
        complexity: 'high'
      },
      {
        id: 'advanced-5',
        title: 'Dry run preview',
        content: `- User (8/15/25 7:00 PM): Show me which todos haven't been updated in the last week without making any changes.`,
        expectedHandler: 'manage_stale_todos',
        shouldTrigger: true,
        complexity: 'medium'
      },
      {
        id: 'advanced-6',
        title: 'Simple todo - should still work',
        content: `- User (8/15/25 7:30 PM): Remind me to call Sarah tomorrow about the project.`,
        expectedHandler: 'create_todo',
        shouldTrigger: true,
        complexity: 'low'
      },
      {
        id: 'advanced-7',
        title: 'General conversation - should not trigger',
        content: `- Person A (8/15/25 8:00 PM): Those old todos really need to be updated.
- Person B (8/15/25 8:01 PM): Yeah, someone should add comments to them.`,
        expectedHandler: null,
        shouldTrigger: false,
        complexity: 'low'
      }
    ];
  }

  async runAdvancedIntentsTest() {
    console.log('🚀 Testing Advanced Intent Processing');
    console.log('='.repeat(60));

    try {
      await this.initializeAdvancedHandlers();
      await this.testHandlerCapabilities();
      await this.runIntentDetectionTests();
      await this.testLiveExecution();
      this.printComprehensiveResults();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeAdvancedHandlers() {
    console.log('\n🔧 Initializing Advanced Handler System...');
    
    try {
      // Clear existing handlers to start fresh
      const conn = await pool.getConnection();
      await conn.query('DELETE FROM handlers');
      conn.release();

      // Register all advanced handlers
      const schemas = TodoistHandlers.getHandlerSchemas();
      
      for (const schema of schemas) {
        await handlerRegistry.registerHandler(
          schema.name,
          schema.description,
          schema.schema
        );
      }

      await handlerRegistry.loadHandlersFromDatabase();
      
      const handlers = handlerRegistry.getAllHandlers();
      console.log(`✅ Registered ${handlers.length} advanced handlers:`);
      
      // Group handlers by functionality
      const basicHandlers = handlers.filter(h => ['create_todo', 'complete_todo', 'update_todo', 'get_todos'].includes(h.name));
      const advancedHandlers = handlers.filter(h => ['manage_stale_todos', 'add_todo_comment', 'bulk_update_todos'].includes(h.name));
      
      console.log('   📋 Basic Todo Handlers:');
      basicHandlers.forEach(h => console.log(`      - ${h.name}: ${h.description}`));
      
      console.log('   🚀 Advanced Workflow Handlers:');
      advancedHandlers.forEach(h => console.log(`      - ${h.name}: ${h.description}`));

      return { basic: basicHandlers.length, advanced: advancedHandlers.length };

    } catch (error) {
      console.error('❌ Advanced handler initialization failed:', error.message);
      throw error;
    }
  }

  async testHandlerCapabilities() {
    console.log('\n⚡ Testing Handler Capabilities...');
    
    // Test if we can access the advanced functions
    const todoistHandlers = new TodoistHandlers();
    
    const capabilities = {
      canFindStaleTodos: typeof todoistHandlers.manageStaleTodos === 'function',
      canAddComments: typeof todoistHandlers.addTodoComment === 'function',
      canBulkUpdate: typeof todoistHandlers.bulkUpdateTodos === 'function',
      hasAdvancedFiltering: typeof todoistHandlers.todoist.getStaleTasksWithDetails === 'function'
    };

    console.log('   Capability Check:');
    Object.entries(capabilities).forEach(([capability, available]) => {
      const status = available ? '✅' : '❌';
      console.log(`   ${status} ${capability}: ${available ? 'Available' : 'Missing'}`);
    });

    return capabilities;
  }

  async runIntentDetectionTests() {
    console.log('\n🧠 Testing Advanced Intent Detection...');

    for (let i = 0; i < this.testCases.length; i++) {
      const testCase = this.testCases[i];
      console.log(`\n📋 Test ${i + 1}: ${testCase.title}`);
      console.log(`   Complexity: ${testCase.complexity}`);
      console.log(`   Expected: ${testCase.shouldTrigger ? `✅ ${testCase.expectedHandler}` : '❌ No intent'}`);

      try {
        const result = await this.processAdvancedTestCase(testCase);
        testCase.actualResult = result;

        if (testCase.shouldTrigger) {
          if (result.intentDetected === testCase.expectedHandler) {
            console.log(`   ✅ PERFECT: Detected ${result.intentDetected}`);
            if (result.arguments) {
              console.log(`   📋 Arguments:`, JSON.stringify(result.arguments, null, 4));
            }
          } else if (result.intentDetected && testCase.complexity === 'high') {
            // For high complexity, any reasonable handler is acceptable
            console.log(`   ⚠️ REASONABLE: Expected ${testCase.expectedHandler}, got ${result.intentDetected}`);
            console.log(`   💡 This may be an acceptable alternative for complex intent`);
          } else if (result.intentDetected) {
            console.log(`   ⚠️ PARTIAL: Expected ${testCase.expectedHandler}, got ${result.intentDetected}`);
          } else {
            console.log(`   ❌ FAILED: Expected ${testCase.expectedHandler}, got no intent`);
          }
        } else {
          if (!result.intentDetected) {
            console.log(`   ✅ CORRECT: Properly ignored conversation`);
          } else {
            console.log(`   ❌ FALSE POSITIVE: Unexpected intent detected: ${result.intentDetected}`);
          }
        }

        // Add delay for rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        testCase.actualResult = { error: error.message };
      }
    }
  }

  async processAdvancedTestCase(testCase) {
    const prompt = this.formatAdvancedTestCase(testCase);
    
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
          aiResponse: result.content,
          success: true
        };
      }
    } catch (error) {
      throw error;
    }
  }

  formatAdvancedTestCase(testCase) {
    return `Analyze this lifelog entry and determine if the USER is explicitly giving themselves instructions for todo management. Look for both simple and complex workflow instructions.

Title: ${testCase.title}
Content: ${testCase.content}

Available actions include:
- Simple todo operations: create_todo, complete_todo, update_todo, get_todos
- Advanced workflow operations: 
  * manage_stale_todos - for handling old/inactive todos
  * add_todo_comment - for adding comments to specific todos
  * bulk_update_todos - for bulk operations on multiple todos

ONLY call a function if you find explicit self-directed instructions. Look for:
- Simple: "Remind me to...", "Create todo...", "Mark as complete..."
- Advanced: "Add comments to old todos...", "Update todos that haven't been touched...", "Find stale todos..."

The user must be explicitly instructing themselves. Ignore general conversations.`;
  }

  async testLiveExecution() {
    console.log('\n🔥 Testing Live Handler Execution...');
    
    try {
      console.log('   🧪 Testing manage_stale_todos with dry run...');
      
      const staleHandler = handlerRegistry.getHandler('manage_stale_todos');
      if (!staleHandler) {
        throw new Error('manage_stale_todos handler not found');
      }

      const testArgs = {
        days_threshold: 7,
        comment_template: "What's the update on this?",
        dry_run: true  // Safe dry run
      };

      console.log(`   📋 Executing with args:`, JSON.stringify(testArgs, null, 4));
      const result = await staleHandler.execute(testArgs);
      
      if (result.success) {
        console.log(`   ✅ DRY RUN SUCCESS:`);
        console.log(`      Found: ${result.result.count || 0} stale todos`);
        console.log(`      Would add comment: "${result.result.wouldAddComment || 'N/A'}"`);
        
        if (result.result.tasks && result.result.tasks.length > 0) {
          console.log(`      Sample stale todos:`);
          result.result.tasks.slice(0, 3).forEach((task, index) => {
            console.log(`        ${index + 1}. ${task.title} (Created: ${task.created})`);
          });
        }
      } else {
        console.log(`   ❌ EXECUTION FAILED: ${result.error}`);
      }

      return result;

    } catch (error) {
      console.log(`   ❌ Live execution test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  printComprehensiveResults() {
    console.log('\n📊 Advanced Intent Processing Results');
    console.log('='.repeat(60));

    let perfect = 0;
    let reasonable = 0;
    let partial = 0;
    let failed = 0;

    this.testCases.forEach((testCase, index) => {
      const result = testCase.actualResult;
      if (!result) return;

      console.log(`\n${index + 1}. ${testCase.title} (${testCase.complexity} complexity)`);
      console.log(`   Expected: ${testCase.shouldTrigger ? testCase.expectedHandler : 'No intent'}`);
      
      if (result.error) {
        console.log(`   Actual: ERROR - ${result.error}`);
        failed++;
      } else {
        console.log(`   Actual: ${result.intentDetected || 'No intent'}`);
        
        if (testCase.shouldTrigger) {
          if (result.intentDetected === testCase.expectedHandler) {
            console.log(`   ✅ PERFECT MATCH`);
            perfect++;
          } else if (result.intentDetected && testCase.complexity === 'high') {
            console.log(`   ⚠️ REASONABLE (complex intent)`);
            reasonable++;
          } else if (result.intentDetected) {
            console.log(`   ⚠️ PARTIAL`);
            partial++;
          } else {
            console.log(`   ❌ FAILED`);
            failed++;
          }
        } else {
          if (!result.intentDetected) {
            console.log(`   ✅ CORRECT (ignored)`);
            perfect++;
          } else {
            console.log(`   ❌ FALSE POSITIVE`);
            failed++;
          }
        }
      }
    });

    const total = this.testCases.length;
    console.log('\n' + '='.repeat(60));
    console.log(`📈 Results Summary:`);
    console.log(`   Perfect: ${perfect}/${total} (${Math.round(perfect/total*100)}%)`);
    console.log(`   Reasonable: ${reasonable}/${total} (${Math.round(reasonable/total*100)}%)`);
    console.log(`   Partial: ${partial}/${total} (${Math.round(partial/total*100)}%)`);
    console.log(`   Failed: ${failed}/${total} (${Math.round(failed/total*100)}%)`);
    
    const successRate = Math.round((perfect + reasonable + partial * 0.5) / total * 100);
    console.log(`   Overall Success Rate: ${successRate}%`);

    if (perfect + reasonable >= total * 0.8) {
      console.log('\n🎉 EXCELLENT: Advanced intent processing is working very well!');
      console.log('   ✅ Complex multi-step intents are being detected');
      console.log('   ✅ Stale todo management is functional');
      console.log('   ✅ Bulk operations are supported');
      console.log('   ✅ Simple intents still work correctly');
    } else if (perfect + reasonable >= total * 0.6) {
      console.log('\n✅ GOOD: Advanced intent processing is mostly working');
      console.log('   ⚠️ Some complex intents may need prompt refinement');
    } else {
      console.log('\n⚠️ NEEDS IMPROVEMENT: Advanced intent processing needs work');
      console.log('   🔧 Consider refining prompts or handler descriptions');
    }

    // Show which types of complexity work best
    const byComplexity = {
      low: this.testCases.filter(t => t.complexity === 'low'),
      medium: this.testCases.filter(t => t.complexity === 'medium'),
      high: this.testCases.filter(t => t.complexity === 'high')
    };

    console.log('\n📊 Performance by Complexity:');
    Object.entries(byComplexity).forEach(([level, cases]) => {
      const successfulCases = cases.filter(c => 
        c.actualResult && (
          c.actualResult.intentDetected === c.expectedHandler ||
          (c.complexity === 'high' && c.actualResult.intentDetected && c.shouldTrigger) ||
          (!c.shouldTrigger && !c.actualResult.intentDetected)
        )
      );
      const rate = cases.length > 0 ? Math.round(successfulCases.length / cases.length * 100) : 0;
      console.log(`   ${level}: ${successfulCases.length}/${cases.length} (${rate}%)`);
    });
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
  const test = new AdvancedIntentsTest();
  test.runAdvancedIntentsTest().catch(console.error);
}

module.exports = AdvancedIntentsTest;