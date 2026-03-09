const LifelogAgent = require('../agent');

async function testStockSaving() {
  console.log('📈 TESTING STOCK ANALYSIS SAVING\n');
  
  const agent = new LifelogAgent();
  
  const stockLifelog = {
    id: 'test-stock-saving',
    title: 'Stock analysis test',
    markdown: 'Analyze NVDA stock and save the results.',
    processed: false
  };
  
  console.log('📋 Input:', stockLifelog.markdown);
  console.log('🎯 Expected: Analyze NVDA → Save to Stock Analysis database\n');
  
  // Track all tool calls
  const toolCalls = [];
  const originalExecuteTool = agent.executeTool.bind(agent);
  
  agent.executeTool = async function(toolName, input) {
    console.log(`🔧 Tool Called: ${toolName}`);
    console.log(`   Input:`, JSON.stringify(input, null, 2));
    
    toolCalls.push({ tool: toolName, input });
    
    const result = await originalExecuteTool(toolName, input);
    console.log(`   Success: ${result.success}`);
    if (result.message) console.log(`   Message: ${result.message}`);
    console.log('');
    
    return result;
  };
  
  try {
    const startTime = Date.now();
    await agent.processLifelog(stockLifelog);
    const duration = Date.now() - startTime;
    
    console.log('📊 ANALYSIS:');
    console.log(`Total tools called: ${toolCalls.length}`);
    console.log(`Duration: ${duration}ms`);
    
    const hasAnalyze = toolCalls.some(call => call.tool === 'analyze_stock');
    const hasSave = toolCalls.some(call => call.tool === 'save_stock_analysis');
    
    console.log(`✅ Stock analyzed: ${hasAnalyze}`);
    console.log(`✅ Results saved: ${hasSave}`);
    
    console.log('\n🎯 SUCCESS CRITERIA:');
    console.log(`✅ Analysis performed: ${hasAnalyze ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Results saved to DB: ${hasSave ? 'PASS' : 'FAIL'}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (agent.db && agent.db.end) {
      await agent.db.end();
    }
  }
}

testStockSaving().catch(console.error);