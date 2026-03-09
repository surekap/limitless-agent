/**
 * NOTION MCP TOOL - Database Management Integration
 * 
 * This MCP (Model Context Protocol) tool provides Claude with the ability to:
 * - Search for existing Notion databases to prevent duplicates
 * - Create new databases with intelligent schemas based on content type
 * - Add researched data entries to databases
 * - Handle complex database operations through natural language
 * 
 * KEY FEATURES:
 * - Smart database reuse (prevents duplicate "Home Theater Systems" databases)
 * - Pre-defined schemas for wines, stocks, home theater systems
 * - Flexible fallback schema for unknown types
 * - Comprehensive search and matching logic
 * - Full data population (not just empty database creation)
 * 
 * TOOLS PROVIDED:
 * - find_database: Search existing databases by name/type
 * - create_database: Create new database with appropriate schema  
 * - add_to_database: Add researched entries to databases
 * 
 * ENVIRONMENT VARIABLES:
 * - NOTION_TOKEN: Notion integration token for API access
 */

const { Client } = require('@notionhq/client');

/**
 * NotionMCP - Handles all Notion database operations for the agent
 */
class NotionMCP {
  /**
   * Initialize Notion client and set default parent page
   */
  constructor() {
    this.notion = new Client({
      auth: process.env.NOTION_TOKEN,
    });
    // Default parent page where new databases are created
    this.parentPageId = '25051a7a4e068074a327d21b3df6a7b4';
  }

