const NotionDatabaseManager = require('../services/notionDatabaseManager');
const { Client } = require('@notionhq/client');

class EnhancedDatabaseHandlers {
  constructor() {
    this.notion = new Client({
      auth: process.env.NOTION_TOKEN,
    });
    this.dbManager = new NotionDatabaseManager();
  }

  /**
   * Create a well-planned database with optimal schema
   */
  async createPlannedDatabase(args, processingId) {
    const startTime = Date.now();
    
    try {
      const { database_type, parent_page_id, purpose } = args;
      
      console.log(`📊 Creating planned database for: ${database_type}`);
      
      // Step 1: Plan optimal schema
      const plannedSchema = await this.dbManager.planDatabaseSchema(database_type, purpose);
      
      // Step 2: Create database with planned schema
      const properties = {};
      
      plannedSchema.columns.forEach(column => {
        properties[column.name] = this.buildNotionProperty(column);
      });
      
      const response = await this.notion.databases.create({
        parent: {
          type: "page_id",
          page_id: parent_page_id
        },
        title: [
          {
            type: "text",
            text: {
              content: plannedSchema.database_name
            }
          }
        ],
        properties
      });

      console.log(`✅ Created planned database: ${response.id}`);
      console.log(`   Schema: ${plannedSchema.columns.length} columns`);
      
      return {
        success: true,
        result: {
          databaseId: response.id,
          databaseName: plannedSchema.database_name,
          url: response.url,
          schema: plannedSchema,
          columnsCreated: plannedSchema.columns.length
        },
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('Error creating planned database:', error);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Research and add entry with intelligent data generation
   */
  async researchAndAddSmartEntry(args, processingId) {
    const startTime = Date.now();
    
    try {
      const { subject, database_id, additional_context = '' } = args;
      
      console.log(`🔬 Researching and adding smart entry: ${subject}`);
      
      // Step 1: Get database schema
      const schema = await this.dbManager.getDatabaseSchema(database_id);
      
      // Step 2: Generate structured data using LLM
      const structuredResult = await this.dbManager.generateStructuredData(
        subject, 
        schema, 
        additional_context
      );
      
      // Step 3: Add to database
      const addResult = await this.dbManager.addRowToNotionDatabase(
        database_id,
        structuredResult.data,
        structuredResult.metadata
      );
      
      if (addResult.success) {
        console.log(`✅ Smart entry added successfully`);
        console.log(`   Research confidence: ${structuredResult.metadata.confidence_score}/10`);
        console.log(`   Fields populated: ${Object.keys(structuredResult.data).length}`);
        
        return {
          success: true,
          result: {
            pageId: addResult.pageId,
            url: addResult.url,
            subject: subject,
            fieldsPopulated: Object.keys(structuredResult.data).length,
            researchNotes: structuredResult.metadata.research_notes,
            confidenceScore: structuredResult.metadata.confidence_score,
            data: structuredResult.data
          },
          duration: Date.now() - startTime
        };
      } else {
        throw new Error(addResult.error);
      }
      
    } catch (error) {
      console.error('Error researching and adding smart entry:', error);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Add structured data to any database
   */
  async addDataToDatabase(args, processingId) {
    const startTime = Date.now();
    
    try {
      const { database_id, data, validate = true } = args;
      
      console.log(`📝 Adding structured data to database: ${database_id}`);
      
      let processedData = data;
      
      if (validate) {
        // Get schema and validate data
        const schema = await this.dbManager.getDatabaseSchema(database_id);
        processedData = this.dbManager.validateAndCleanData(data, schema);
      }
      
      const result = await this.dbManager.addRowToNotionDatabase(database_id, processedData);
      
      if (result.success) {
        return {
          success: true,
          result: {
            pageId: result.pageId,
            url: result.url,
            fieldsAdded: Object.keys(processedData).length
          },
          duration: Date.now() - startTime
        };
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('Error adding data to database:', error);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Build Notion property configuration from column definition
   */
  buildNotionProperty(column) {
    const property = {};
    
    switch (column.type) {
      case 'title':
        property.title = {};
        break;
      
      case 'rich_text':
        property.rich_text = {};
        break;
      
      case 'number':
        property.number = { format: 'number' };
        break;
      
      case 'select':
        property.select = {
          options: (column.options || []).map(option => ({
            name: option,
            color: 'default'
          }))
        };
        break;
      
      case 'multi_select':
        property.multi_select = {
          options: (column.options || []).map(option => ({
            name: option,
            color: 'default'
          }))
        };
        break;
      
      case 'date':
        property.date = {};
        break;
      
      case 'checkbox':
        property.checkbox = {};
        break;
      
      case 'url':
        property.url = {};
        break;
      
      case 'email':
        property.email = {};
        break;
      
      default:
        property.rich_text = {};
    }
    
    return property;
  }

  /**
   * Get database information including schema
   */
  async getDatabaseInfo(args, processingId) {
    const startTime = Date.now();
    
    try {
      const { database_id } = args;
      
      const schema = await this.dbManager.getDatabaseSchema(database_id);
      const database = await this.notion.databases.retrieve({ database_id });
      
      return {
        success: true,
        result: {
          databaseId: database_id,
          title: database.title[0]?.text?.content || 'Untitled',
          schema: schema,
          columnCount: Object.keys(schema).length,
          columns: Object.keys(schema)
        },
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('Error getting database info:', error);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }
}

module.exports = EnhancedDatabaseHandlers;