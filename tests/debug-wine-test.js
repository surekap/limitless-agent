const LifelogAgent = require('../agent');

async function debugWineTest() {
  console.log('🐛 DEBUGGING: Why wine isn\'t added to database\n');
  
  const agent = new LifelogAgent();
  
  const wineLifelog = {
    id: 'debug-wine',
    title: 'Wine addition test',
    markdown: 'Add Opus One 2018 to my wine database.',
    processed: false
  };
  
  console.log('📋 Input:', wineLifelog.markdown);
  console.log('🤖 Starting agent...\n');
  
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
    await agent.processLifelog(wineLifelog);
    
    console.log('📊 ANALYSIS:');
    console.log(`Total tools called: ${toolCalls.length}`);
    
    const hasFind = toolCalls.some(call => call.tool === 'find_database');
    const hasAdd = toolCalls.some(call => call.tool === 'add_to_database');
    
    console.log(`✅ Found database: ${hasFind}`);
    console.log(`❌ Added to database: ${hasAdd}`);
    
    if (!hasAdd) {
      console.log('\n🔍 ISSUE: Agent found database but didn\'t add wine to it');
      console.log('💡 FIX NEEDED: Agent needs to be told to add entries after finding database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (agent.db && agent.db.end) {
      await agent.db.end();
    }
  }
}

debugWineTest().catch(console.error);