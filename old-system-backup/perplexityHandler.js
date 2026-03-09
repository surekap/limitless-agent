const axios = require('axios');

class PerplexityHandler {
  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY;
    this.baseUrl = 'https://api.perplexity.ai';
    
    if (!this.apiKey) {
      throw new Error('PERPLEXITY_API_KEY environment variable is required');
    }
  }

  async searchStock(query, options = {}) {
    try {
      const {
        model = 'sonar',
        includeMarketData = true,
        includeAnalystReports = true,
        includeFundamentals = true,
        includeNews = true
      } = options;

      const enhancedQuery = this.buildStockQuery(query, {
        includeMarketData,
        includeAnalystReports,
        includeFundamentals,
        includeNews
      });

      console.log('Sending query to Perplexity:', enhancedQuery);

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a financial analyst providing comprehensive stock analysis. Always include current market data, key financial metrics, recent news, and provide a clear investment recommendation with target price and timeframe.'
          },
          {
            role: 'user',
            content: enhancedQuery
          }
        ],
        max_tokens: 4000,
        temperature: 0.2,
        return_citations: true,
        return_images: false
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        return {
          success: true,
          content: response.data.choices[0].message.content,
          citations: response.data.citations || [],
          model: model,
          usage: response.data.usage
        };
      } else {
        throw new Error('Invalid response from Perplexity API');
      }

    } catch (error) {
      console.error('Perplexity API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  buildStockQuery(stockSymbol, options) {
    const sections = [];
    
    sections.push(`Provide a comprehensive analysis of ${stockSymbol} stock:`);
    
    if (options.includeMarketData) {
      sections.push('1. CURRENT MARKET DATA: Current price, market cap, 52-week high/low, trading volume');
    }
    
    if (options.includeFundamentals) {
      sections.push('2. KEY FUNDAMENTALS: P/E ratio, EPS, revenue growth, profit margins, debt-to-equity, ROE');
    }
    
    if (options.includeAnalystReports) {
      sections.push('3. ANALYST CONSENSUS: Latest analyst ratings, price targets, and recommendations');
    }
    
    if (options.includeNews) {
      sections.push('4. RECENT NEWS: Latest developments, earnings reports, or significant corporate actions');
    }
    
    sections.push('5. INVESTMENT RECOMMENDATION: Must include:');
    sections.push('   - Clear recommendation: BUY/HOLD/SELL');
    sections.push('   - Specific target price in the same currency as current price');
    sections.push('   - Timeframe for target (6-12 months)');
    sections.push('   - Upside/downside percentage calculation');
    sections.push('   - Key risks and catalysts');
    
    sections.push('IMPORTANT: Always provide current price, target price, and upside calculation with specific numbers.');
    sections.push('Format recommendations clearly with labels like "Recommendation: BUY" and "Target Price: ₹1500"');
    
    return sections.join('\n');
  }

  async getCompanyProfile(stockSymbol) {
    try {
      const query = `Provide detailed company profile for ${stockSymbol}: business model, revenue segments, competitive position, recent financial performance, and key management details.`;
      
      return await this.searchStock(query, {
        includeMarketData: true,
        includeAnalystReports: false,
        includeFundamentals: true,
        includeNews: false
      });

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getMarketSentiment(stockSymbol) {
    try {
      const query = `Analyze current market sentiment for ${stockSymbol}: recent news sentiment, social media buzz, institutional investor activity, and overall market perception.`;
      
      return await this.searchStock(query, {
        includeMarketData: false,
        includeAnalystReports: true,
        includeFundamentals: false,
        includeNews: true
      });

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTechnicalAnalysis(stockSymbol) {
    try {
      const query = `Provide technical analysis for ${stockSymbol}: chart patterns, support/resistance levels, moving averages, RSI, MACD, and short-term price outlook.`;
      
      return await this.searchStock(query, {
        includeMarketData: true,
        includeAnalystReports: false,
        includeFundamentals: false,
        includeNews: false
      });

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  parseStockAnalysis(analysisContent) {
    try {
      const parsed = {
        recommendation: null,
        targetPrice: null,
        currentPrice: null,
        currency: null,
        timeframe: null,
        upside: null,
        keyMetrics: {},
        risks: [],
        catalysts: []
      };

      // Extract recommendation - multiple patterns
      const recPatterns = [
        /(?:recommendation|rating):\s*(?:\*\*)?([A-Z]+)(?:\*\*)?/i,
        /(?:investment\s+)?recommendation:\s*(?:\*\*)?([A-Z]+)(?:\*\*)?/i,
        /(?:overall\s+)?(?:investment\s+)?(?:recommendation|rating):\s*(?:\*\*)?([A-Z]+)(?:\*\*)?/i,
        /recommend[a-z\s]*:\s*(?:\*\*)?([A-Z]+)(?:\*\*)?/i,
        // Pattern found in debug: - **Recommendation:** HOLD
        /\*\*recommendation\*\*:\s*([A-Z]+)/i,
        // Simple pattern: Recommendation: HOLD
        /recommendation:\s*([A-Z]+)/i,
        // Table format patterns
        /\|\s*\*\*Recommendation:\*\*\s*\|\s*([A-Z]+)/i
      ];
      
      for (const pattern of recPatterns) {
        const match = analysisContent.match(pattern);
        if (match && ['BUY', 'SELL', 'HOLD', 'STRONG BUY', 'STRONG SELL'].includes(match[1].toUpperCase())) {
          parsed.recommendation = match[1].toUpperCase();
          break;
        }
      }

      // Extract currency first
      const currencyPatterns = [
        /[₹]\s*\d+/,  // Rupees
        /[\$]\s*\d+/, // Dollars  
        /[£]\s*\d+/,  // Pounds
        /[€]\s*\d+/   // Euros
      ];

      const currencyMap = {
        '₹': 'INR (₹)',
        '$': 'USD ($)',
        '£': 'GBP (£)',
        '€': 'EUR (€)'
      };

      for (const pattern of currencyPatterns) {
        const match = analysisContent.match(pattern);
        if (match) {
          const symbol = match[0].charAt(0);
          parsed.currency = currencyMap[symbol];
          break;
        }
      }

      // Extract current price - handle multiple currencies and formats
      const currentPricePatterns = [
        /current\s+price[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /price[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /trading\s+at[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /share\s+price[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /\*\*Current\s+Price:\*\*[:\s]*([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        // Pattern found in debug: ₹1410 per share
        /([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)\s+per\s+share/i,
        // Pattern found in debug: ₹1410 (simple currency + number)
        /([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/,
        // Fallback patterns without explicit currency symbol
        /current\s+price[:\s]*(?:\*\*)?(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /price[:\s]*(?:\*\*)?(\d+(?:,\d+)*(?:\.\d+)?)/i
      ];

      for (const pattern of currentPricePatterns) {
        const match = analysisContent.match(pattern);
        if (match) {
          if (match[2]) {
            // Has currency symbol
            parsed.currentPrice = parseFloat(match[2].replace(/,/g, ''));
            if (!parsed.currency) {
              parsed.currency = currencyMap[match[1]] || match[1];
            }
          } else {
            // No currency symbol, use the number
            parsed.currentPrice = parseFloat(match[1].replace(/,/g, ''));
          }
          break;
        }
      }

      // Extract target price - multiple patterns
      const targetPricePatterns = [
        /target\s+price[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /price\s+target[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /target[:\s]*(?:\*\*)?([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /\*\*Target\s+Price:\*\*[:\s]*([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        // Table format patterns found in debug
        /\|\s*\*\*Target\s+Price:\*\*\s*\|\s*([₹$£€])(\d+(?:,\d+)*(?:\.\d+)?)/i,
        // Fallback patterns without explicit currency symbol
        /target\s+price[:\s]*(?:\*\*)?(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /price\s+target[:\s]*(?:\*\*)?(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /\|\s*\*\*Target\s+Price:\*\*\s*\|\s*(\d+(?:,\d+)*(?:\.\d+)?)/i
      ];

      for (const pattern of targetPricePatterns) {
        const match = analysisContent.match(pattern);
        if (match) {
          if (match[2]) {
            // Has currency symbol
            parsed.targetPrice = parseFloat(match[2].replace(/,/g, ''));
            if (!parsed.currency) {
              parsed.currency = currencyMap[match[1]] || match[1];
            }
          } else {
            // No currency symbol, use the number
            parsed.targetPrice = parseFloat(match[1].replace(/,/g, ''));
          }
          break;
        }
      }

      // Extract timeframe
      const timePatterns = [
        /timeframe[:\s]*(?:\*\*)?(\d+(?:-\d+)?\s*(?:month|year)s?)/i,
        /time\s+frame[:\s]*(?:\*\*)?(\d+(?:-\d+)?\s*(?:month|year)s?)/i,
        /(?:over|within)\s+(?:the\s+)?(?:next\s+)?(\d+(?:-\d+)?\s*(?:month|year)s?)/i,
        /\*\*Timeframe:\*\*[:\s]*(\d+(?:-\d+)?\s*(?:month|year)s?)/i
      ];

      for (const pattern of timePatterns) {
        const match = analysisContent.match(pattern);
        if (match) {
          parsed.timeframe = match[1];
          break;
        }
      }

      // Try to extract upside directly from text if mentioned
      const upsidePatterns = [
        /upside[:\s]*(?:\*\*)?(\d+(?:\.\d+)?)\s*%/i,
        /potential[:\s]*(?:\*\*)?(\d+(?:\.\d+)?)\s*%/i,
        /gain[:\s]*(?:\*\*)?(\d+(?:\.\d+)?)\s*%/i
      ];

      for (const pattern of upsidePatterns) {
        const match = analysisContent.match(pattern);
        if (match) {
          parsed.upside = match[1];
          break;
        }
      }

      // Calculate upside if we have both prices and no explicit upside found
      if (parsed.targetPrice && parsed.currentPrice && !parsed.upside) {
        parsed.upside = ((parsed.targetPrice - parsed.currentPrice) / parsed.currentPrice * 100).toFixed(1);
      }

      console.log('Parsed analysis data:', parsed);
      return parsed;

    } catch (error) {
      console.error('Error parsing stock analysis:', error);
      return null;
    }
  }

  formatAnalysisForNotion(analysis, stockSymbol) {
    const parsed = this.parseStockAnalysis(analysis.content);
    const currentDate = new Date().toISOString().split('T')[0];

    return {
      companyName: stockSymbol.toUpperCase(),
      analysisDate: currentDate,
      recommendation: parsed?.recommendation || 'HOLD',
      targetPrice: parsed?.targetPrice,
      currentPrice: parsed?.currentPrice,
      currency: parsed?.currency || 'Currency not detected',
      timeframe: parsed?.timeframe || '12 months',
      upside: parsed?.upside ? `${parsed.upside}%` : null,
      fullAnalysis: analysis.content,
      sources: analysis.citations?.map(c => c.url).join('\n') || '',
      model: analysis.model,
      createdAt: new Date().toISOString()
    };
  }
}

module.exports = PerplexityHandler;