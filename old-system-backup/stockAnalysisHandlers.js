const PerplexityHandler = require('../services/perplexityHandler');
const NotionHandler = require('../services/notionHandler');

class StockAnalysisHandlers {
  constructor() {
    this.perplexity = new PerplexityHandler();
    this.notion = new NotionHandler();
  }

  // Main stock analysis workflow
  async analyzeStock(args) {
    try {
      console.log('Starting stock analysis for:', args);

      const stockSymbol = args.stock_symbol || args.symbol || args.company;
      if (!stockSymbol) {
        throw new Error('Stock symbol or company name is required');
      }

      const analysisType = args.analysis_type || 'comprehensive';
      let saveToNotion = args.save_to_notion !== false; // Default to true
      const notionDatabaseId = args.notion_database_id;

      console.log(`Analyzing ${stockSymbol} (${analysisType} analysis)...`);

      // Step 1: Get comprehensive stock analysis from Perplexity
      const analysisResult = await this.perplexity.searchStock(stockSymbol, {
        includeMarketData: analysisType === 'comprehensive' || analysisType === 'market',
        includeAnalystReports: analysisType === 'comprehensive' || analysisType === 'analyst',
        includeFundamentals: analysisType === 'comprehensive' || analysisType === 'fundamental',
        includeNews: analysisType === 'comprehensive' || analysisType === 'news'
      });

      if (!analysisResult.success) {
        throw new Error(`Failed to get stock analysis: ${analysisResult.error}`);
      }

      console.log('Stock analysis completed, processing data...');

      // Step 2: Format analysis data for Notion
      const formattedData = {
        ...this.perplexity.formatAnalysisForNotion(analysisResult, stockSymbol),
        symbol: stockSymbol
      };

      // Step 3: Save to Notion if requested
      let notionResult = null;
      if (saveToNotion) {
        console.log('Saving analysis to Notion...');
        
        try {
          let databaseId = notionDatabaseId;
          
          // If no database ID provided, try to find existing stock analysis database
          if (!databaseId) {
            const dbSearchResult = await this.notion.findStockAnalysisDatabase();
            if (dbSearchResult.success) {
              databaseId = dbSearchResult.database.id;
              console.log('Found existing Stock Analysis database');
            } else {
              console.log('Stock Analysis database not found, analysis will be returned without saving to Notion');
              saveToNotion = false;
            }
          }

          if (databaseId) {
            notionResult = await this.notion.createStockAnalysisPage(databaseId, formattedData);
            
            if (notionResult.success) {
              console.log('Analysis saved to Notion successfully');
            } else {
              console.log('Failed to save to Notion:', notionResult.error);
            }
          }
        } catch (error) {
          console.log('Notion save failed:', error.message);
          notionResult = { success: false, error: error.message };
        }
      }

      // Step 4: Prepare response
      const response = {
        analysis: {
          symbol: stockSymbol.toUpperCase(),
          recommendation: formattedData.recommendation,
          targetPrice: formattedData.targetPrice,
          currentPrice: formattedData.currentPrice,
          upside: formattedData.upside,
          timeframe: formattedData.timeframe,
          analysisDate: formattedData.analysisDate,
          fullAnalysis: analysisResult.content
        },
        sources: analysisResult.citations?.map(c => c.url) || [],
        model: analysisResult.model
      };

      if (saveToNotion && notionResult) {
        response.notion = {
          saved: notionResult.success,
          pageId: notionResult.success ? notionResult.page.id : null,
          pageUrl: notionResult.success ? notionResult.page.url : null,
          error: notionResult.success ? null : notionResult.error
        };
      }

      return {
        message: `Stock analysis completed for ${stockSymbol.toUpperCase()}. Recommendation: ${formattedData.recommendation}${formattedData.targetPrice ? ` | Target: $${formattedData.targetPrice}` : ''}${formattedData.upside ? ` | Upside: ${formattedData.upside}` : ''}`,
        ...response
      };

    } catch (error) {
      throw new Error(`Stock analysis failed: ${error.message}`);
    }
  }

