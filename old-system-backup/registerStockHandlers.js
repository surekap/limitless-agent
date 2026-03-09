require('dotenv').config({ path: '.env.local' });
const handlerRegistry = require('../services/handlerRegistry');
const StockAnalysisHandlers = require('../handlers/stockAnalysisHandlers');
const pool = require('../db');

async function registerStockHandlers() {
  console.log('🚀 Registering Stock Analysis Handlers...');
  console.log('='.repeat(50));

  try {
    // Get handler schemas
    const schemas = StockAnalysisHandlers.getHandlerSchemas();
    
    console.log(`Found ${schemas.length} stock analysis handlers to register:`);
    schemas.forEach(schema => {
      console.log(`  - ${schema.name}: ${schema.description}`);
    });

    console.log('\n📝 Registering handlers in database...');
    
    // Register each handler
    for (const schema of schemas) {
      try {
        await handlerRegistry.registerHandler(
          schema.name,
          schema.description,
          schema.schema
        );
        console.log(`✅ ${schema.name} registered successfully`);
      } catch (error) {
        console.log(`❌ Failed to register ${schema.name}: ${error.message}`);
      }
    }

    // Reload handlers from database
    console.log('\n🔄 Reloading handler registry...');
    await handlerRegistry.loadHandlersFromDatabase();
    
    // Verify registration
    const allHandlers = handlerRegistry.getAllHandlers();
    const stockHandlers = allHandlers.filter(h => 
      h.name.includes('stock') || h.name.includes('analyze') || h.name.includes('research')
    );
    
    console.log(`\n📊 Registration Summary:`);
    console.log(`  Total handlers: ${allHandlers.length}`);
    console.log(`  Stock handlers: ${stockHandlers.length}`);
    
    console.log('\n🎯 Stock Analysis Handlers:');
    stockHandlers.forEach(handler => {
      console.log(`  ✅ ${handler.name}: ${handler.description}`);
    });

    console.log('\n🎉 Stock analysis handlers registration completed!');
    console.log('\nYou can now use these handlers in your lifelogs:');
    console.log('  "Analyze the stock for NAZARA Technologies"');
    console.log('  "Research Apple stock sentiment"');
    console.log('  "Create a stock analysis database in Notion"');

  } catch (error) {
    console.error('❌ Registration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run registration if this file is executed directly
if (require.main === module) {
  registerStockHandlers().catch(console.error);
}

module.exports = registerStockHandlers;