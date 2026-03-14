/**
 * STOCK MCP TOOL v2.0 - STRUCTURED ANALYSIS FOR NOTION DATABASE
 * 
 * This MCP tool provides comprehensive stock analysis with structured output
 * designed to be directly compatible with Notion's add_to_database tool.
 * 
 * KEY FEATURES:
 * - Single comprehensive analysis (no separate analysis types)
 * - Structured output with consistent field format for easy parsing
 * - Direct compatibility with Notion database schema
 * - PDF report generation support via Perplexity AI
 * - Currency detection and numeric field extraction
 * 
 * USAGE WORKFLOW:
 * 1. Call create_stock_database to create properly structured database (if needed)
 * 2. Call analyze_stock with symbol (and optional company_name, generate_pdf)
 * 3. Receive structured analysis_data object ready for Notion
 * 4. Use analysis_data directly with add_to_database tool
 * 
 * OUTPUT FORMAT:
 * The analysis_data object contains structured fields like:
 * - company_name, ticker, analysis_date
 * - current_price, analyst_target_price (with currencies)
 * - fundamental metrics (eps, pe_ratio, debt_equity_ratio, etc.)
 * - recommendation, target_price, upside_downside_percent
 * - key_risks, key_catalysts, recent_developments
 * - pdf_report_url (if PDF generation requested)
 * 
 * ENVIRONMENT VARIABLES:
 * - PERPLEXITY_API_KEY: Required for stock analysis API calls
 */

const axios = require('axios');

class StockMCP {
  constructor() {
    this.perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    this.baseURL = 'https://api.perplexity.ai/chat/completions';
  }