  // Create Notion stock analysis database
  async createStockDatabase(args) {
    try {
      console.log('Creating stock analysis database:', args);

      const parentPageId = args.parent_page_id;
      const databaseName = args.database_name || 'Stock Analysis';

      if (!parentPageId) {
        throw new Error('Parent page ID is required to create database');
      }

      const result = await this.notion.createStockAnalysisDatabase(parentPageId, databaseName);

      if (result.success) {
        return {
          message: `Stock analysis database '${databaseName}' created successfully`,
          databaseId: result.database.id,
          databaseUrl: result.database.url,
          database: result.database
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`Failed to create stock database: ${error.message}`);
    }
  }

  // Get stock research (focused on research without saving)
  async researchStock(args) {
    try {
      console.log('Researching stock:', args);

      const stockSymbol = args.stock_symbol || args.symbol || args.company;
      const researchType = args.research_type || 'overview';

      if (!stockSymbol) {
        throw new Error('Stock symbol or company name is required');
      }

      let result;

      switch (researchType) {
        case 'profile':
        case 'company':
          result = await this.perplexity.getCompanyProfile(stockSymbol);
          break;
        
        case 'sentiment':
        case 'news':
          result = await this.perplexity.getMarketSentiment(stockSymbol);
          break;
        
        case 'technical':
        case 'chart':
          result = await this.perplexity.getTechnicalAnalysis(stockSymbol);
          break;
        
        default:
          result = await this.perplexity.searchStock(stockSymbol);
      }

      if (result.success) {
        return {
          message: `Research completed for ${stockSymbol.toUpperCase()} (${researchType})`,
          content: result.content,
          sources: result.citations?.map(c => c.url) || [],
          model: result.model
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`Stock research failed: ${error.message}`);
    }
  }

  // Save analysis to Notion (for manual saves)
  async saveAnalysisToNotion(args) {
    try {
      console.log('Saving analysis to Notion:', args);

      const analysisData = args.analysis_data;
      const databaseId = args.database_id;

      if (!analysisData) {
        throw new Error('Analysis data is required');
      }

      if (!databaseId) {
        throw new Error('Database ID is required');
      }

      const result = await this.notion.createStockAnalysisPage(databaseId, analysisData);

      if (result.success) {
        return {
          message: 'Analysis saved to Notion successfully',
          pageId: result.page.id,
          pageUrl: result.page.url,
          page: result.page
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`Failed to save analysis to Notion: ${error.message}`);
    }
  }

  // Get handler schemas for registration
  static getHandlerSchemas() {
    return [
      {
        name: 'analyze_stock',
        description: 'Perform comprehensive stock analysis using AI research and optionally save to Notion',
        schema: {
          type: 'object',
          properties: {
            stock_symbol: {
              type: 'string',
              description: 'Stock symbol or company name to analyze (required)'
            },
            analysis_type: {
              type: 'string',
              enum: ['comprehensive', 'fundamental', 'technical', 'market', 'analyst', 'news'],
              description: 'Type of analysis to perform (default: comprehensive)'
            },
            save_to_notion: {
              type: 'boolean',
              description: 'Whether to save analysis to Notion (default: true)'
            },
            notion_database_id: {
              type: 'string',
              description: 'Notion database ID to save to (will search for existing if not provided)'
            }
          },
          required: ['stock_symbol']
        }
      },
      {
        name: 'research_stock',
        description: 'Research specific aspects of a stock without saving to Notion',
        schema: {
          type: 'object',
          properties: {
            stock_symbol: {
              type: 'string',
              description: 'Stock symbol or company name to research (required)'
            },
            research_type: {
              type: 'string',
              enum: ['overview', 'profile', 'sentiment', 'technical', 'news'],
              description: 'Type of research to perform (default: overview)'
            }
          },
          required: ['stock_symbol']
        }
      },
      {
        name: 'create_stock_database',
        description: 'Create a new Notion database for stock analysis tracking',
        schema: {
          type: 'object',
          properties: {
            parent_page_id: {
              type: 'string',
              description: 'Notion page ID where the database will be created (required)'
            },
            database_name: {
              type: 'string',
              description: 'Name for the database (default: "Stock Analysis")'
            }
          },
          required: ['parent_page_id']
        }
      },
      {
        name: 'save_analysis_to_notion',
        description: 'Save existing stock analysis data to Notion database',
        schema: {
          type: 'object',
          properties: {
            analysis_data: {
              type: 'object',
              description: 'Stock analysis data to save (required)'
            },
            database_id: {
              type: 'string',
              description: 'Notion database ID to save to (required)'
            }
          },
          required: ['analysis_data', 'database_id']
        }
      }
    ];
  }
}

module.exports = StockAnalysisHandlers;