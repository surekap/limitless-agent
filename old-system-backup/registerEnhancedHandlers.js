require('dotenv').config({ path: '.env.local' });
const handlerRegistry = require('../services/handlerRegistry');

async function registerEnhancedHandlers() {
  console.log('🔧 Registering enhanced database handlers...');

  const handlers = [
    {
      name: 'create_planned_database',
      description: 'Create a database with intelligently planned schema optimized for the use case',
      schema: {
        type: 'object',
        properties: {
          database_type: {
            type: 'string',
            description: 'Type of database (e.g., wines, stocks, home theater systems)'
          },
          parent_page_id: {
            type: 'string',
            description: 'Notion page ID where database should be created'
          },
          purpose: {
            type: 'string',
            description: 'Specific purpose or use case for the database'
          }
        },
        required: ['database_type', 'parent_page_id']
      }
    },
    {
      name: 'research_and_add_smart_entry',
      description: 'Research a subject and add structured entry to database with intelligent column mapping',
      schema: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: 'Subject to research (e.g., wine name, stock symbol, product name)'
          },
          database_id: {
            type: 'string',
            description: 'Notion database ID to add entry to'
          },
          additional_context: {
            type: 'string',
            description: 'Additional context or requirements for research'
          }
        },
        required: ['subject', 'database_id']
      }
    },
    {
      name: 'add_data_to_database',
      description: 'Add structured data to any Notion database with type validation',
      schema: {
        type: 'object',
        properties: {
          database_id: {
            type: 'string',
            description: 'Notion database ID'
          },
          data: {
            type: 'object',
            description: 'Structured data object with column names as keys',
            additionalProperties: true
          },
          validate: {
            type: 'boolean',
            description: 'Whether to validate data against database schema',
            default: true
          }
        },
        required: ['database_id', 'data']
      }
    },
    {
      name: 'get_database_info',
      description: 'Get database schema and column information',
      schema: {
        type: 'object',
        properties: {
          database_id: {
            type: 'string',
            description: 'Notion database ID to analyze'
          }
        },
        required: ['database_id']
      }
    }
  ];

  let registered = 0;
  for (const handler of handlers) {
    try {
      const success = await handlerRegistry.registerHandler(
        handler.name,
        handler.description,
        handler.schema
      );
      
      if (success) {
        console.log(`✅ Registered: ${handler.name}`);
        registered++;
      } else {
        console.log(`❌ Failed to register: ${handler.name}`);
      }
    } catch (error) {
      console.error(`❌ Error registering ${handler.name}:`, error.message);
    }
  }

  console.log(`\n🎉 Successfully registered ${registered}/${handlers.length} enhanced handlers`);
  
  // Reload handlers to make them available
  await handlerRegistry.loadHandlersFromDatabase();
  
  console.log(`📊 Total handlers available: ${handlerRegistry.getAllHandlers().length}`);
  
  process.exit(0);
}

registerEnhancedHandlers().catch(console.error);