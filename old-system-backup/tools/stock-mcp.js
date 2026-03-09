/**
 * STOCK MCP TOOL - Stock Analysis Integration
 * 
 * This MCP tool provides Claude with comprehensive stock analysis capabilities:
 * - Fetches real-time stock data and analysis using Perplexity AI
 * - Performs different types of analysis (quick, comprehensive, technical, fundamental)
 * - Extracts key metrics like price targets, recommendations, and upside calculations
 * - Automatically saves analysis results to Notion Stock Analysis database
 * 
 * KEY FEATURES:
 * - Real-time stock analysis with Perplexity AI (sonar model)
 * - Intelligent parsing of analysis text to extract structured data
 * - Automatic saving to pre-configured Stock Analysis database
 * - Support for multiple analysis types and timeframes
 * - Mock price data for testing (easily replaceable with real API)
 * 
 * TOOLS PROVIDED:
 * - analyze_stock: Perform comprehensive stock analysis
 * - save_stock_analysis: Save analysis results to Notion database
 * - get_stock_price: Get current stock price and basic info
 * 
 * ENVIRONMENT VARIABLES:
 * - PERPLEXITY_API_KEY: Perplexity AI API key for analysis
 * - NOTION_TOKEN: Used by save functionality to access Notion
 */

const axios = require('axios');

/**
 * StockMCP - Handles all stock analysis operations for the agent
 */
class StockMCP {
  /**
   * Initialize Perplexity AI client for stock analysis
   */
  constructor() {
    this.perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    this.baseURL = 'https://api.perplexity.ai/chat/completions';
  }

