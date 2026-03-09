require('dotenv').config({ path: '.env.local' });
const PerplexityHandler = require('../services/perplexityHandler');

async function debugPriceExtraction() {
  console.log('🔍 Debugging Price Extraction for NAZARA Technologies');
  console.log('='.repeat(60));

  try {
    const perplexity = new PerplexityHandler();
    
    console.log('📊 Getting fresh analysis...');
    const result = await perplexity.searchStock('NAZARA Technologies');
    
    if (result.success) {
      console.log('\n📄 Full Analysis Content:');
      console.log('='.repeat(40));
      console.log(result.content);
      
      console.log('\n🔧 Testing Price Parsing...');
      console.log('='.repeat(40));
      const parsed = perplexity.parseStockAnalysis(result.content);
      
      console.log('Parsed results:');
      console.log('- Recommendation:', parsed?.recommendation);
      console.log('- Current Price:', parsed?.currentPrice);
      console.log('- Target Price:', parsed?.targetPrice);
      console.log('- Currency:', parsed?.currency);
      console.log('- Timeframe:', parsed?.timeframe);
      console.log('- Upside:', parsed?.upside);
      
      // Test specific patterns manually
      console.log('\n🧪 Manual Pattern Testing:');
      console.log('='.repeat(40));
      
      // Test current price patterns
      const currentPriceMatches = [
        result.content.match(/current\s+price[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i),
        result.content.match(/price[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i),
        result.content.match(/₹(\d+(?:,\d+)*(?:\.\d+)?)/),
        result.content.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*per\s+share/i)
      ];
      
      console.log('Current price pattern matches:');
      currentPriceMatches.forEach((match, index) => {
        console.log(`  Pattern ${index + 1}:`, match);
      });
      
      // Test target price patterns
      const targetPriceMatches = [
        result.content.match(/target\s+price[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i),
        result.content.match(/target[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i)
      ];
      
      console.log('Target price pattern matches:');
      targetPriceMatches.forEach((match, index) => {
        console.log(`  Pattern ${index + 1}:`, match);
      });
      
    } else {
      console.error('❌ Failed to get analysis:', result.error);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

if (require.main === module) {
  debugPriceExtraction().catch(console.error);
}

module.exports = debugPriceExtraction;