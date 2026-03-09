const { Client } = require('@notionhq/client');
const { interpret } = require('./openai');

class NotionDatabaseManager {
  constructor() {
    this.notion = new Client({
      auth: process.env.NOTION_TOKEN,
    });
  }

  /**
   * Plan and assess the most important columns for a new database
   */
  async planDatabaseSchema(databaseType, purpose) {
    const planningPrompt = `Plan the most important columns for a ${databaseType} database.

Purpose: ${purpose}

Consider these requirements:
1. Start with essential columns (5-8 max) - more can be added later
2. Include appropriate column types (text, number, select, multi_select, date, etc.)
3. Consider what data users would want to track, filter, and analyze
4. Include fields that enable useful sorting and searching

Return a well-planned schema with column names, types, and descriptions.`;

    const schemaSchema = [{
      type: "function",
      function: {
        name: "plan_database_schema",
        description: "Plan optimal column schema for a database",
        parameters: {
          type: "object",
          properties: {
            database_name: {
              type: "string",
              description: "Suggested name for the database"
            },
            columns: {
              type: "array",
              description: "Planned columns for the database",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Column name"
                  },
                  type: {
                    type: "string",
                    enum: ["title", "rich_text", "number", "select", "multi_select", "date", "checkbox", "url", "email"],
                    description: "Notion column type"
                  },
                  description: {
                    type: "string",
                    description: "What this column tracks"
                  },
                  options: {
                    type: "array",
                    description: "Options for select/multi_select fields",
                    items: { type: "string" }
                  }
                },
                required: ["name", "type", "description"]
              }
            },
            rationale: {
              type: "string",
              description: "Explanation of the schema design choices"
            }
          },
          required: ["database_name", "columns", "rationale"]
        }
      }
    }];

    try {
      const result = await interpret(planningPrompt, schemaSchema);
      
      if (result.type === 'tool_call') {
        console.log(`📋 Planned schema for ${databaseType} database:`);
        console.log(`   Name: ${result.arguments.database_name}`);
        console.log(`   Columns: ${result.arguments.columns.length}`);
        console.log(`   Rationale: ${result.arguments.rationale}`);
        
        result.arguments.columns.forEach(col => {
          console.log(`     - ${col.name} (${col.type}): ${col.description}`);
        });
        
        return result.arguments;
      }
    } catch (error) {
      console.error('Error planning database schema:', error);
      return this.getDefaultSchema(databaseType);
    }
  }

  /**
   * Get existing database schema (column information)
   */
  async getDatabaseSchema(databaseId) {
    try {
      const database = await this.notion.databases.retrieve({
        database_id: databaseId
      });

      const schema = {};
      
      for (const [propertyName, propertyConfig] of Object.entries(database.properties)) {
        schema[propertyName] = {
          name: propertyName,
          type: propertyConfig.type,
          config: propertyConfig
        };

        // Extract options for select fields
        if (propertyConfig.type === 'select' && propertyConfig.select?.options) {
          schema[propertyName].options = propertyConfig.select.options.map(opt => opt.name);
        }
        if (propertyConfig.type === 'multi_select' && propertyConfig.multi_select?.options) {
          schema[propertyName].options = propertyConfig.multi_select.options.map(opt => opt.name);
        }
      }

      console.log(`📊 Retrieved schema for database ${databaseId}:`, Object.keys(schema));
      return schema;
    } catch (error) {
      console.error('Error retrieving database schema:', error);
      throw error;
    }
  }

  /**
   * Generate structured data for database entry using LLM
   */
  async generateStructuredData(subject, databaseSchema, additionalContext = '') {
    const columnInfo = Object.entries(databaseSchema).map(([name, config]) => {
      let description = `${name} (${config.type})`;
      if (config.options) {
        description += ` - Options: ${config.options.join(', ')}`;
      }
      return description;
    }).join('\n');

    const dataGenerationPrompt = `Generate structured data for adding "${subject}" to a database.

Database Columns:
${columnInfo}

Additional Context: ${additionalContext}

Research and provide accurate, high-quality data for each column. Use realistic values that match the column types:

COLUMN TYPE GUIDELINES:
- title: Main identifier (required)
- rich_text: Detailed text content
- number: Numeric values only
- select: Choose ONE option from the provided list
- multi_select: Choose MULTIPLE options from the provided list (array)
- date: Use ISO date format (YYYY-MM-DD)
- checkbox: true/false boolean
- url: Valid HTTP/HTTPS URLs
- email: Valid email addresses

QUALITY REQUIREMENTS:
- Provide accurate, researched information
- Use proper data types
- Don't make up fake data
- Leave fields null if information is not available
- For select fields, use exact option names from the list`;

    const dataSchema = [{
      type: "function",
      function: {
        name: "generate_database_entry",
        description: "Generate structured data for database entry",
        parameters: {
          type: "object",
          properties: {
            data: {
              type: "object",
              description: "Structured data matching database schema",
              additionalProperties: true
            },
            research_notes: {
              type: "string",
              description: "Research findings and data sources used"
            },
            confidence_score: {
              type: "number",
              minimum: 1,
              maximum: 10,
              description: "Confidence in data accuracy (1-10)"
            }
          },
          required: ["data", "research_notes", "confidence_score"]
        }
      }
    }];

    try {
      const result = await interpret(dataGenerationPrompt, dataSchema);
      
      if (result.type === 'tool_call') {
        const generatedData = result.arguments;
        
        console.log(`🔬 Generated structured data for "${subject}":`);
        console.log(`   Confidence: ${generatedData.confidence_score}/10`);
        console.log(`   Research: ${generatedData.research_notes}`);
        console.log(`   Data fields: ${Object.keys(generatedData.data).length}`);
        
        // Validate and clean the data
        const validatedData = this.validateAndCleanData(generatedData.data, databaseSchema);
        
        return {
          data: validatedData,
          metadata: {
            research_notes: generatedData.research_notes,
            confidence_score: generatedData.confidence_score,
            generated_at: new Date().toISOString()
          }
        };
      }
    } catch (error) {
      console.error('Error generating structured data:', error);
      throw error;
    }
  }

  /**
   * Validate and clean data against database schema
   */
  validateAndCleanData(data, schema) {
    const cleanedData = {};
    
    for (const [columnName, value] of Object.entries(data)) {
      const columnConfig = schema[columnName];
      
      if (!columnConfig) {
        console.warn(`⚠️  Column "${columnName}" not found in schema, skipping`);
        continue;
      }

      try {
        const cleanedValue = this.validateColumnValue(value, columnConfig);
        if (cleanedValue !== null) {
          cleanedData[columnName] = cleanedValue;
        }
      } catch (error) {
        console.warn(`⚠️  Invalid value for column "${columnName}":`, error.message);
      }
    }

    console.log(`✅ Validated data: ${Object.keys(cleanedData).length}/${Object.keys(data).length} fields`);
    return cleanedData;
  }

  /**
   * Validate individual column value against its type
   */
  validateColumnValue(value, columnConfig) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    switch (columnConfig.type) {
      case 'title':
      case 'rich_text':
        return typeof value === 'string' ? value.trim() : String(value).trim();
      
      case 'number':
        const num = Number(value);
        if (isNaN(num)) throw new Error(`"${value}" is not a valid number`);
        return num;
      
      case 'select':
        if (!columnConfig.options?.includes(value)) {
          console.warn(`"${value}" not in select options, using closest match`);
          // Try to find closest match
          const closest = this.findClosestOption(value, columnConfig.options);
          return closest;
        }
        return value;
      
      case 'multi_select':
        const values = Array.isArray(value) ? value : [value];
        return values.filter(v => columnConfig.options?.includes(v));
      
      case 'date':
        // Validate ISO date format
        const date = new Date(value);
        if (isNaN(date.getTime())) throw new Error(`"${value}" is not a valid date`);
        return value;
      
      case 'checkbox':
        return Boolean(value);
      
      case 'url':
        try {
          new URL(value);
          return value;
        } catch {
          throw new Error(`"${value}" is not a valid URL`);
        }
      
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) throw new Error(`"${value}" is not a valid email`);
        return value;
      
      default:
        return value;
    }
  }

  /**
   * Find closest option for select fields
   */
  findClosestOption(value, options) {
    if (!options || options.length === 0) return null;
    
    const valueLower = value.toLowerCase();
    
    // Exact match (case insensitive)
    const exactMatch = options.find(opt => opt.toLowerCase() === valueLower);
    if (exactMatch) return exactMatch;
    
    // Partial match
    const partialMatch = options.find(opt => 
      opt.toLowerCase().includes(valueLower) || valueLower.includes(opt.toLowerCase())
    );
    if (partialMatch) return partialMatch;
    
    // Default to first option
    return options[0];
  }

  /**
   * Universal function to add a row to any Notion database
   */
  async addRowToNotionDatabase(databaseId, data, metadata = {}) {
    try {
      console.log(`📝 Adding row to database ${databaseId}`);
      console.log(`   Fields: ${Object.keys(data).join(', ')}`);
      
      // Convert our clean data to Notion's format
      const notionProperties = {};
      
      for (const [columnName, value] of Object.entries(data)) {
        if (value === null || value === undefined) continue;
        
        // Get column type from database (we should have this from schema)
        const schema = await this.getDatabaseSchema(databaseId);
        const columnConfig = schema[columnName];
        
        if (!columnConfig) {
          console.warn(`Column "${columnName}" not found in database schema`);
          continue;
        }

        notionProperties[columnName] = this.formatValueForNotion(value, columnConfig.type);
      }

      // Create the page
      const response = await this.notion.pages.create({
        parent: {
          database_id: databaseId
        },
        properties: notionProperties
      });

      console.log(`✅ Successfully added row to database: ${response.id}`);
      
      return {
        success: true,
        pageId: response.id,
        url: response.url,
        metadata: {
          ...metadata,
          created_at: new Date().toISOString(),
          fields_added: Object.keys(data).length
        }
      };
      
    } catch (error) {
      console.error('Error adding row to Notion database:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format value for Notion API based on column type
   */
  formatValueForNotion(value, columnType) {
    switch (columnType) {
      case 'title':
        return {
          title: [{ text: { content: String(value) } }]
        };
      
      case 'rich_text':
        return {
          rich_text: [{ text: { content: String(value) } }]
        };
      
      case 'number':
        return {
          number: Number(value)
        };
      
      case 'select':
        return {
          select: { name: String(value) }
        };
      
      case 'multi_select':
        const values = Array.isArray(value) ? value : [value];
        return {
          multi_select: values.map(v => ({ name: String(v) }))
        };
      
      case 'date':
        return {
          date: { start: String(value) }
        };
      
      case 'checkbox':
        return {
          checkbox: Boolean(value)
        };
      
      case 'url':
        return {
          url: String(value)
        };
      
      case 'email':
        return {
          email: String(value)
        };
      
      default:
        return {
          rich_text: [{ text: { content: String(value) } }]
        };
    }
  }

  /**
   * Get default schema for common database types
   */
  getDefaultSchema(databaseType) {
    const schemas = {
      wines: {
        database_name: "Wine Database",
        columns: [
          { name: "Name", type: "title", description: "Wine name and vintage" },
          { name: "Region", type: "rich_text", description: "Wine region/appellation" },
          { name: "Rating", type: "number", description: "Wine rating (0-100)" },
          { name: "Price", type: "number", description: "Price per bottle" },
          { name: "Type", type: "select", description: "Wine type", options: ["Red", "White", "Rosé", "Sparkling", "Dessert"] },
          { name: "Vintage", type: "number", description: "Year produced" },
          { name: "Drinking Window", type: "rich_text", description: "Optimal drinking period" }
        ],
        rationale: "Essential wine tracking fields for collection management"
      },
      "home theater systems": {
        database_name: "Home Theater Systems",
        columns: [
          { name: "Product", type: "title", description: "Product name and model" },
          { name: "Brand", type: "select", description: "Manufacturer", options: ["Sony", "Yamaha", "Denon", "Onkyo", "Pioneer", "Other"] },
          { name: "Price", type: "number", description: "Price in local currency" },
          { name: "Type", type: "select", description: "System type", options: ["Complete System", "Receiver Only", "Soundbar", "Speakers"] },
          { name: "Channels", type: "rich_text", description: "Audio configuration (e.g. 5.1, 7.2)" },
          { name: "Available in India", type: "checkbox", description: "Available for purchase in India" },
          { name: "Features", type: "multi_select", description: "Key features", options: ["Bluetooth", "WiFi", "4K Support", "Dolby Atmos", "DTS:X"] }
        ],
        rationale: "Key attributes for comparing home theater systems in Indian market"
      }
    };
    
    return schemas[databaseType] || schemas.wines;
  }
}

module.exports = NotionDatabaseManager;