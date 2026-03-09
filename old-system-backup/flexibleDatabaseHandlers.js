const NotionHandler = require('../services/notionHandler');
const OpenAI = require("openai");
const openai = new OpenAI();

// Add retry logic with exponential backoff
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.log(`Rate limit hit, waiting ${Math.round(waitTime)}ms before retry ${i + 1}/${maxRetries}`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
}

class FlexibleDatabaseHandlers {
  constructor() {
    this.notion = new NotionHandler();
  }

  // Create any type of database with structured schema
  async createFlexibleDatabase(args) {
    try {
      console.log('Creating flexible database:', args);

      const databaseType = args.database_type || args.type;
      const parentPageId = args.parent_page_id;
      const databaseName = args.database_name || `${databaseType} Database`;

      if (!databaseType) {
        throw new Error('Database type is required (e.g., "wines", "interview candidates", "gins", "hydroponic plants")');
      }

      if (!parentPageId) {
        throw new Error('Parent page ID is required to create database');
      }

      console.log(`Generating schema for ${databaseType} database...`);

      // Use OpenAI to generate appropriate schema
      const schemaPrompt = `Create a Notion database schema for "${databaseType}". 

Return a JSON object with properties for the Notion database. Each property should have a proper Notion field type.

Available Notion field types:
- title: {} (for main title field)
- rich_text: {} (for text fields)
- number: { format: "number" } (for numeric values)
- select: { options: [{ name: "Option1", color: "blue" }] } (for dropdowns)
- multi_select: { options: [{ name: "Tag1", color: "green" }] } (for tags)
- date: {} (for dates)
- checkbox: {} (for yes/no)
- url: {} (for links)
- email: {} (for email addresses)
- phone_number: {} (for phone numbers)
- files: {} (for file uploads)

For ${databaseType}, create appropriate fields. Examples:
- If wines: name (title), vintage (number), region (rich_text), rating (select), price (number), notes (rich_text)
- If interview candidates: name (title), position (rich_text), status (select), experience (number), email (email), rating (select)
- If gins: name (title), distillery (rich_text), abv (number), botanicals (multi_select), rating (select), price (number)
- If hydroponic plants: name (title), lux_level (number), electrical_conductivity (number), ph_level (number), growth_stage (select)

Return ONLY the JSON object, no explanations.`;

      const schemaResponse = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a database schema expert. Return only valid JSON for Notion database properties."
            },
            {
              role: "user",
              content: schemaPrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        });
      });

      let databaseSchema;
      try {
        databaseSchema = JSON.parse(schemaResponse.choices[0].message.content);
      } catch (error) {
        throw new Error(`Failed to parse generated schema: ${error.message}`);
      }

      console.log('Generated schema:', JSON.stringify(databaseSchema, null, 2));

      // Create the database
      const result = await this.notion.createDatabase(parentPageId, databaseName, databaseSchema);

      if (result.success) {
        return {
          message: `${databaseType} database '${databaseName}' created successfully`,
          databaseId: result.database.id,
          databaseUrl: result.database.url,
          schema: databaseSchema,
          database: result.database
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`Failed to create flexible database: ${error.message}`);
    }
  }

  // Research and add entry to any database
  async researchAndAddEntry(args) {
    try {
      console.log('Researching and adding entry:', args);

      const subject = args.subject || args.item;
      const databaseId = args.database_id;
      const databaseType = args.database_type || args.type;

      if (!subject) {
        throw new Error('Subject/item to research is required');
      }

      if (!databaseId) {
        throw new Error('Database ID is required');
      }

      console.log(`Researching ${subject} for ${databaseType} database...`);

      // Get database schema to understand structure
      const databaseInfo = await this.notion.getDatabase(databaseId);
      if (!databaseInfo.success) {
        throw new Error(`Failed to get database info: ${databaseInfo.error}`);
      }

      const properties = databaseInfo.database.properties;
      const fieldDescriptions = Object.entries(properties).map(([name, field]) => {
        return `${name}: ${field.type}`;
      }).join(', ');

      // Research the subject and get structured data
      const researchPrompt = `Research "${subject}" and provide comprehensive information for a ${databaseType} database.

Database fields: ${fieldDescriptions}

Research the following about "${subject}":
- Basic information and characteristics
- Technical specifications or details
- Ratings, reviews, or quality assessments
- Pricing information if applicable
- Any other relevant data for the database fields

Return a JSON object with data for each database field. Use simple data types only:
- For title fields: provide the main name as a STRING
- For rich_text: provide descriptive text as a STRING  
- For number: provide numeric values as NUMBER (not string)
- For select: provide option name as STRING
- For multi_select: provide array of strings
- For date: use ISO format string (YYYY-MM-DD)
- For boolean: true/false
- For url/email/phone: provide as STRING if available

IMPORTANT: Use only simple values - strings, numbers, arrays of strings, booleans. 
Do NOT use objects with nested properties.

Example correct format:
{
  "Name": "Wine Name",
  "Region": "Bordeaux, France", 
  "Rating": "Excellent",
  "Price": 1500,
  "Vintage": 2015
}

Return ONLY the JSON object with field data, no explanations.`;

      const researchResponse = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system", 
              content: "You are a research expert. Provide accurate, comprehensive data in the exact JSON format requested."
            },
            {
              role: "user",
              content: researchPrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1
        });
      });

      let researchData;
      try {
        researchData = JSON.parse(researchResponse.choices[0].message.content);
      } catch (error) {
        throw new Error(`Failed to parse research data: ${error.message}`);
      }

      console.log('Research data:', JSON.stringify(researchData, null, 2));

      // Convert research data to Notion format
      const notionProperties = this.convertToNotionProperties(researchData, properties);

      // Create the page in Notion
      const pageResult = await this.notion.createPage(databaseId, notionProperties);

      if (pageResult.success) {
        return {
          message: `Successfully researched and added "${subject}" to ${databaseType} database`,
          pageId: pageResult.page.id,
          pageUrl: pageResult.page.url,
          researchData: researchData,
          page: pageResult.page
        };
      } else {
        throw new Error(pageResult.error);
      }

    } catch (error) {
      throw new Error(`Failed to research and add entry: ${error.message}`);
    }
  }

  // Convert research data to Notion property format
  convertToNotionProperties(data, databaseProperties) {
    const properties = {};

    for (const [fieldName, fieldConfig] of Object.entries(databaseProperties)) {
      const value = data[fieldName];
      
      if (value === null || value === undefined) continue;

      switch (fieldConfig.type) {
        case 'title':
          properties[fieldName] = {
            title: [{ text: { content: String(value) } }]
          };
          break;

        case 'rich_text':
          // Handle both string values and object values with rich_text property
          let textContent;
          if (typeof value === 'object' && value.rich_text) {
            textContent = String(value.rich_text);
          } else {
            textContent = String(value);
          }
          properties[fieldName] = {
            rich_text: [{ text: { content: textContent } }]
          };
          break;

        case 'number':
          if (typeof value === 'number') {
            properties[fieldName] = { number: value };
          }
          break;

        case 'select':
          // Handle both string values and object values with select property
          let selectValue;
          if (typeof value === 'object' && value.select) {
            selectValue = String(value.select);
          } else {
            selectValue = String(value);
          }
          properties[fieldName] = {
            select: { name: selectValue }
          };
          break;

        case 'multi_select':
          if (Array.isArray(value)) {
            properties[fieldName] = {
              multi_select: value.map(v => ({ name: String(v) }))
            };
          }
          break;

        case 'date':
          if (value) {
            properties[fieldName] = {
              date: { start: String(value) }
            };
          }
          break;

        case 'checkbox':
          properties[fieldName] = {
            checkbox: Boolean(value)
          };
          break;

        case 'url':
          if (value) {
            properties[fieldName] = { url: String(value) };
          }
          break;

        case 'email':
          if (value) {
            properties[fieldName] = { email: String(value) };
          }
          break;

        case 'phone_number':
          if (value) {
            properties[fieldName] = { phone_number: String(value) };
          }
          break;

        default:
          // Fallback to rich_text for unknown types
          properties[fieldName] = {
            rich_text: [{ text: { content: String(value) } }]
          };
      }
    }

    return properties;
  }

  // Add column to existing database
  async addColumnToDatabase(args) {
    try {
      console.log('Adding column to database:', args);

      const databaseId = args.database_id;
      const columnName = args.column_name;
      const columnDescription = args.column_description;
      const databaseType = args.database_type;

      if (!databaseId) {
        throw new Error('Database ID is required');
      }

      if (!columnName) {
        throw new Error('Column name is required');
      }

      console.log(`Adding "${columnName}" column to ${databaseType} database...`);

      // Use AI to determine the best field type for this column
      const fieldTypePrompt = `For a ${databaseType} database, determine the best Notion field type for a column named "${columnName}" with description: "${columnDescription}".

Available Notion field types:
- rich_text: for text descriptions, notes
- number: for numeric values (prices, ratings, measurements)
- select: for dropdown options with predefined choices
- multi_select: for multiple tags/categories
- date: for dates
- checkbox: for yes/no values
- url: for web links
- email: for email addresses

Return a JSON object with the field configuration:
{
  "type": "field_type",
  "config": { ...field_specific_config... }
}

For select fields, include common options:
{
  "type": "select",
  "config": {
    "options": [
      {"name": "Option1", "color": "blue"},
      {"name": "Option2", "color": "green"}
    ]
  }
}

For multi_select, include relevant tags. For other types, config can be empty {}.

Return ONLY the JSON object.`;

      const fieldTypeResponse = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a database design expert. Return only valid JSON for Notion field configuration."
            },
            {
              role: "user",
              content: fieldTypePrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        });
      });

      let fieldConfig;
      try {
        fieldConfig = JSON.parse(fieldTypeResponse.choices[0].message.content);
      } catch (error) {
        throw new Error(`Failed to parse field configuration: ${error.message}`);
      }

      console.log('Generated field config:', JSON.stringify(fieldConfig, null, 2));

      // Unfortunately, Notion API doesn't support adding properties to existing databases
      // We need to create a new database with the additional column
      console.log('⚠️ Note: Notion API doesn\'t support adding columns to existing databases');
      console.log('💡 Recommendation: Create a new database with the additional column');

      return {
        message: `Column "${columnName}" configuration generated successfully`,
        columnName: columnName,
        fieldType: fieldConfig.type,
        fieldConfig: fieldConfig.config,
        recommendation: 'Notion API does not support adding columns to existing databases. Consider creating a new database with this column included.',
        generatedConfig: fieldConfig
      };

    } catch (error) {
      throw new Error(`Failed to add column to database: ${error.message}`);
    }
  }

  // Update database schema and recreate with new columns
  async updateDatabaseSchema(args) {
    try {
      console.log('Updating database schema:', args);

      const databaseId = args.database_id;
      const newColumns = args.new_columns || [];
      const parentPageId = args.parent_page_id;
      const databaseType = args.database_type;

      if (!databaseId || !parentPageId) {
        throw new Error('Database ID and parent page ID are required');
      }

      console.log(`Creating updated ${databaseType} database with new columns...`);

      // Get existing database structure
      const existingDb = await this.notion.getDatabase(databaseId);
      if (!existingDb.success) {
        throw new Error(`Failed to get existing database: ${existingDb.error}`);
      }

      // Generate new schema with additional columns
      const enhancedSchemaPrompt = `Create an enhanced Notion database schema for "${databaseType}" that includes these additional columns: ${newColumns.join(', ')}.

Build upon a standard ${databaseType} database schema and add the requested columns with appropriate field types.

For wines, include standard fields like: Name (title), Vintage (number), Region (rich_text), Rating (select), Price (number), Notes (rich_text)
Plus the requested additions like: ${newColumns.join(', ')}

Return a complete JSON object with all properties (existing + new) for the Notion database.

Available field types: title, rich_text, number, select, multi_select, date, checkbox, url, email

Return ONLY the JSON object, no explanations.`;

      const schemaResponse = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a database schema expert. Return only valid JSON for Notion database properties."
            },
            {
              role: "user",
              content: enhancedSchemaPrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.3
        });
      });

      let enhancedSchema;
      try {
        enhancedSchema = JSON.parse(schemaResponse.choices[0].message.content);
      } catch (error) {
        throw new Error(`Failed to parse enhanced schema: ${error.message}`);
      }

      // Create new database with enhanced schema
      const newDatabaseName = `Enhanced ${databaseType} Database`;
      const createResult = await this.notion.createDatabase(parentPageId, newDatabaseName, enhancedSchema);

      if (createResult.success) {
        return {
          message: `Enhanced ${databaseType} database created with new columns: ${newColumns.join(', ')}`,
          oldDatabaseId: databaseId,
          newDatabaseId: createResult.database.id,
          newDatabaseUrl: createResult.database.url,
          addedColumns: newColumns,
          schema: enhancedSchema,
          recommendation: 'Migrate your existing data to the new database with enhanced schema'
        };
      } else {
        throw new Error(createResult.error);
      }

    } catch (error) {
      throw new Error(`Failed to update database schema: ${error.message}`);
    }
  }

  // Find or create database for a specific type
  async findOrCreateDatabase(args) {
    try {
      const databaseType = args.database_type || args.type;
      const parentPageId = args.parent_page_id;

      // Try to find existing database
      const searchResult = await this.notion.searchPages(`${databaseType} Database`, {
        value: 'database',
        property: 'object'
      });

      if (searchResult.success && searchResult.results.length > 0) {
        const database = searchResult.results[0];
        return {
          message: `Found existing ${databaseType} database`,
          databaseId: database.id,
          databaseUrl: database.url,
          created: false,
          database: database
        };
      }

      // Create new database if not found
      if (!parentPageId) {
        throw new Error('Parent page ID required to create new database');
      }

      return await this.createFlexibleDatabase({
        database_type: databaseType,
        parent_page_id: parentPageId,
        database_name: `${databaseType} Database`
      });

    } catch (error) {
      throw new Error(`Failed to find or create database: ${error.message}`);
    }
  }

  // Get handler schemas for registration
  static getHandlerSchemas() {
    return [
      {
        name: 'create_flexible_database',
        description: 'Create a database for any topic (wines, interview candidates, gins, plants, etc.) with AI-generated schema',
        schema: {
          type: 'object',
          properties: {
            database_type: {
              type: 'string',
              description: 'Type of database to create (e.g., "wines", "interview candidates", "gins", "hydroponic plants")'
            },
            parent_page_id: {
              type: 'string',
              description: 'Notion page ID where the database will be created (required)'
            },
            database_name: {
              type: 'string',
              description: 'Custom name for the database (optional, will use type + "Database" if not provided)'
            }
          },
          required: ['database_type', 'parent_page_id']
        }
      },
      {
        name: 'research_and_add_entry',
        description: 'Research a subject and add it to an existing database with structured data',
        schema: {
          type: 'object',
          properties: {
            subject: {
              type: 'string', 
              description: 'Subject/item to research and add (e.g., "Hendricks Gin", "Château Margaux 2015", "John Smith")'
            },
            database_id: {
              type: 'string',
              description: 'Notion database ID to add the entry to (required)'
            },
            database_type: {
              type: 'string',
              description: 'Type of database for context (e.g., "wines", "gins", "candidates")'
            }
          },
          required: ['subject', 'database_id']
        }
      },
      {
        name: 'add_column_to_database',
        description: 'Add a new column to an existing database (e.g., "drinking windows", "wine spectator ratings")',
        schema: {
          type: 'object',
          properties: {
            database_id: {
              type: 'string',
              description: 'Database ID to add column to (required)'
            },
            column_name: {
              type: 'string',
              description: 'Name of the new column (e.g., "Drinking Window", "Wine Spectator Rating")'
            },
            column_description: {
              type: 'string',
              description: 'Description of what this column should contain'
            },
            database_type: {
              type: 'string',
              description: 'Type of database for context (e.g., "wines", "gins")'
            }
          },
          required: ['database_id', 'column_name', 'database_type']
        }
      },
      {
        name: 'update_database_schema',
        description: 'Create an enhanced version of a database with additional columns',
        schema: {
          type: 'object',
          properties: {
            database_id: {
              type: 'string',
              description: 'Original database ID (required)'
            },
            new_columns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of new column names to add (e.g., ["Drinking Window", "Wine Spectator Rating"])'
            },
            parent_page_id: {
              type: 'string',
              description: 'Parent page ID for creating enhanced database (required)'
            },
            database_type: {
              type: 'string',
              description: 'Type of database (e.g., "wines", "gins")'
            }
          },
          required: ['database_id', 'new_columns', 'parent_page_id', 'database_type']
        }
      },
      {
        name: 'find_or_create_database',
        description: 'Find existing database of a type or create new one if not found',
        schema: {
          type: 'object',
          properties: {
            database_type: {
              type: 'string',
              description: 'Type of database to find or create'
            },
            parent_page_id: {
              type: 'string',
              description: 'Parent page ID for creating new database (required if not found)'
            }
          },
          required: ['database_type']
        }
      }
    ];
  }
}

module.exports = FlexibleDatabaseHandlers;