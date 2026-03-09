const LifelogAgent = require('../agent');

async function testImprovedAgent() {
  console.log('🔧 TESTING IMPROVED AGENT - Database Reuse & Population\n');
  
  const agent = new LifelogAgent();
  
  const homeTheaterLifelog = {
    id: 'test-home-theater-improved',
    title: 'Home theater research',
    markdown: 'Create a database of home theater systems available in India and add Sony, Yamaha, and Denon options to it.',
    processed: false
  };
  
  console.log('📋 Input:', homeTheaterLifelog.markdown);
  console.log('🎯 Expected: Find existing home theater DB → Add 3 systems\n');
  
  // Track all tool calls
  const toolCalls = [];
  const originalExecuteTool = agent.executeTool.bind(agent);
  
  agent.executeTool = async function(toolName, input) {
    console.log(`🔧 Tool Called: ${toolName}`);
    console.log(`   Input:`, JSON.stringify(input, null, 2));
    
    toolCalls.push({ tool: toolName, input });
    
    const result = await originalExecuteTool(toolName, input);
    console.log(`   Result:`, JSON.stringify(result, null, 2));
    console.log('');
    
    return result;
  };
  
  try {
    const startTime = Date.now();
    await agent.processLifelog(homeTheaterLifelog);
    const duration = Date.now() - startTime;
    
    console.log('📊 ANALYSIS:');
    console.log(`Total tools called: ${toolCalls.length}`);
    console.log(`Duration: ${duration}ms`);
    
    const hasFind = toolCalls.some(call => call.tool === 'find_database');
    const hasCreate = toolCalls.some(call => call.tool === 'create_database');
    const addCalls = toolCalls.filter(call => call.tool === 'add_to_database').length;
    
    console.log(`✅ Found database first: ${hasFind}`);
    console.log(`❓ Created new database: ${hasCreate}`);
    console.log(`📝 Items added: ${addCalls}`);
    
    console.log('\n🎯 SUCCESS CRITERIA:');
    console.log(`✅ Database search: ${hasFind ? 'PASS' : 'FAIL'}`);
    console.log(`✅ No duplicates: ${!hasCreate ? 'PASS (reused existing)' : 'FAIL (created new)'}`);
    console.log(`✅ Data populated: ${addCalls >= 3 ? 'PASS' : 'FAIL'} (${addCalls}/3 systems)`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (agent.db && agent.db.end) {
      await agent.db.end();
    }
  }
}

testImprovedAgent().catch(console.error);