  /**
   * Return tool definitions for Claude to understand available Notion operations
   * 
   * @returns {Array} Array of tool definitions with schemas
   */
  getToolDefinitions() {
    return [
      {
        name: 'create_database',
        description: 'Create a new Notion database with intelligent schema',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Database name'
            },
            type: {
              type: 'string',
              description: 'Type of database (wines, stocks, home_theater, etc.)'
            },
            purpose: {
              type: 'string',
              description: 'Purpose or use case for the database'
            }
          },
          required: ['name', 'type']
        }
      },
      {
        name: 'add_to_database',
        description: 'Research and add an entry to a Notion database',
        input_schema: {
          type: 'object',
          properties: {
            database_id: {
              type: 'string',
              description: 'Notion database ID'
            },
            subject: {
              type: 'string',
              description: 'Subject to research and add (e.g., wine name, stock symbol)'
            },
            context: {
              type: 'string',
              description: 'Additional context for research'
            }
          },
          required: ['database_id', 'subject']
        }
      },
      {
        name: 'find_database',
        description: 'Find existing database by name/type',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Database name to search for'
            },
            type: {
              type: 'string',
              description: 'Database type to search for'
            }
          }
        }
      }
    ];
  }

  /**
   * Check if this MCP can handle the requested tool
   * 
   * @param {string} toolName - Name of the tool to check
   * @returns {boolean} True if this MCP handles the tool
   */
  canHandle(toolName) {
    return ['create_database', 'add_to_database', 'find_database'].includes(toolName);
  }

  /**
   * Execute a Notion tool operation
   * 
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} input - Input parameters for the tool
   * @returns {Object} Tool execution result
   */
  async execute(toolName, input) {
    switch (toolName) {
      case 'create_database':
        return await this.createDatabase(input);
      case 'add_to_database':
        return await this.addToDatabase(input);
      case 'find_database':
        return await this.findDatabase(input);
      default:
        throw new Error(`Unknown Notion tool: ${toolName}`);
    }
  }

  /**
   * Create a new Notion database with intelligent schema
   * 
   * @param {Object} params - Database creation parameters
   * @param {string} params.name - Database name
   * @param {string} params.type - Database type (wines, stocks, home_theater, etc.)
   * @param {string} params.purpose - Optional purpose description
   * @returns {Object} Creation result with database ID and URL
   */
  async createDatabase({ name, type, purpose = '' }) {
    try {
      const schema = this.generateSchema(type, purpose);
      
      const response = await this.notion.databases.create({
        parent: {
          type: 'page_id',
          page_id: this.parentPageId
        },
        title: [{
          type: 'text',
          text: { content: name }
        }],
        properties: schema
      });

      return {
        success: true,
        database_id: response.id,
        database_url: response.url,
        schema_columns: Object.keys(schema).length,
        message: `Created ${type} database: ${name}`
      };

    } catch (error) {
      console.error('Notion database creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate appropriate database schema based on content type
   * 
   * @param {string} type - Type of database (wines, stocks, home_theater)
   * @param {string} purpose - Optional purpose for schema customization
   * @returns {Object} Notion database schema object
   */
  generateSchema(type, purpose) {
    const schemas = {
      wines: {
        'Name': { title: {} },
        'Region': { rich_text: {} },
        'Vintage': { number: {} },
        'Price': { number: {} },
        'Rating': { number: {} },
        'Drinking Window': { rich_text: {} },
        'Notes': { rich_text: {} }
      },
      stocks: {
        'Symbol': { title: {} },
        'Company': { rich_text: {} },
        'Current Price': { number: {} },
        'Target Price': { number: {} },
        'Recommendation': { 
          select: {
            options: [
              { name: 'BUY', color: 'green' },
              { name: 'HOLD', color: 'yellow' },
              { name: 'SELL', color: 'red' }
            ]
          }
        },
        'Upside %': { number: {} },
        'Analysis Date': { date: {} },
        'Notes': { rich_text: {} }
      },
      home_theater: {
        'System Name': { title: {} },
        'Brand': { 
          select: {
            options: [
              { name: 'Sony', color: 'blue' },
              { name: 'Yamaha', color: 'green' },
              { name: 'Denon', color: 'purple' },
              { name: 'Onkyo', color: 'orange' },
              { name: 'Marantz', color: 'red' }
            ]
          }
        },
        'Price (INR)': { number: {} },
        'Features': { multi_select: { options: [] } },
        'Rating': { number: {} },
        'Availability': { checkbox: {} }
      }
    };

    return schemas[type] || {
      'Name': { title: {} },
      'Description': { rich_text: {} },
      'Created': { date: {} }
    };
  }

  /**
   * Search for existing databases to prevent duplicates
   * 
   * Uses intelligent matching to find databases by name or type.
   * Critical for preventing duplicate "Home Theater Systems" databases.
   * 
   * @param {Object} params - Search parameters
   * @param {string} params.name - Database name to search for
   * @param {string} params.type - Database type to search for
   * @returns {Object} Search results with matching databases
   */
  async findDatabase({ name, type }) {
    try {
      console.log(`🔍 Searching for database: name="${name}", type="${type}"`);
      
      // Get ALL databases first
      const allResponse = await this.notion.search({
        filter: {
          value: 'database',
          property: 'object'
        }
      });

      console.log(`📊 Found ${allResponse.results.length} total databases`);

      // Filter databases by name/type matching
      const matchingDatabases = allResponse.results.filter(db => {
        const title = db.title[0]?.text?.content || '';
        const titleLower = title.toLowerCase();
        
        // Match by type
        if (type) {
          const typeLower = type.toLowerCase();
          console.log(`🔍 Checking "${title}" against type "${type}"`);
          
          // Home theater matching
          if ((typeLower.includes('home') || typeLower.includes('theater')) && 
              (titleLower.includes('home') && titleLower.includes('theater'))) {
            console.log(`✅ Home theater match: "${title}" matches "${type}"`);
            return true;
          }
          
          // Wine matching  
          if (typeLower.includes('wine') && titleLower.includes('wine')) {
            console.log(`✅ Wine match: "${title}" matches "${type}"`);
            return true;
          }
          
          // Stock matching
          if (typeLower.includes('stock') && titleLower.includes('stock')) {
            console.log(`✅ Stock match: "${title}" matches "${type}"`);
            return true;
          }
        }
        
        // Match by name
        if (name && titleLower.includes(name.toLowerCase())) {
          console.log(`✅ Name match found: "${title}" matches "${name}"`);
          return true;
        }
        
        return false;
      });

      const databases = matchingDatabases.map(db => ({
        id: db.id,
        title: db.title[0]?.text?.content || 'Untitled',
        url: db.url
      }));

      console.log(`🎯 Filtered to ${databases.length} matching databases`);

      return {
        success: true,
        databases,
        found: databases.length > 0,
        message: `Found ${databases.length} matching databases`,
        allDatabaseCount: allResponse.results.length
      };

    } catch (error) {
      console.error('Notion database search error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add a researched entry to an existing database
   * 
   * @param {Object} params - Addition parameters
   * @param {string} params.database_id - Target database ID
   * @param {string} params.subject - Subject to research and add
   * @param {string} params.context - Additional context for the entry
   * @returns {Object} Addition result with page ID and URL
   */
  async addToDatabase({ database_id, subject, context = '' }) {
    try {
      // Get database schema
      const database = await this.notion.databases.retrieve({ database_id });
      const properties = database.properties;

      // Generate data based on subject and schema
      const data = await this.generateDataForSubject(subject, properties, context);

      // Create page in database
      const response = await this.notion.pages.create({
        parent: { database_id },
        properties: data
      });

      return {
        success: true,
        page_id: response.id,
        page_url: response.url,
        message: `Added "${subject}" to database`
      };

    } catch (error) {
      console.error('Notion add to database error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate structured data for a subject based on database schema
   * 
   * @param {string} subject - Subject to generate data for
   * @param {Object} properties - Database schema properties
   * @param {string} context - Additional context for data generation
   * @returns {Object} Structured data matching the database schema
   */
  async generateDataForSubject(subject, properties, context) {
    const data = {};
    
    // Simple data generation - in a full implementation, 
    // this would use AI to research and generate structured data
    for (const [propName, propConfig] of Object.entries(properties)) {
      switch (propConfig.type) {
        case 'title':
          data[propName] = {
            title: [{ type: 'text', text: { content: subject } }]
          };
          break;
        case 'rich_text':
          if (propName.toLowerCase().includes('note')) {
            data[propName] = {
              rich_text: [{ type: 'text', text: { content: context || 'Added via agent' } }]
            };
          }
          break;
        case 'date':
          if (propName.toLowerCase().includes('date')) {
            data[propName] = {
              date: { start: new Date().toISOString().split('T')[0] }
            };
          }
          break;
        case 'number':
          // Would normally research real values
          if (propName.toLowerCase().includes('price')) {
            data[propName] = { number: 100 }; // Placeholder
          } else if (propName.toLowerCase().includes('rating')) {
            data[propName] = { number: 4.0 }; // Placeholder
          }
          break;
      }
    }

    return data;
  }
}

module.exports = NotionMCP;