require('dotenv').config({ path: '.env.local' });
const handlerRegistry = require('../services/handlerRegistry');
const UnhandledIntentHandlers = require('../handlers/unhandledIntentHandlers');

async function registerUnhandledIntentHandlers() {
  console.log('📝 Registering Unhandled Intent Handlers');
  console.log('='.repeat(45));

  try {
    const schemas = UnhandledIntentHandlers.getHandlerSchemas();
    
    for (const handlerSchema of schemas) {
      console.log(`Registering handler: ${handlerSchema.name}`);
      
      const success = await handlerRegistry.registerHandler(
        handlerSchema.name,
        handlerSchema.description,
        handlerSchema.schema
      );
      
      if (success) {
        console.log(`✅ Successfully registered: ${handlerSchema.name}`);
      } else {
        console.log(`❌ Failed to register: ${handlerSchema.name}`);
      }
    }

    console.log('\n📊 Handler Registration Complete!');
    
    // Test that handlers are accessible
    console.log('\n🧪 Testing Handler Access...');
    const allHandlers = handlerRegistry.getAllHandlers();
    const unhandledHandlers = allHandlers.filter(h => h.name.includes('development_log') || h.name.includes('unhandled_intent'));
    
    console.log(`Found ${unhandledHandlers.length} unhandled intent handlers:`);
    unhandledHandlers.forEach(handler => {
      console.log(`   - ${handler.name}: ${handler.description}`);
    });

  } catch (error) {
    console.error('❌ Registration failed:', error.message);
  }
}

if (require.main === module) {
  registerUnhandledIntentHandlers().catch(console.error);
}

module.exports = registerUnhandledIntentHandlers;