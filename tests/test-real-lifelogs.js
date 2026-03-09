const LifelogAgent = require('../agent');

async function testWithRealLifelogs() {
  console.log('🔍 TESTING WITH REAL LIFELOGS FROM DATABASE\n');
  
  const agent = new LifelogAgent();
  
  try {
    // Get some recent unprocessed lifelogs
    console.log('📊 Checking real lifelogs in database...');
    
    const [unprocessedRows] = await agent.db.execute(
      'SELECT * FROM lifelogs WHERE processed = FALSE ORDER BY start_time DESC LIMIT ?',
      [3]
    );
    const lifelogs = unprocessedRows;
    
    if (lifelogs.length === 0) {
      console.log('ℹ️  No unprocessed lifelogs found. Let\'s check processed ones for testing:');
      
      const [processedLogs] = await agent.db.execute(
        'SELECT * FROM lifelogs ORDER BY start_time DESC LIMIT ?',
        [3]
      );
      
      console.log(`\n📋 Found ${processedLogs.length} recent lifelogs:`);
      
      for (let i = 0; i < processedLogs.length; i++) {
        const log = processedLogs[i];
        console.log(`\n${i + 1}. ID: ${log.id}`);
        console.log(`   Title: ${log.title}`);
        console.log(`   Time: ${log.start_time}`);
        console.log(`   Processed: ${log.processed ? 'Yes' : 'No'}`);
        
        if (log.markdown) {
          const preview = log.markdown.substring(0, 100);
          console.log(`   Content: ${preview}${log.markdown.length > 100 ? '...' : ''}`);
        }
      }
      
      // Test agent on one of them
      if (processedLogs.length > 0) {
        console.log('\n🤖 Testing agent on the most recent lifelog...\n');
        
        const testLog = { ...processedLogs[0], processed: false, id: 'real-test-' + processedLogs[0].id };
        
        const startTime = Date.now();
        await agent.processLifelog(testLog);
        const duration = Date.now() - startTime;
        
        console.log(`\n✅ Agent processed real lifelog in ${duration}ms`);
        console.log('🎯 Agent successfully handled real-world data!');
      }
      
    } else {
      console.log(`\n📋 Found ${lifelogs.length} unprocessed lifelogs. Processing with agent...\n`);
      
      for (const lifelog of lifelogs) {
        console.log(`🤖 Processing: ${lifelog.title}`);
        const startTime = Date.now();
        
        await agent.processLifelog(lifelog);
        
        const duration = Date.now() - startTime;
        console.log(`   ✅ Completed in ${duration}ms\n`);
      }
      
      console.log('🎯 Agent successfully processed all real lifelogs!');
    }
    
  } catch (error) {
    console.error('❌ Error testing with real lifelogs:', error.message);
  } finally {
    if (agent.db && agent.db.end) {
      await agent.db.end();
    }
  }
}

if (require.main === module) {
  testWithRealLifelogs().catch(console.error);
}

module.exports = { testWithRealLifelogs };