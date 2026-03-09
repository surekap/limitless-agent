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

class UnhandledIntentHandlers {
  constructor() {
    this.notion = new NotionHandler();
  }

  // Create database for tracking unhandled intents and future development
  async createDevelopmentLogDatabase(args) {
    try {
      console.log('Creating development log database:', args);

      const parentPageId = args.parent_page_id;
      const databaseName = args.database_name || 'Development Log - Future Features';

      if (!parentPageId) {
        throw new Error('Parent page ID is required to create database');
      }

      // Define schema for development log database
      const developmentLogSchema = {
        'Intent Description': {
          title: {}
        },
        'User Request': {
          rich_text: {}
        },
        'Suggested Handler': {
          rich_text: {}
        },
        'Priority': {
          select: {
            options: [
              { name: 'High', color: 'red' },
              { name: 'Medium', color: 'yellow' },
              { name: 'Low', color: 'gray' }
            ]
          }
        },
        'Status': {
          select: {
            options: [
              { name: 'Backlog', color: 'gray' },
              { name: 'In Planning', color: 'blue' },
              { name: 'In Development', color: 'yellow' },
              { name: 'Testing', color: 'orange' },
              { name: 'Completed', color: 'green' }
            ]
          }
        },
        'Category': {
          multi_select: {
            options: [
              { name: 'Email', color: 'blue' },
              { name: 'Calendar', color: 'green' },
              { name: 'Communication', color: 'purple' },
              { name: 'Productivity', color: 'orange' },
              { name: 'Data', color: 'pink' },
              { name: 'AI/ML', color: 'red' },
              { name: 'Integration', color: 'brown' },
              { name: 'Automation', color: 'yellow' }
            ]
          }
        },
        'Date Logged': {
          date: {}
        },
        'Implementation Notes': {
          rich_text: {}
        },
        'Technical Requirements': {
          rich_text: {}
        },
        'Estimated Effort': {
          select: {
            options: [
              { name: 'Small (1-2 days)', color: 'green' },
              { name: 'Medium (3-5 days)', color: 'yellow' },
              { name: 'Large (1-2 weeks)', color: 'orange' },
              { name: 'Epic (3+ weeks)', color: 'red' }
            ]
          }
        }
      };

      console.log('Creating development log database with comprehensive schema...');

      const result = await this.notion.createDatabase(parentPageId, databaseName, developmentLogSchema);

      if (result.success) {
        return {
          message: `Development log database '${databaseName}' created successfully`,
          databaseId: result.database.id,
          databaseUrl: result.database.url,
          schema: developmentLogSchema,
          database: result.database
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`Failed to create development log database: ${error.message}`);
    }
  }

  // Log unhandled intent to development database
  async logUnhandledIntent(args) {
    try {
      console.log('Logging unhandled intent:', args);

      const userRequest = args.user_request;
      const lifelogContent = args.lifelog_content;
      const databaseId = args.database_id;

      if (!userRequest || !databaseId) {
        throw new Error('User request and database ID are required');
      }

      console.log('Analyzing unhandled intent for development planning...');

      // Use AI to analyze the intent and suggest implementation details
      const analysisPrompt = `Analyze this unhandled user intent and provide development planning information:

User Request: "${userRequest}"
Context: ${lifelogContent || 'No additional context'}

Please analyze and provide:
1. A clear description of what the user wants
2. Suggested handler name (snake_case)
3. Priority level (High/Medium/Low)
4. Category tags (Email, Calendar, Communication, Productivity, Data, AI/ML, Integration, Automation)
5. Technical requirements and implementation notes
6. Estimated development effort

Return a JSON object with this structure:
{
  "intent_description": "Clear description of what user wants",
  "suggested_handler": "suggested_handler_name",
  "priority": "High|Medium|Low",
  "categories": ["Category1", "Category2"],
  "technical_requirements": "Technical details and requirements",
  "implementation_notes": "Implementation suggestions and approach",
  "estimated_effort": "Small (1-2 days)|Medium (3-5 days)|Large (1-2 weeks)|Epic (3+ weeks)"
}

Return ONLY the JSON object, no explanations.`;

      const analysisResponse = await retryWithBackoff(async () => {
        return await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a product manager and technical architect. Analyze user requests and provide development planning details."
            },
            {
              role: "user",
              content: analysisPrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        });
      });

      let analysis;
      try {
        analysis = JSON.parse(analysisResponse.choices[0].message.content);
      } catch (error) {
        // Fallback if AI analysis fails
        analysis = {
          intent_description: userRequest,
          suggested_handler: 'new_handler_needed',
          priority: 'Medium',
          categories: ['Integration'],
          technical_requirements: 'Analysis pending',
          implementation_notes: 'Requires further investigation',
          estimated_effort: 'Medium (3-5 days)'
        };
      }

      console.log('Analysis completed:', JSON.stringify(analysis, null, 2));

      // Format data for Notion
      const notionProperties = {
        'Intent Description': {
          title: [{ text: { content: analysis.intent_description } }]
        },
        'User Request': {
          rich_text: [{ text: { content: userRequest } }]
        },
        'Suggested Handler': {
          rich_text: [{ text: { content: analysis.suggested_handler } }]
        },
        'Priority': {
          select: { name: analysis.priority }
        },
        'Status': {
          select: { name: 'Backlog' }
        },
        'Category': {
          multi_select: analysis.categories.map(cat => ({ name: cat }))
        },
        'Date Logged': {
          date: { start: new Date().toISOString().split('T')[0] }
        },
        'Implementation Notes': {
          rich_text: [{ text: { content: analysis.implementation_notes } }]
        },
        'Technical Requirements': {
          rich_text: [{ text: { content: analysis.technical_requirements } }]
        },
        'Estimated Effort': {
          select: { name: analysis.estimated_effort }
        }
      };

      // Create page in development log database
      const pageResult = await this.notion.createPage(databaseId, notionProperties);

      if (pageResult.success) {
        return {
          message: `Unhandled intent logged successfully: "${analysis.intent_description}"`,
          pageId: pageResult.page.id,
          pageUrl: pageResult.page.url,
          analysis: analysis,
          priority: analysis.priority,
          suggestedHandler: analysis.suggested_handler
        };
      } else {
        throw new Error(pageResult.error);
      }

    } catch (error) {
      throw new Error(`Failed to log unhandled intent: ${error.message}`);
    }
  }

  // Find or create development log database
  async findOrCreateDevelopmentLog(args) {
    try {
      const parentPageId = args.parent_page_id;

      // Try to find existing development log database
      const searchResult = await this.notion.searchPages('Development Log', {
        value: 'database',
        property: 'object'
      });

      if (searchResult.success && searchResult.results.length > 0) {
        const database = searchResult.results[0];
        return {
          message: 'Found existing development log database',
          databaseId: database.id,
          databaseUrl: database.url,
          created: false,
          database: database
        };
      }

      // Create new database if not found
      if (!parentPageId) {
        throw new Error('Parent page ID required to create development log database');
      }

      return await this.createDevelopmentLogDatabase({
        parent_page_id: parentPageId,
        database_name: 'Development Log - Future Features'
      });

    } catch (error) {
      throw new Error(`Failed to find or create development log: ${error.message}`);
    }
  }

  // Get handler schemas for registration
  static getHandlerSchemas() {
    return [
      {
        name: 'create_development_log_database',
        description: 'Create a Notion database for tracking unhandled intents and future development features',
        schema: {
          type: 'object',
          properties: {
            parent_page_id: {
              type: 'string',
              description: 'Notion page ID where the database will be created (required)'
            },
            database_name: {
              type: 'string',
              description: 'Custom name for the database (optional, defaults to "Development Log - Future Features")'
            }
          },
          required: ['parent_page_id']
        }
      },
      {
        name: 'log_unhandled_intent',
        description: 'Log an unhandled user intent to the development database for future implementation',
        schema: {
          type: 'object',
          properties: {
            user_request: {
              type: 'string',
              description: 'The user request that could not be handled (required)'
            },
            lifelog_content: {
              type: 'string',
              description: 'Full lifelog content for context (optional)'
            },
            database_id: {
              type: 'string',
              description: 'Development log database ID (required)'
            }
          },
          required: ['user_request', 'database_id']
        }
      },
      {
        name: 'find_or_create_development_log',
        description: 'Find existing development log database or create new one if not found',
        schema: {
          type: 'object',
          properties: {
            parent_page_id: {
              type: 'string',
              description: 'Parent page ID for creating new database (required if not found)'
            }
          }
        }
      }
    ];
  }
}

module.exports = UnhandledIntentHandlers;