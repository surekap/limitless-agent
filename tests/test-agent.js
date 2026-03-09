const LifelogAgent = require('../agent');

async function testAgent() {
  console.log('🧪 Testing Agent-based Lifelog Processing\n');
  
  const agent = new LifelogAgent();
  
  // Mock lifelog for testing
  const testLifelog = {
    id: 'test-001',
    title: 'Test lifelog with tasks',
    markdown: 'I need to finish the Limitless app. Also, analyze AAPL stock and add Chateau Margaux 2015 to my wine database.',
    start_time: new Date().toISOString(),
    processed: false
  };
  
  console.log('📝 Test Lifelog Content:');
  console.log(`Title: ${testLifelog.title}`);
  console.log(`Content: ${testLifelog.markdown}\n`);
  
  console.log('🤖 Starting agent processing...\n');
  
  try {
    await agent.processLifelog(testLifelog);
    console.log('\n✅ Agent test completed successfully!');
  } catch (error) {
    console.error('\n❌ Agent test failed:', error.message);
  } finally {
    // Close database connection
    if (agent.db && agent.db.end) {
      await agent.db.end();
    }
  }
}

testAgent();