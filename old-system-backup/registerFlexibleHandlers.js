require('dotenv').config({ path: '.env.local' });
const handlerRegistry = require('../services/handlerRegistry');
const FlexibleDatabaseHandlers = require('../handlers/flexibleDatabaseHandlers');
const pool = require('../db');

async function registerFlexibleHandlers() {
  console.log('🚀 Registering Flexible Database Handlers...');
  console.log('='.repeat(50));

  try {
    // Get handler schemas
    const schemas = FlexibleDatabaseHandlers.getHandlerSchemas();
    
    console.log(`Found ${schemas.length} flexible database handlers to register:`);
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
    const flexibleHandlers = allHandlers.filter(h => 
      h.name.includes('flexible') || h.name.includes('database') || h.name.includes('research_and_add')
    );
    
    console.log(`\n📊 Registration Summary:`);
    console.log(`  Total handlers: ${allHandlers.length}`);
    console.log(`  Flexible database handlers: ${flexibleHandlers.length}`);
    
    console.log('\n🎯 Flexible Database Handlers:');
    flexibleHandlers.forEach(handler => {
      console.log(`  ✅ ${handler.name}: ${handler.description}`);
    });

    console.log('\n🎉 Flexible database handlers registration completed!');
    console.log('\nYou can now use these handlers in your lifelogs:');
    console.log('  "Create a database for wines"');
    console.log('  "Create a database for interview candidates"');
    console.log('  "Create a database to analyze gins"');
    console.log('  "Create a database of hydroponic plants with lux and pH levels"');
    console.log('  "Research and add Hendricks Gin to my gin database"');
    console.log('  "Add Château Margaux 2015 to my wine database"');

  } catch (error) {
    console.error('❌ Registration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run registration if this file is executed directly
if (require.main === module) {
  registerFlexibleHandlers().catch(console.error);
}

module.exports = registerFlexibleHandlers;