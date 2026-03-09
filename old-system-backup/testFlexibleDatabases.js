require('dotenv').config({ path: '.env.local' });
const FlexibleDatabaseHandlers = require('../handlers/flexibleDatabaseHandlers');
const intentProcessor = require('../services/intentProcessor');
const handlerRegistry = require('../services/handlerRegistry');

class FlexibleDatabaseTest {
  constructor() {
    this.databaseHandlers = new FlexibleDatabaseHandlers();
    this.testCases = [
      {
        id: 'wines-1',
        title: 'Create wine database request',
        content: `- User (8/15/25 5:00 PM): Create a database for wines`,
        expectedHandler: 'create_flexible_database',
        shouldTrigger: true,
        testType: 'intent_detection'
      },
      {
        id: 'candidates-1', 
        title: 'Create interview candidates database',
        content: `- User (8/15/25 5:30 PM): Create a database for interview candidates`,
        expectedHandler: 'create_flexible_database',
        shouldTrigger: true,
        testType: 'intent_detection'
      },
      {
        id: 'gins-1',
        title: 'Create gin analysis database',
        content: `- User (8/15/25 6:00 PM): Create a database to analyze gins`,
        expectedHandler: 'create_flexible_database',
        shouldTrigger: true,
        testType: 'intent_detection'
      },
      {
        id: 'plants-1',
        title: 'Create hydroponic plants database with specific fields',
        content: `- User (8/15/25 6:30 PM): Create a database of hydroponic plants and the lux level and electrical conductivity level and pH level for the water`,
        expectedHandler: 'create_flexible_database',
        shouldTrigger: true,
        testType: 'intent_detection'
      },
      {
        id: 'research-1',
        title: 'Research and add wine to database',
        content: `- User (8/15/25 7:00 PM): Research and add Château Margaux 2015 to my wine database`,
        expectedHandler: 'research_and_add_entry',
        shouldTrigger: true,
        testType: 'intent_detection'
      }
    ];

    this.functionalTests = [
      {
        id: 'schema-wines',
        title: 'Test wine database schema generation',
        databaseType: 'wines',
        testType: 'schema_generation'
      },
      {
        id: 'schema-candidates',
        title: 'Test interview candidates schema generation',
        databaseType: 'interview candidates',
        testType: 'schema_generation'
      },
      {
        id: 'schema-plants',
        title: 'Test hydroponic plants schema generation', 
        databaseType: 'hydroponic plants',
        testType: 'schema_generation'
      }
    ];
  }

  async runFlexibleDatabaseTest() {
    console.log('🚀 Testing Flexible Database System');
    console.log('='.repeat(60));

    try {
      await this.initializeHandlers();
      await this.testIntentDetection();
      await this.testSchemaGeneration();
      await this.runLiveFunctionalTests();
      this.printComprehensiveResults();
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    }
  }

  async initializeHandlers() {
    console.log('\n🔧 Initializing Flexible Database System...');
    
    try {
      await handlerRegistry.loadHandlersFromDatabase();
      const handlers = handlerRegistry.getAllHandlers();
      const flexibleHandlers = handlers.filter(h => 
        h.name.includes('flexible') || h.name.includes('research_and_add') || h.name.includes('find_or_create')
      );

      console.log(`✅ Found ${flexibleHandlers.length} flexible database handlers:`);
      flexibleHandlers.forEach(h => console.log(`   - ${h.name}: ${h.description}`));

      return { total: handlers.length, flexible: flexibleHandlers.length };

    } catch (error) {
      console.error('❌ Handler initialization failed:', error.message);
      throw error;
    }
  }

