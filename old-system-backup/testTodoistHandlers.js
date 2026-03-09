require('dotenv').config({ path: '.env.local' });
const TodoistHandlers = require('../handlers/todoistHandlers');
const handlerRegistry = require('../services/handlerRegistry');
const database = require('../services/database');
const pool = require('../db');

class TodoistHandlersTest {
  constructor() {
    this.todoistHandlers = new TodoistHandlers();
    this.testResults = [];
  }

  async runAllTests() {
    console.log('📋 Testing Todoist Handlers Integration');
    console.log('='.repeat(60));

    try {
      await this.testAPIConnection();
      await this.testHandlerRegistration();
      await this.testTaskOperations();
      await this.testProjectOperations();
      await this.testIntentProcessingWithTodoist();
      
      this.printSummary();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      await this.cleanup();
    }
  }

  async testAPIConnection() {
    console.log('\n🔗 Testing Todoist API Connection...');
    
    try {
      const result = await this.todoistHandlers.todoist.getProjects();
      
      if (result.success) {
        console.log(`✅ API connection successful - Found ${result.count} projects`);
        
        // Show sample projects
        if (result.projects.length > 0) {
          console.log('   Sample projects:');
          result.projects.slice(0, 3).forEach(project => {
            console.log(`   - ${project.name} (ID: ${project.id})`);
          });
        }
        
        this.testResults.push({ test: 'API Connection', status: 'PASS', details: `${result.count} projects found` });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ API connection failed:', error.message);
      this.testResults.push({ test: 'API Connection', status: 'FAIL', error: error.message });
      throw error;
    }
  }

  async testHandlerRegistration() {
    console.log('\n🔧 Testing Handler Registration...');
    
    try {
      // Get Todoist handler schemas
      const schemas = TodoistHandlers.getHandlerSchemas();
      console.log(`📊 Found ${schemas.length} Todoist handler schemas`);

      // Register each handler
      for (const schema of schemas) {
        await handlerRegistry.registerHandler(
          schema.name,
          schema.description,
          schema.schema
        );
        console.log(`   ✅ Registered: ${schema.name}`);
      }

      // Load handlers from database
      await handlerRegistry.loadHandlersFromDatabase();
      
      // Verify handlers are available
      const allHandlers = handlerRegistry.getAllHandlers();
      const todoistHandlerNames = schemas.map(s => s.name);
      const registeredTodoistHandlers = allHandlers.filter(h => 
        todoistHandlerNames.includes(h.name)
      );

      console.log(`✅ Successfully registered ${registeredTodoistHandlers.length}/${schemas.length} Todoist handlers`);
      this.testResults.push({ 
        test: 'Handler Registration', 
        status: 'PASS', 
        details: `${registeredTodoistHandlers.length} handlers registered` 
      });

    } catch (error) {
      console.error('❌ Handler registration failed:', error.message);
      this.testResults.push({ test: 'Handler Registration', status: 'FAIL', error: error.message });
      throw error;
    }
  }

  async testTaskOperations() {
    console.log('\n📝 Testing Task Operations...');
    
    const testTasks = [
      {
        name: 'Create Basic Task',
        args: {
          title: 'Test task from lifelog processor',
          description: 'This is a test task created by the automated test suite',
          priority: 'high',
          due_string: 'tomorrow'
        }
      },
      {
        name: 'Create Task with Project',
        args: {
          title: 'Project-specific test task',
          description: 'Task assigned to a specific project',
          project_name: 'Inbox', // Most users have an Inbox project
          priority: 'medium'
        }
      }
    ];

    let createdTaskIds = [];

    for (const testTask of testTasks) {
      try {
        console.log(`\n   🧪 ${testTask.name}:`);
        console.log(`      Args:`, JSON.stringify(testTask.args, null, 6));
        
        const result = await this.todoistHandlers.createTodoistTask(testTask.args);
        
        console.log(`      ✅ Result:`, JSON.stringify(result, null, 6));
        
        if (result.taskId) {
          createdTaskIds.push(result.taskId);
        }
        
        this.testResults.push({ 
          test: testTask.name, 
          status: 'PASS', 
          details: `Task ID: ${result.taskId}` 
        });

        // Add delay between API calls
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
        this.testResults.push({ test: testTask.name, status: 'FAIL', error: error.message });
      }
    }

    // Test completing a task if we created any
    if (createdTaskIds.length > 0) {
      try {
        console.log(`\n   🧪 Complete Task Test:`);
        const taskId = createdTaskIds[0];
        console.log(`      Completing task: ${taskId}`);
        
        const result = await this.todoistHandlers.completeTodoistTask({ task_id: taskId });
        console.log(`      ✅ Result:`, JSON.stringify(result, null, 6));
        
        this.testResults.push({ 
          test: 'Complete Task', 
          status: 'PASS', 
          details: `Completed task ${taskId}` 
        });

      } catch (error) {
        console.log(`      ❌ Error completing task: ${error.message}`);
        this.testResults.push({ test: 'Complete Task', status: 'FAIL', error: error.message });
      }
    }
  }

  async testProjectOperations() {
    console.log('\n📂 Testing Project Operations...');
    
    try {
      // Test getting projects
      console.log('   🧪 Get Projects Test:');
      const projectsResult = await this.todoistHandlers.todoist.getProjects();
      
      if (projectsResult.success) {
        console.log(`      ✅ Retrieved ${projectsResult.count} projects`);
        this.testResults.push({ 
          test: 'Get Projects', 
          status: 'PASS', 
          details: `${projectsResult.count} projects found` 
        });
      } else {
        throw new Error(projectsResult.error);
      }

      // Test creating a project
      console.log('\n   🧪 Create Project Test:');
      const projectArgs = {
        name: `Test Project ${Date.now()}`,
        color: 'blue',
        is_favorite: false
      };
      
      console.log(`      Args:`, JSON.stringify(projectArgs, null, 6));
      const createResult = await this.todoistHandlers.createTodoistProject(projectArgs);
      
      console.log(`      ✅ Result:`, JSON.stringify(createResult, null, 6));
      this.testResults.push({ 
        test: 'Create Project', 
        status: 'PASS', 
        details: `Project ID: ${createResult.projectId}` 
      });

    } catch (error) {
      console.log(`      ❌ Error: ${error.message}`);
      this.testResults.push({ test: 'Project Operations', status: 'FAIL', error: error.message });
    }
  }

  async testIntentProcessingWithTodoist() {
    console.log('\n🧠 Testing Intent Processing with Todoist...');
    
    const testCases = [
      {
        id: 'todoist-1',
        title: 'Explicit Todoist task request',
        content: `- User (8/15/25 3:00 PM): I need to add to my Todoist: Review the quarterly budget report by Friday.

- User (8/15/25 3:01 PM): Also remind me to call the client about the project update.`,
        expectedHandler: 'create_todoist_task'
      },
      {
        id: 'todoist-2',
        title: 'Urgent task with priority',
        content: `- User (8/15/25 4:00 PM): Add urgent task to Todoist: Submit proposal to client before 5 PM today.`,
        expectedHandler: 'create_todoist_task'
      }
    ];

    for (const testCase of testCases) {
      try {
        console.log(`\n   🧪 ${testCase.title}:`);
        
        const prompt = this.formatTestCaseForProcessing(testCase);
        const schemas = handlerRegistry.getHandlerSchemas();
        
        // Filter to include Todoist handlers
        const todoistSchemas = schemas.filter(schema => 
          schema.function.name.includes('todoist') || schema.function.name.includes('todo')
        );
        
        console.log(`      Using ${todoistSchemas.length} relevant handler schemas`);
        
        const { interpret } = require('../services/openai');
        const result = await interpret(prompt, todoistSchemas);

        if (result.type === 'tool_call') {
          console.log(`      ✅ Intent detected: ${result.name}`);
          console.log(`      📋 Arguments:`, JSON.stringify(result.arguments, null, 8));
          
          // Test executing the handler
          if (result.name === 'create_todoist_task') {
            try {
              const execResult = await this.todoistHandlers.createTodoistTask(result.arguments);
              console.log(`      🚀 Execution result:`, JSON.stringify(execResult, null, 8));
              
              this.testResults.push({ 
                test: testCase.title, 
                status: 'PASS', 
                details: `Handler: ${result.name}, Task ID: ${execResult.taskId}` 
              });
            } catch (execError) {
              console.log(`      ❌ Execution error: ${execError.message}`);
              this.testResults.push({ 
                test: testCase.title, 
                status: 'PARTIAL', 
                details: `Intent detected but execution failed: ${execError.message}` 
              });
            }
          }
        } else {
          console.log(`      ℹ️ No intent detected`);
          this.testResults.push({ 
            test: testCase.title, 
            status: 'FAIL', 
            details: 'Expected Todoist intent but none detected' 
          });
        }

        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`      ❌ Error: ${error.message}`);
        this.testResults.push({ test: testCase.title, status: 'FAIL', error: error.message });
      }
    }
  }