  getToolDefinitions() {
    return [
      {
        name: 'analyze_stock',
        description: 'Perform comprehensive stock analysis with structured output for Notion database',
        input_schema: {
          type: 'object',
          properties: {
            symbol: {
              type: 'string',
              description: 'Stock symbol (e.g., AAPL, TSLA, UNH)'
            },
            company_name: {
              type: 'string',
              description: 'Company name (optional, will be determined from symbol if not provided)'
            },
            generate_pdf: {
              type: 'boolean',
              description: 'Whether to generate a PDF report attachment',
              default: false
            }
          },
          required: ['symbol']
        }
      },
      {
        name: 'create_stock_database',
        description: 'Create a Notion database specifically designed for stock analysis data with proper schema',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Database name (e.g., "Stock Analysis", "Portfolio Tracking")',
              default: 'Stock Analysis'
            },
            parent_page_id: {
              type: 'string',
              description: 'Parent page ID where database should be created (optional)'
            }
          }
        }
      }
    ];
  }

  canHandle(toolName) {
    return ['analyze_stock', 'create_stock_database'].includes(toolName);
  }

  async execute(toolName, input) {
    switch (toolName) {
      case 'analyze_stock':
        return await this.analyzeStock(input);
      case 'create_stock_database':
        return await this.createStockDatabase(input);
      default:
        throw new Error(`Unknown Stock tool: ${toolName}`);
    }
  }

  async analyzeStock({ symbol, company_name, generate_pdf = false }) {
    try {
      const prompt = this.buildStructuredAnalysisPrompt(symbol, company_name, generate_pdf);
      
      const response = await axios.post(this.baseURL, {
        model: 'sonar',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.1
      }, {
        headers: {
          'Authorization': `Bearer ${this.perplexityApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const analysisContent = response.data.choices[0].message.content;
      const structuredData = this.parseStructuredAnalysis(analysisContent);

      // Return data in format that can be directly used with add_to_database
      return {
        success: true,
        symbol: symbol.toUpperCase(),
        analysis_data: structuredData,
        raw_analysis: analysisContent,
        notion_ready: true,
        timestamp: new Date().toISOString(),
        message: `Completed comprehensive analysis for ${symbol.toUpperCase()}`,
        next_action: {
          tool: 'add_to_database',
          suggestion: 'Use the analysis_data object directly with the Notion add_to_database tool'
        }
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

  buildStructuredAnalysisPrompt(symbol, company_name, generate_pdf) {
    const companyName = company_name || `Company for ${symbol.toUpperCase()}`;
    
    let prompt = `Please provide a detailed stock analysis for ${companyName} / ${symbol.toUpperCase()} including the following elements, formatted for structured data extraction:

## Analysis Requirements:

1. **Analyst Recommendation Summary:**
   - Number of Buy, Hold, Sell, and any other calls from latest analyst reports
   - Average analyst 12-month target price (specify currency)

2. **Current Market Price** (with currency and date)

3. **Key Fundamentals:**
   - Revenue, Net Profit, EBITDA, EPS, P/E ratio, Forward P/E, Debt/Equity, ROE, and Dividend Yield
   - Source and date for each metric

4. **Industry Comparison:**
   - Show industry average of above fundamentals
   - Clear assessment (Good/At Par/Below Average) compared to peer group
   - Highlight areas of strength or weakness

5. **Recent Developments:**
   - Summarize latest news, notable earnings, corporate actions, significant leadership or strategic changes, and major product launches in past quarter

6. **Investment Recommendation:**
   - Recommendation: BUY / HOLD / SELL
   - Specific price target (currency), expected timeframe (6-12 months), and percentage upside/downside from current price
   - Key risks (e.g., macro, business, valuation, industry, regulatory)
   - Key positive catalysts

## CRITICAL OUTPUT FORMAT:
Provide the result as a structured response with the following format exactly:

**COMPANY:** [Company Name]
**TICKER:** [Stock Symbol]
**ANALYSIS_DATE:** [Current Date]
**CURRENT_PRICE:** [Price with Currency]
**ANALYST_RATINGS:** [Buy: X, Hold: Y, Sell: Z]
**ANALYST_TARGET:** [Average Target Price with Currency]
**REVENUE:** [Latest Revenue with Period]
**NET_PROFIT:** [Latest Net Profit with Period]
**EPS:** [Earnings Per Share]
**PE_RATIO:** [P/E Ratio]
**DEBT_EQUITY:** [Debt to Equity Ratio]
**ROE:** [Return on Equity %]
**DIVIDEND_YIELD:** [Dividend Yield %]
**INDUSTRY_COMPARISON:** [Good/At Par/Below Average with brief explanation]
**RECENT_DEVELOPMENTS:** [Key developments in 2-3 sentences]
**RECOMMENDATION:** [BUY/HOLD/SELL]
**TARGET_PRICE:** [Target Price with Currency]
**TIMEFRAME:** [Timeframe in months]
**UPSIDE_DOWNSIDE:** [Percentage with +/- sign]
**KEY_RISKS:** [Top 3 risks, comma-separated]
**KEY_CATALYSTS:** [Top 3 catalysts, comma-separated]`;

    if (generate_pdf) {
      prompt += `

## PDF REPORT GENERATION:
Additionally, generate a downloadable PDF report containing:
- Executive summary
- Detailed financial charts and metrics
- Comprehensive risk analysis
- Investment thesis and recommendation rationale
- Sources and disclaimers

Provide a download link or file attachment for the PDF report.`;
    }

    prompt += `

Please ensure all fields are populated with actual, up-to-date numbers and cite sources where possible. Use the exact format above for easy parsing.`;

    return prompt;
  }

  parseStructuredAnalysis(analysisContent) {
    // Parse the structured response into a format ready for Notion database
    const data = {
      company_name: this.extractField(analysisContent, 'COMPANY'),
      ticker: this.extractField(analysisContent, 'TICKER'),
      analysis_date: this.extractField(analysisContent, 'ANALYSIS_DATE') || new Date().toISOString().split('T')[0],
      current_price: this.extractNumericField(analysisContent, 'CURRENT_PRICE'),
      current_price_currency: this.extractCurrency(analysisContent, 'CURRENT_PRICE'),
      analyst_ratings: this.extractField(analysisContent, 'ANALYST_RATINGS'),
      analyst_target_price: this.extractNumericField(analysisContent, 'ANALYST_TARGET'),
      analyst_target_currency: this.extractCurrency(analysisContent, 'ANALYST_TARGET'),
      revenue: this.extractField(analysisContent, 'REVENUE'),
      net_profit: this.extractField(analysisContent, 'NET_PROFIT'),
      eps: this.extractNumericField(analysisContent, 'EPS'),
      pe_ratio: this.extractNumericField(analysisContent, 'PE_RATIO'),
      debt_equity_ratio: this.extractNumericField(analysisContent, 'DEBT_EQUITY'),
      roe_percentage: this.extractNumericField(analysisContent, 'ROE'),
      dividend_yield: this.extractNumericField(analysisContent, 'DIVIDEND_YIELD'),
      industry_comparison: this.extractField(analysisContent, 'INDUSTRY_COMPARISON'),
      recent_developments: this.extractField(analysisContent, 'RECENT_DEVELOPMENTS'),
      recommendation: this.extractField(analysisContent, 'RECOMMENDATION'),
      target_price: this.extractNumericField(analysisContent, 'TARGET_PRICE'),
      target_price_currency: this.extractCurrency(analysisContent, 'TARGET_PRICE'),
      timeframe_months: this.extractNumericField(analysisContent, 'TIMEFRAME'),
      upside_downside_percent: this.extractField(analysisContent, 'UPSIDE_DOWNSIDE'),
      key_risks: this.extractField(analysisContent, 'KEY_RISKS'),
      key_catalysts: this.extractField(analysisContent, 'KEY_CATALYSTS'),
      pdf_report_url: this.extractPDFUrl(analysisContent)
    };

    return data;
  }

  extractField(content, fieldName) {
    const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  extractNumericField(content, fieldName) {
    const fieldValue = this.extractField(content, fieldName);
    if (!fieldValue) return null;
    
    // Extract numeric value from text
    const numericMatch = fieldValue.match(/[\d.,]+/);
    return numericMatch ? parseFloat(numericMatch[0].replace(/,/g, '')) : null;
  }

  extractCurrency(content, fieldName) {
    const fieldValue = this.extractField(content, fieldName);
    if (!fieldValue) return 'USD';
    
    // Common currency symbols and codes
    if (fieldValue.includes('$') || fieldValue.includes('USD')) return 'USD';
    if (fieldValue.includes('€') || fieldValue.includes('EUR')) return 'EUR';
    if (fieldValue.includes('£') || fieldValue.includes('GBP')) return 'GBP';
    if (fieldValue.includes('¥') || fieldValue.includes('JPY')) return 'JPY';
    if (fieldValue.includes('₹') || fieldValue.includes('INR')) return 'INR';
    
    return 'USD'; // Default fallback
  }

  extractPDFUrl(content) {
    // Look for PDF download links or file attachments
    const pdfMatch = content.match(/(?:PDF|pdf).*?(?:https?:\/\/[^\s]+|attachment|download)/i);
    return pdfMatch ? pdfMatch[0] : null;
  }

  async createStockDatabase({ name = 'Stock Analysis', parent_page_id }) {
    try {
      const { Client } = require('@notionhq/client');
      const notion = new Client({ auth: process.env.NOTION_TOKEN });

      // Default parent page if not provided
      const parentPageId = parent_page_id || '25051a7a4e068074a327d21b3df6a7b4';

      // Create database with schema matching analyze_stock output
      const response = await notion.databases.create({
        parent: {
          type: 'page_id',
          page_id: parentPageId
        },
        title: [
          {
            type: 'text',
            text: {
              content: name
            }
          }
        ],
        properties: {
          // Primary identifier
          'Company': {
            title: {}
          },
          'Ticker': {
            rich_text: {}
          },
          'Analysis Date': {
            date: {}
          },
          
          // Price data with currency support
          'Current Price': {
            number: {
              format: 'dollar'
            }
          },
          'Current Price Currency': {
            select: {
              options: [
                { name: 'USD', color: 'blue' },
                { name: 'EUR', color: 'green' },
                { name: 'GBP', color: 'yellow' },
                { name: 'JPY', color: 'orange' },
                { name: 'INR', color: 'red' }
              ]
            }
          },
          
          // Analyst data
          'Analyst Ratings': {
            rich_text: {}
          },
          'Analyst Target Price': {
            number: {
              format: 'dollar'
            }
          },
          'Analyst Target Currency': {
            select: {
              options: [
                { name: 'USD', color: 'blue' },
                { name: 'EUR', color: 'green' },
                { name: 'GBP', color: 'yellow' },
                { name: 'JPY', color: 'orange' },
                { name: 'INR', color: 'red' }
              ]
            }
          },
          
          // Financial metrics
          'Revenue': {
            rich_text: {}
          },
          'Net Profit': {
            rich_text: {}
          },
          'EPS': {
            number: {
              format: 'dollar'
            }
          },
          'P/E Ratio': {
            number: {
              format: 'number'
            }
          },
          'Debt/Equity Ratio': {
            number: {
              format: 'number'
            }
          },
          'ROE %': {
            number: {
              format: 'percent'
            }
          },
          'Dividend Yield': {
            number: {
              format: 'percent'
            }
          },
          
          // Analysis results
          'Industry Comparison': {
            select: {
              options: [
                { name: 'Good', color: 'green' },
                { name: 'At Par', color: 'yellow' },
                { name: 'Below Average', color: 'red' }
              ]
            }
          },
          'Recent Developments': {
            rich_text: {}
          },
          
          // Investment recommendation
          'Recommendation': {
            select: {
              options: [
                { name: 'BUY', color: 'green' },
                { name: 'HOLD', color: 'yellow' },
                { name: 'SELL', color: 'red' }
              ]
            }
          },
          'Target Price': {
            number: {
              format: 'dollar'
            }
          },
          'Target Price Currency': {
            select: {
              options: [
                { name: 'USD', color: 'blue' },
                { name: 'EUR', color: 'green' },
                { name: 'GBP', color: 'yellow' },
                { name: 'JPY', color: 'orange' },
                { name: 'INR', color: 'red' }
              ]
            }
          },
          'Timeframe (Months)': {
            number: {
              format: 'number'
            }
          },
          'Upside/Downside %': {
            rich_text: {}
          },
          
          // Risk analysis
          'Key Risks': {
            rich_text: {}
          },
          'Key Catalysts': {
            rich_text: {}
          },
          
          // PDF report support
          'PDF Report': {
            url: {}
          },
          
          // Status tracking
          'Status': {
            select: {
              options: [
                { name: 'Completed', color: 'green' },
                { name: 'In Progress', color: 'yellow' },
                { name: 'Pending', color: 'gray' }
              ]
            }
          }
        }
      });

      return {
        success: true,
        database_id: response.id,
        database_url: response.url,
        message: `Created stock analysis database: "${name}" with ${Object.keys(response.properties).length} columns`,
        schema_note: 'Database schema matches analyze_stock output format for direct compatibility'
      };

    } catch (error) {
      console.error('Error creating stock database:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

}

module.exports = StockMCP;