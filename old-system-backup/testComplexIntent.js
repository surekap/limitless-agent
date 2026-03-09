require('dotenv').config({ path: '.env.local' });
const handlerRegistry = require('../services/handlerRegistry');
const TodoistHandlers = require('../handlers/todoistHandlers');
const pool = require('../db');

class ComplexIntentTest {
  constructor() {
    this.testCase = {
      title: 'Complex todo comment intent',
      content: `- User (8/15/25 5:00 PM): Add a comment to any todo item to which there has been no comments or activity for the last 7 days asking "what's the update on this?"`,
      description: 'Test if the system can handle complex, multi-step instructions involving filtering and bulk operations'
    };
  }

  async runComplexIntentTest() {
    console.log('🔍 Testing Complex Intent Recognition');
    console.log('='.repeat(60));

    try {
      await this.initializeHandlers();
      await this.analyzeCurrentCapabilities();
      await this.testIntentDetection();
      await this.proposeEnhancements();
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async initializeHandlers() {
    console.log('\n🔧 Loading Current Handler System...');
    
    await handlerRegistry.loadHandlersFromDatabase();
    const handlers = handlerRegistry.getAllHandlers();
    
    console.log(`✅ Loaded ${handlers.length} handlers:`);
    handlers.forEach(handler => {
      console.log(`   - ${handler.name}: ${handler.description}`);
    });
  }

  async analyzeCurrentCapabilities() {
    console.log('\n📊 Analyzing Current System Capabilities...');
    
    const handlers = handlerRegistry.getAllHandlers();
    const capabilities = {
      canGetTodos: handlers.some(h => h.name === 'get_todos'),
      canAddComments: false, // Need to check if we have a comment handler
      canFilterByDate: false, // Need to check filtering capabilities
      canBulkProcess: false // Need to check bulk processing capabilities
    };

    // Check for comment-related handlers
    const commentHandlers = handlers.filter(h => 
      h.name.includes('comment') || h.description.toLowerCase().includes('comment')
    );
    capabilities.canAddComments = commentHandlers.length > 0;

    console.log('   Current capabilities:');
    console.log(`   📋 Get todos: ${capabilities.canGetTodos ? '✅' : '❌'}`);
    console.log(`   💬 Add comments: ${capabilities.canAddComments ? '✅' : '❌'}`);
    console.log(`   📅 Filter by date: ${capabilities.canFilterByDate ? '✅' : '❌'}`);
    console.log(`   🔄 Bulk processing: ${capabilities.canBulkProcess ? '✅' : '❌'}`);

    if (commentHandlers.length > 0) {
      console.log('   💬 Comment handlers found:');
      commentHandlers.forEach(handler => {
        console.log(`      - ${handler.name}`);
      });
    } else {
      console.log('   ⚠️ No comment handlers found - need to add comment functionality');
    }

    return capabilities;
  }

  async testIntentDetection() {
    console.log('\n🧠 Testing Intent Detection for Complex Request...');
    
    console.log(`📝 Test case: "${this.testCase.content}"`);
    
    try {
      const prompt = this.formatComplexRequest();
      const schemas = handlerRegistry.getHandlerSchemas();
      
      console.log(`🔍 Available handlers: ${schemas.length}`);
      schemas.forEach(schema => {
        console.log(`   - ${schema.function.name}: ${schema.function.description}`);
      });

      const { interpret } = require('../services/openai');
      const result = await interpret(prompt, schemas);

      console.log('\n🤖 AI Response:');
      if (result.type === 'tool_call') {
        console.log(`   ✅ Intent detected: ${result.name}`);
        console.log(`   📋 Arguments:`, JSON.stringify(result.arguments, null, 4));
        
        // Analyze if this would work for the complex request
        this.analyzeIntentMatch(result);
      } else {
        console.log(`   ❌ No intent detected`);
        console.log(`   💭 AI response: ${result.content}`);
        console.log('\n   🔍 Analysis: The current system cannot handle this complex request because:');
        console.log('      - It requires multi-step processing (get todos + filter + add comments)');
        console.log('      - No single handler can accomplish this task');
        console.log('      - Needs orchestration between multiple operations');
      }

    } catch (error) {
      console.error('❌ Intent detection failed:', error.message);
    }
  }

  analyzeIntentMatch(result) {
    console.log('\n📊 Intent Analysis:');
    
    if (result.name === 'get_todos') {
      console.log('   ✅ Correctly identified need to retrieve todos');
      console.log('   ⚠️ But this only handles the first step of the complex request');
      console.log('   ❌ Cannot handle the filtering by "last 7 days with no activity"');
      console.log('   ❌ Cannot handle bulk comment addition');
    } else if (result.name.includes('comment')) {
      console.log('   ✅ Correctly identified need to add comments');
      console.log('   ❌ But missing the prerequisite filtering logic');
    } else {
      console.log(`   ⚠️ Detected ${result.name} which may not be the best fit`);
    }

    console.log('\n   🎯 What would be needed for full support:');
    console.log('      1. Enhanced get_todos with date-based activity filtering');
    console.log('      2. Bulk comment addition capability');
    console.log('      3. Orchestrated workflow handler');
  }

  formatComplexRequest() {
    return `Analyze this lifelog entry and determine if the USER is explicitly giving themselves instructions or reminders.

Title: ${this.testCase.title}
Content: ${this.testCase.content}

The user is giving themselves a specific instruction about managing their todos. Look for the appropriate handler to accomplish this task.`;
  }

  async proposeEnhancements() {
    console.log('\n🚀 Proposed System Enhancements...');
    
    console.log('   To properly handle complex intents like this, we need:');
    
    console.log('\n   1️⃣ Enhanced todo filtering:');
    console.log('      - Add date-based activity filtering to get_todos');
    console.log('      - Support for "no activity in X days" queries');
    console.log('      - Integration with Todoist activity/comment APIs');
    
    console.log('\n   2️⃣ Comment management:');
    console.log('      - add_todo_comment handler');
    console.log('      - bulk_comment_todos handler');
    console.log('      - Template-based comment generation');
    
    console.log('\n   3️⃣ Workflow orchestration:');
    console.log('      - Multi-step handler that can:');
    console.log('        a) Get stale todos (no activity > 7 days)');
    console.log('        b) Add comment to each one');
    console.log('        c) Report results');
    
    console.log('\n   4️⃣ Proposed new handler:');
    console.log('      - manage_stale_todos:');
    console.log('        • Parameters: days_threshold, comment_template');
    console.log('        • Returns: list of todos updated with comments');
    
    // Show what the enhanced schema might look like
    this.showEnhancedSchemas();
  }

  showEnhancedSchemas() {
    console.log('\n📋 Enhanced Handler Schemas:');
    
    const enhancedSchemas = [
      {
        name: 'get_todos',
        description: 'Retrieve todos with advanced filtering including activity dates',
        enhancements: [
          'no_activity_since: filter todos with no activity since date',
          'no_comments: filter todos with no comments',
          'project_filter: filter by project name/id',
          'include_activity: include last activity date in response'
        ]
      },
      {
        name: 'add_todo_comment',
        description: 'Add a comment to a specific todo',
        parameters: [
          'task_id: target todo task ID',
          'comment: comment text to add',
          'template: use predefined comment template'
        ]
      },
      {
        name: 'bulk_update_todos',
        description: 'Perform bulk operations on multiple todos',
        parameters: [
          'filter_criteria: criteria for selecting todos',
          'action: action to perform (add_comment, update_priority, etc.)',
          'action_data: data for the action'
        ]
      },
      {
        name: 'manage_stale_todos',
        description: 'Find and update todos that have been inactive',
        parameters: [
          'days_threshold: number of days to consider "stale"',
          'comment_template: template for comment to add',
          'dry_run: preview changes without applying'
        ]
      }
    ];

    enhancedSchemas.forEach(schema => {
      console.log(`\n   📌 ${schema.name}:`);
      console.log(`      Description: ${schema.description}`);
      if (schema.enhancements) {
        console.log('      Enhancements:');
        schema.enhancements.forEach(enhancement => {
          console.log(`        • ${enhancement}`);
        });
      }
      if (schema.parameters) {
        console.log('      Parameters:');
        schema.parameters.forEach(param => {
          console.log(`        • ${param}`);
        });
      }
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
  const test = new ComplexIntentTest();
  test.runComplexIntentTest().catch(console.error);
}

module.exports = ComplexIntentTest;