  formatTestCaseForProcessing(testCase) {
    return `Analyze this lifelog entry and determine if the USER is explicitly giving themselves instructions or reminders. ONLY extract intents where the user is directly addressing themselves with action requests.

Title: ${testCase.title}
Content: ${testCase.content}

ONLY call a function if you find explicit self-directed instructions like:
- "I need to add to my Todoist: [task]"
- "Add to Todoist: [task]"
- "Remind me to [do something]"
- "Create a todo: [task description]"

The user must be explicitly instructing themselves or setting reminders. Ignore conversations that don't contain direct self-addressed commands.`;
  }

  printSummary() {
    console.log('\n📊 Todoist Handlers Test Summary');
    console.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const partial = this.testResults.filter(r => r.status === 'PARTIAL').length;
    const total = this.testResults.length;

    this.testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : 
                   result.status === 'PARTIAL' ? '⚠️' : '❌';
      console.log(`${icon} ${result.test}`);
      if (result.details) console.log(`   ${result.details}`);
      if (result.error) console.log(`   Error: ${result.error}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📈 Results: ${passed} passed, ${partial} partial, ${failed} failed (${total} total)`);
    console.log(`Success Rate: ${Math.round((passed + partial * 0.5) / total * 100)}%`);

    if (failed === 0) {
      console.log('🎉 Todoist integration is working perfectly!');
      console.log('   - API connection established');
      console.log('   - Handlers registered and functional');
      console.log('   - Task operations working');
      console.log('   - Intent processing integrated');
    } else {
      console.log('⚠️ Some tests failed. Check the API key and network connection.');
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
  const test = new TodoistHandlersTest();
  test.runAllTests().catch(console.error);
}

module.exports = TodoistHandlersTest;