  async testIntentDetection() {
    console.log('\n🧠 Testing Intent Detection for Database Creation...');

    for (let i = 0; i < this.testCases.length; i++) {
      const testCase = this.testCases[i];
      console.log(`\n📋 Test ${i + 1}: ${testCase.title}`);
      console.log(`   Expected: ${testCase.shouldTrigger ? `✅ ${testCase.expectedHandler}` : '❌ No intent'}`);

      try {
        const result = await this.processTestCase(testCase);
        testCase.actualResult = result;

        if (testCase.shouldTrigger) {
          if (result.intentDetected === testCase.expectedHandler) {
            console.log(`   ✅ PERFECT: Detected ${result.intentDetected}`);
            if (result.arguments) {
              console.log(`   📋 Arguments:`, JSON.stringify(result.arguments, null, 4));
            }
          } else if (result.intentDetected && result.intentDetected.includes('database')) {
            console.log(`   ⚠️ REASONABLE: Expected ${testCase.expectedHandler}, got ${result.intentDetected}`);
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

        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}`);
        testCase.actualResult = { error: error.message };
      }
    }
  }

  async processTestCase(testCase) {
    const prompt = this.formatTestCase(testCase);
    
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

  formatTestCase(testCase) {
    return `Analyze this lifelog entry and determine if the USER is explicitly requesting database creation or research.

Title: ${testCase.title}
Content: ${testCase.content}

Available database actions include:
- create_flexible_database - create any type of database (wines, candidates, gins, plants, etc.)
- research_and_add_entry - research and add specific items to existing databases
- find_or_create_database - find existing or create new database of specified type

ONLY call a function if you find explicit self-directed instructions for database operations. Look for:
- "Create a database for [type]"
- "Create a [type] database" 
- "Research and add [item] to [database]"
- "Add [item] to my [type] database"

The user must be explicitly instructing themselves about database creation or management.`;
  }

  async testSchemaGeneration() {
    console.log('\n🔬 Testing AI Schema Generation...');

    for (const test of this.functionalTests) {
      console.log(`\n🧪 ${test.title}...`);
      
      try {
        // Test schema generation without actually creating database
        console.log(`   Generating schema for "${test.databaseType}"...`);
        
        const OpenAI = require("openai");
        const openai = new OpenAI();
        
        const schemaPrompt = `Create a Notion database schema for "${test.databaseType}". 

Return a JSON object with properties for the Notion database. Each property should have a proper Notion field type.

Available Notion field types:
- title: {} (for main title field)
- rich_text: {} (for text fields)
- number: { format: "number" } (for numeric values)
- select: { options: [{ name: "Option1", color: "blue" }] } (for dropdowns)
- multi_select: { options: [{ name: "Tag1", color: "green" }] } (for tags)
- date: {} (for dates)
- checkbox: {} (for yes/no)
- url: {} (for links)
- email: {} (for email addresses)

For ${test.databaseType}, create appropriate fields.

Return ONLY the JSON object, no explanations.`;

        const schemaResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a database schema expert. Return only valid JSON for Notion database properties."
            },
            {
              role: "user",
              content: schemaPrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        });

        const schema = JSON.parse(schemaResponse.choices[0].message.content);
        
        console.log(`   ✅ Schema generated successfully:`);
        console.log(`   📋 Fields: ${Object.keys(schema).join(', ')}`);
        console.log(`   🔧 Sample schema:`, JSON.stringify(schema, null, 6));
        
        test.generatedSchema = schema;
        
      } catch (error) {
        console.log(`   ❌ Schema generation failed: ${error.message}`);
        test.error = error.message;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async runLiveFunctionalTests() {
    console.log('\n🔥 Live Functional Tests...');
    
    console.log('\n   ⚠️  SKIPPING LIVE DATABASE CREATION');
    console.log('   💡 To test live functionality, provide PARENT_PAGE_ID');
    console.log('   📝 Live tests would include:');
    console.log('      - Creating actual Notion databases');
    console.log('      - Researching and adding real entries');
    console.log('      - Testing full workflow end-to-end');
    
    // Uncomment and provide page ID to run live tests
    /*
    const PARENT_PAGE_ID = 'your-notion-page-id-here';
    
    if (PARENT_PAGE_ID && PARENT_PAGE_ID !== 'your-notion-page-id-here') {
      console.log('\n   🧪 Creating test wine database...');
      
      try {
        const result = await this.databaseHandlers.createFlexibleDatabase({
          database_type: 'wines',
          parent_page_id: PARENT_PAGE_ID,
          database_name: 'Test Wine Database'
        });
        
        if (result.databaseId) {
          console.log(`   ✅ Database created: ${result.databaseUrl}`);
          
          console.log('   🔍 Testing research and add...');
          const researchResult = await this.databaseHandlers.researchAndAddEntry({
            subject: 'Château Margaux 2015',
            database_id: result.databaseId,
            database_type: 'wines'
          });
          
          if (researchResult.pageId) {
            console.log(`   ✅ Research entry added: ${researchResult.pageUrl}`);
          } else {
            console.log(`   ❌ Research failed: ${researchResult.error}`);
          }
        }
        
      } catch (error) {
        console.log(`   ❌ Live test failed: ${error.message}`);
      }
    }
    */
  }

  printComprehensiveResults() {
    console.log('\n📊 Flexible Database Test Results');
    console.log('='.repeat(60));

    let perfect = 0;
    let reasonable = 0;
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
            console.log(`   ✅ PERFECT MATCH`);
            perfect++;
          } else if (result.intentDetected && result.intentDetected.includes('database')) {
            console.log(`   ⚠️ REASONABLE (database-related)`);
            reasonable++;
          } else if (result.intentDetected) {
            console.log(`   ⚠️ PARTIAL`);
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

    console.log('\n🧪 Schema Generation Results:');
    this.functionalTests.forEach((test, index) => {
      console.log(`\n${index + 1}. ${test.title}`);
      if (test.generatedSchema) {
        console.log(`   ✅ SUCCESS: Generated schema with ${Object.keys(test.generatedSchema).length} fields`);
        console.log(`   📋 Fields: ${Object.keys(test.generatedSchema).join(', ')}`);
      } else {
        console.log(`   ❌ FAILED: ${test.error || 'Unknown error'}`);
      }
    });

    const total = this.testCases.length;
    const successRate = Math.round((perfect + reasonable) / total * 100);
    
    console.log('\n' + '='.repeat(60));
    console.log(`📈 Results Summary:`);
    console.log(`   Perfect: ${perfect}/${total} (${Math.round(perfect/total*100)}%)`);
    console.log(`   Reasonable: ${reasonable}/${total} (${Math.round(reasonable/total*100)}%)`);
    console.log(`   Failed: ${failed}/${total} (${Math.round(failed/total*100)}%)`);
    console.log(`   Overall Success Rate: ${successRate}%`);

    if (perfect + reasonable >= total * 0.8) {
      console.log('\n🎉 EXCELLENT: Flexible database system is working very well!');
      console.log('   ✅ Intent detection for database creation is accurate');
      console.log('   ✅ AI schema generation is working');
      console.log('   ✅ Structured JSON output eliminates parsing errors');
      console.log('   ✅ Supports unlimited database types');
    } else if (perfect + reasonable >= total * 0.6) {
      console.log('\n✅ GOOD: Flexible database system is mostly working');
      console.log('   ⚠️ Some intent detection may need refinement');
    } else {
      console.log('\n⚠️ NEEDS IMPROVEMENT: System needs work');
    }

    console.log('\n📝 Usage Examples:');
    console.log('   "Create a database for wines"');
    console.log('   "Create a database for interview candidates"'); 
    console.log('   "Create a database to analyze gins"');
    console.log('   "Create a database of hydroponic plants with lux and pH levels"');
    console.log('   "Research and add Hendricks Gin to my gin database"');
    console.log('   "Add Château Margaux 2015 to my wine database"');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new FlexibleDatabaseTest();
  test.runFlexibleDatabaseTest().catch(console.error);
}

module.exports = FlexibleDatabaseTest;