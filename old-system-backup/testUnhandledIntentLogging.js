require('dotenv').config({ path: '.env.local' });
const UnhandledIntentHandlers = require('../handlers/unhandledIntentHandlers');

async function testUnhandledIntentLogging() {
  console.log('🔧 Testing Unhandled Intent Logging System');
  console.log('='.repeat(50));

  try {
    const unhandledHandlers = new UnhandledIntentHandlers();
    const PARENT_PAGE_ID = '25051a7a4e068074a327d21b3df6a7b4';

    console.log('📊 Step 1: Creating Development Log Database...');
    const devLogResult = await unhandledHandlers.findOrCreateDevelopmentLog({
      parent_page_id: PARENT_PAGE_ID
    });

    if (devLogResult.databaseId) {
      console.log('✅ Development log database ready!');
      console.log(`   Database ID: ${devLogResult.databaseId}`);
      console.log(`   Database URL: ${devLogResult.databaseUrl}`);
      console.log(`   Created new: ${devLogResult.created !== false}`);

      console.log('\n🔍 Step 2: Testing Intent Logging...');
      
      // Test with various unhandled intent examples
      const testIntents = [
        {
          request: "I need to integrate with my Spotify playlist and automatically add songs I mention to a specific playlist",
          description: "Test music integration intent"
        },
        {
          request: "Set up automatic expense tracking from my bank statements and categorize them in a spreadsheet", 
          description: "Test financial automation intent"
        },
        {
          request: "Create a system to automatically backup my photos to multiple cloud services",
          description: "Test backup automation intent"
        }
      ];

      for (let i = 0; i < testIntents.length; i++) {
        const intent = testIntents[i];
        console.log(`\n   Testing intent ${i + 1}: ${intent.description}`);
        
        const logResult = await unhandledHandlers.logUnhandledIntent({
          user_request: intent.request,
          lifelog_content: `Test lifelog content: ${intent.request}`,
          database_id: devLogResult.databaseId
        });

        if (logResult.pageId) {
          console.log(`   ✅ Intent logged successfully!`);
          console.log(`      Page URL: ${logResult.pageUrl}`);
          console.log(`      Priority: ${logResult.priority}`);
          console.log(`      Suggested Handler: ${logResult.suggestedHandler}`);
          console.log(`      Categories: ${logResult.analysis.categories.join(', ')}`);
        } else {
          console.log(`   ❌ Failed to log intent: ${logResult.error}`);
        }
      }

      console.log('\n🧪 Step 3: Testing Direct Database Creation...');
      const directDbResult = await unhandledHandlers.createDevelopmentLogDatabase({
        parent_page_id: PARENT_PAGE_ID,
        database_name: 'Test Development Log'
      });

      if (directDbResult.databaseId) {
        console.log('✅ Direct database creation successful!');
        console.log(`   Database ID: ${directDbResult.databaseId}`);
        console.log(`   Schema fields: ${Object.keys(directDbResult.schema).join(', ')}`);
      } else {
        console.log('❌ Direct database creation failed:', directDbResult.error);
      }

    } else {
      console.log('❌ Failed to create/find development log database:', devLogResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

if (require.main === module) {
  testUnhandledIntentLogging().catch(console.error);
}

module.exports = testUnhandledIntentLogging;