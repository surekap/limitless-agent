require('dotenv').config({ path: '.env.local' });
const StockAnalysisHandlers = require('../handlers/stockAnalysisHandlers');

async function runLiveStockAnalysis() {
  console.log('🚀 Running Live Stock Analysis for NAZARA Technologies');
  console.log('='.repeat(60));

  try {
    const stockHandlers = new StockAnalysisHandlers();
    
    console.log('📊 Starting comprehensive analysis...');
    console.log('   Stock: NAZARA Technologies');
    console.log('   Type: Comprehensive analysis');
    console.log('   Save to Notion: Yes');
    
    const result = await stockHandlers.analyzeStock({
      stock_symbol: 'NAZARA Technologies',
      analysis_type: 'comprehensive',
      save_to_notion: true
    });

    console.log('\n✅ Analysis Complete!');
    console.log('='.repeat(40));
    
    if (result.analysis) {
      console.log('📈 Investment Analysis:');
      console.log(`   Company: ${result.analysis.symbol}`);
      console.log(`   Recommendation: ${result.analysis.recommendation}`);
      console.log(`   Target Price: ${result.analysis.targetPrice ? `$${result.analysis.targetPrice}` : 'N/A'}`);
      console.log(`   Current Price: ${result.analysis.currentPrice ? `$${result.analysis.currentPrice}` : 'N/A'}`);
      console.log(`   Upside Potential: ${result.analysis.upside || 'N/A'}`);
      console.log(`   Timeframe: ${result.analysis.timeframe}`);
      console.log(`   Analysis Date: ${result.analysis.analysisDate}`);
    }

    if (result.notion) {
      console.log('\n📝 Notion Integration:');
      console.log(`   Saved: ${result.notion.saved ? '✅ Yes' : '❌ No'}`);
      if (result.notion.saved && result.notion.pageUrl) {
        console.log(`   Page URL: ${result.notion.pageUrl}`);
      }
      if (result.notion.error) {
        console.log(`   Error: ${result.notion.error}`);
      }
    }

    if (result.sources && result.sources.length > 0) {
      console.log('\n📚 Sources:');
      result.sources.slice(0, 3).forEach((source, index) => {
        console.log(`   ${index + 1}. ${source}`);
      });
    }

    console.log('\n📄 Full Analysis Preview:');
    console.log('='.repeat(40));
    const preview = result.analysis.fullAnalysis.substring(0, 500);
    console.log(preview + (result.analysis.fullAnalysis.length > 500 ? '...' : ''));

    console.log('\n🎉 Live analysis completed successfully!');
    
    if (result.notion && result.notion.saved) {
      console.log('✅ Check your Notion workspace for the detailed analysis');
    } else {
      console.log('⚠️  Analysis completed but not saved to Notion (check NOTION_TOKEN or database setup)');
    }

  } catch (error) {
    console.error('❌ Live analysis failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   - Check PERPLEXITY_API_KEY in .env.local');
    console.error('   - Check NOTION_TOKEN in .env.local');
    console.error('   - Ensure you have a Notion integration set up');
    console.error('   - Run: node scripts/registerStockHandlers.js');
  }
}

// Run the live analysis
if (require.main === module) {
  runLiveStockAnalysis().catch(console.error);
}

module.exports = runLiveStockAnalysis;