  /**
   * Return tool definitions for Claude to understand available stock operations
   * 
   * @returns {Array} Array of tool definitions with schemas
   */
  getToolDefinitions() {
    return [
      {
        name: 'analyze_stock',
        description: 'Perform comprehensive stock analysis',
        input_schema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock symbol (e.g., AAPL, TSLA, UNH)'
            },
            analysis_type: {
              type: 'string',
              enum: ['quick', 'comprehensive', 'technical', 'fundamental'],
              description: 'Type of analysis to perform'
            },
            save_to_notion: {
              type: 'boolean',
              description: 'Whether to save analysis to Stock Analysis database',
              default: true
            }
          },
          required: ['symbol']
        }
      },
      {
        name: 'save_stock_analysis',
        description: 'Save stock analysis results to Notion Stock Analysis database',
        input_schema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock symbol'
            },
            analysis_data: {
              type: 'object',
              description: 'Analysis results to save'
            },
            database_id: {
              type: 'string',
              description: 'Stock Analysis database ID'
            }
          },
          required: ['symbol', 'analysis_data']
        }
      },
      {
        name: 'get_stock_price',
        description: 'Get current stock price and basic info',
        input_schema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock symbol'
            }
          },
          required: ['symbol']
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
    return ['analyze_stock', 'save_stock_analysis', 'get_stock_price'].includes(toolName);
  }

  /**
   * Execute a stock analysis tool operation
   * 
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} input - Input parameters for the tool
   * @returns {Object} Tool execution result
   */
  async execute(toolName, input) {
    switch (toolName) {
      case 'analyze_stock':
        return await this.analyzeStock(input);
      case 'save_stock_analysis':
        return await this.saveStockAnalysis(input);
      case 'get_stock_price':
        return await this.getStockPrice(input);
      default:
        throw new Error(`Unknown Stock tool: ${toolName}`);
    }
  }

  /**
   * Perform comprehensive stock analysis using Perplexity AI
   * 
   * @param {Object} params - Analysis parameters
   * @param {string} params.symbol - Stock symbol (e.g., AAPL, TSLA)
   * @param {string} params.analysis_type - Type of analysis (quick, comprehensive, technical, fundamental)
   * @returns {Object} Analysis result with structured data and raw analysis
   */
  async analyzeStock({ symbol, analysis_type = 'comprehensive' }) {
    try {
      const prompt = this.buildAnalysisPrompt(symbol, analysis_type);
      
      const response = await axios.post(this.baseURL, {
        model: 'sonar',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000,
        temperature: 0.1
      }, {
        headers: {
          'Authorization': `Bearer ${this.perplexityApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const analysis = response.data.choices[0].message.content;
      const parsedData = this.parseAnalysis(analysis);

      return {
        success: true,
        symbol: symbol.toUpperCase(),
        analysis_type,
        raw_analysis: analysis,
        structured_data: parsedData,
        timestamp: new Date().toISOString(),
        message: `Completed ${analysis_type} analysis for ${symbol.toUpperCase()}`
      };

    } catch (error) {
      console.error('Stock analysis error:', error.response?.data || error.message);
      return {
        success: false,
        symbol: symbol.toUpperCase(),
        error: error.message
      };
    }
  }

  buildAnalysisPrompt(symbol, analysisType) {
    const basePrompt = `Provide a ${analysisType} analysis of ${symbol.toUpperCase()} stock:`;
    
    const sections = {
      quick: [
        '1. Current price and 52-week range',
        '2. Key metrics (P/E, Market Cap)',
        '3. Recent performance',
        '4. Simple BUY/HOLD/SELL recommendation with target price'
      ],
      comprehensive: [
        '1. CURRENT MARKET DATA: Current price, market cap, 52-week high/low, trading volume',
        '2. KEY FUNDAMENTALS: P/E ratio, EPS, revenue growth, profit margins, debt-to-equity, ROE',
        '3. ANALYST CONSENSUS: Latest analyst ratings, price targets, and recommendations',
        '4. RECENT NEWS: Latest developments, earnings reports, or significant corporate actions',
        '5. INVESTMENT RECOMMENDATION: Must include:',
        '   - Clear recommendation: BUY/HOLD/SELL',
        '   - Specific target price with currency',
        '   - Timeframe for target (6-12 months)',
        '   - Upside/downside percentage calculation',
        '   - Key risks and catalysts'
      ],
      technical: [
        '1. Chart patterns and trends',
        '2. Key support and resistance levels',
        '3. Technical indicators (RSI, MACD, Moving averages)',
        '4. Trading recommendation'
      ],
      fundamental: [
        '1. Financial health analysis',
        '2. Valuation metrics',
        '3. Growth prospects',
        '4. Competitive position',
        '5. Long-term investment thesis'
      ]
    };

    return basePrompt + '\n' + sections[analysisType].join('\n') + 
           '\n\nIMPORTANT: Always provide current price, target price, and upside calculation with specific numbers.';
  }

  parseAnalysis(analysis) {
    // Simple parsing - in production, this would be more sophisticated
    const data = {
      recommendation: null,
      target_price: null,
      current_price: null,
      upside_percent: null,
      key_metrics: {},
      risks: [],
      catalysts: []
    };

    // Extract recommendation
    const recMatch = analysis.match(/Recommendation:\s*(BUY|HOLD|SELL)/i);
    if (recMatch) data.recommendation = recMatch[1].toUpperCase();

    // Extract target price
    const targetMatch = analysis.match(/Target Price:\s*\$?(\d+\.?\d*)/i);
    if (targetMatch) data.target_price = parseFloat(targetMatch[1]);

    // Extract current price
    const currentMatch = analysis.match(/Current Price:\s*\$?(\d+\.?\d*)/i);
    if (currentMatch) data.current_price = parseFloat(currentMatch[1]);

    // Calculate upside if both prices available
    if (data.target_price && data.current_price) {
      data.upside_percent = ((data.target_price - data.current_price) / data.current_price * 100).toFixed(1);
    }

    return data;
  }

  /**
   * Save stock analysis results to Notion Stock Analysis database
   * 
   * This method was critical for fixing the "empty stock analysis database" issue.
   * It extracts key data from analysis text and saves it with proper schema mapping.
   * 
   * @param {Object} params - Save parameters
   * @param {string} params.symbol - Stock symbol
   * @param {Object} params.analysis_data - Analysis results from analyzeStock()
   * @param {string} params.database_id - Target database ID (defaults to Stock Analysis DB)
   * @returns {Object} Save result with page ID and URL
   */
  async saveStockAnalysis({ symbol, analysis_data, database_id = '25051a7a-4e06-818c-bd42-d0c1eb36111c' }) {
    try {
      const { Client } = require('@notionhq/client');
      const notion = new Client({ auth: process.env.NOTION_TOKEN });

      // Extract key data from analysis
      const structured_data = analysis_data.structured_data || {};
      const recommendation = this.extractRecommendation(analysis_data.raw_analysis);
      const target_price = this.extractTargetPrice(analysis_data.raw_analysis);
      const current_price = this.extractCurrentPrice(analysis_data.raw_analysis);

      // Create page in Stock Analysis database
      const upside_pct = target_price && current_price ? 
        ((target_price - current_price) / current_price * 100).toFixed(1) + '%' : '0%';

      const response = await notion.pages.create({
        parent: { database_id },
        properties: {
          'Company Name': {
            title: [{ type: 'text', text: { content: `${symbol.toUpperCase()} Analysis` } }]
          },
          'Symbol': {
            rich_text: [{ type: 'text', text: { content: symbol.toUpperCase() } }]
          },
          'Current Price': {
            number: current_price || 0
          },
          'Target Price': {
            number: target_price || 0
          },
          'Recommendation': {
            select: recommendation ? { name: recommendation } : null
          },
          'Upside %': {
            rich_text: [{ type: 'text', text: { content: upside_pct } }]
          },
          'Analysis Date': {
            date: { start: new Date().toISOString().split('T')[0] }
          },
          'Timeframe': {
            rich_text: [{ type: 'text', text: { content: '6-12 months' } }]
          },
          'Currency': {
            rich_text: [{ type: 'text', text: { content: 'USD' } }]
          },
          'Analyst': {
            rich_text: [{ type: 'text', text: { content: 'Agent Analysis' } }]
          },
          'Status': {
            select: { name: 'Completed' }
          }
        }
      });

      return {
        success: true,
        page_id: response.id,
        page_url: response.url,
        message: `Saved ${symbol.toUpperCase()} analysis to Stock Analysis database`
      };

    } catch (error) {
      console.error('Error saving stock analysis:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  extractRecommendation(text) {
    if (!text) return null;
    const match = text.match(/\*\*Recommendation\*\*[:\s]*\*?([A-Z]+)\*?/i) || 
                  text.match(/Recommendation[:\s]*([A-Z]+)/i) ||
                  text.match(/\|\s*\*\*Recommendation\*\*[^\|]*\*([A-Z]+)\*/i);
    return match ? match[1].toUpperCase() : null;
  }

  extractTargetPrice(text) {
    if (!text) return null;
    const match = text.match(/\*\*Target Price\*\*[:\s]*\$?(\d+\.?\d*)/i) ||
                  text.match(/Target Price[:\s]*\$?(\d+\.?\d*)/i) ||
                  text.match(/\|\s*\*\*Target Price\*\*[^\|]*\$?(\d+\.?\d*)/i);
    return match ? parseFloat(match[1]) : null;
  }

  extractCurrentPrice(text) {
    if (!text) return null;
    const match = text.match(/\*\*Current Price\*\*[:\s]*\$?(\d+\.?\d*)/i) ||
                  text.match(/Current Price[:\s]*\$?(\d+\.?\d*)/i) ||
                  text.match(/Stock Price[:\s]*\$?(\d+\.?\d*)/i);
    return match ? parseFloat(match[1]) : null;
  }

  /**
   * Get current stock price and basic info
   * 
   * Currently uses mock data for testing. In production, this would
   * connect to a real stock API like Alpha Vantage or Yahoo Finance.
   * 
   * @param {Object} params - Price request parameters
   * @param {string} params.symbol - Stock symbol
   * @returns {Object} Price data with current price, change, and percentage
   */
  async getStockPrice({ symbol }) {
    try {
      // For demo purposes, return mock data
      // In production, you'd use a real stock API like Alpha Vantage, Yahoo Finance, etc.
      
      const mockPrices = {
        'AAPL': { price: 175.43, change: 2.15, change_percent: 1.24 },
        'TSLA': { price: 248.87, change: -5.23, change_percent: -2.06 },
        'UNH': { price: 304.01, change: 1.87, change_percent: 0.62 },
        'ASTS': { price: 50.28, change: 3.45, change_percent: 7.37 }
      };

      const data = mockPrices[symbol.toUpperCase()] || { 
        price: 100.00, 
        change: 0, 
        change_percent: 0 
      };

      return {
        success: true,
        symbol: symbol.toUpperCase(),
        current_price: data.price,
        change: data.change,
        change_percent: data.change_percent,
        timestamp: new Date().toISOString(),
        message: `Retrieved price for ${symbol.toUpperCase()}: $${data.price}`
      };

    } catch (error) {
      return {
        success: false,
        symbol: symbol.toUpperCase(),
        error: error.message
      };
    }
  }
}

module.exports = StockMCP;