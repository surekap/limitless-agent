const axios = require('axios');

class NotionHandler {
  constructor() {
    this.token = process.env.NOTION_TOKEN;
    this.baseUrl = 'https://api.notion.com/v1';
    this.version = '2022-06-28';
    
    if (!this.token) {
      throw new Error('NOTION_TOKEN environment variable is required');
    }
  }

  async createDatabase(parentPageId, title, properties) {
    try {
      console.log('Creating Notion database:', title);

      const response = await axios.post(`${this.baseUrl}/databases`, {
        parent: {
          type: 'page_id',
          page_id: parentPageId
        },
        title: [
          {
            type: 'text',
            text: {
              content: title
            }
          }
        ],
        properties: properties
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.version
        }
      });

      return {
        success: true,
        database: response.data,
        message: `Database '${title}' created successfully`
      };

    } catch (error) {
      console.error('Notion database creation error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async createPage(databaseId, properties, content = []) {
    try {
      console.log('Creating Notion page in database:', databaseId);

      const response = await axios.post(`${this.baseUrl}/pages`, {
        parent: {
          type: 'database_id',
          database_id: databaseId
        },
        properties: properties,
        children: content
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.version
        }
      });

      return {
        success: true,
        page: response.data,
        message: 'Page created successfully'
      };

    } catch (error) {
      console.error('Notion page creation error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async updatePage(pageId, properties) {
    try {
      console.log('Updating Notion page:', pageId);

      const response = await axios.patch(`${this.baseUrl}/pages/${pageId}`, {
        properties: properties
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.version
        }
      });

      return {
        success: true,
        page: response.data,
        message: 'Page updated successfully'
      };

    } catch (error) {
      console.error('Notion page update error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async queryDatabase(databaseId, filter = {}, sorts = []) {
    try {
      console.log('Querying Notion database:', databaseId);

      const response = await axios.post(`${this.baseUrl}/databases/${databaseId}/query`, {
        filter: filter,
        sorts: sorts
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.version
        }
      });

      return {
        success: true,
        results: response.data.results,
        hasMore: response.data.has_more,
        nextCursor: response.data.next_cursor
      };

    } catch (error) {
      console.error('Notion database query error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getDatabase(databaseId) {
    try {
      console.log('Getting Notion database:', databaseId);

      const response = await axios.get(`${this.baseUrl}/databases/${databaseId}`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': this.version
        }
      });

      return {
        success: true,
        database: response.data
      };

    } catch (error) {
      console.error('Notion get database error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async searchPages(query = '', filter = {}) {
    try {
      console.log('Searching Notion pages:', query);

      const response = await axios.post(`${this.baseUrl}/search`, {
        query: query,
        filter: filter
      }, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Notion-Version': this.version
        }
      });

      return {
        success: true,
        results: response.data.results,
        hasMore: response.data.has_more,
        nextCursor: response.data.next_cursor
      };

    } catch (error) {
      console.error('Notion search error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Stock Analysis specific methods

  createStockAnalysisDatabaseSchema() {
    return {
      'Company Name': {
        title: {}
      },
      'Symbol': {
        rich_text: {}
      },
      'Analysis Date': {
        date: {}
      },
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
          format: 'number_with_commas'
        }
      },
      'Current Price': {
        number: {
          format: 'number_with_commas'
        }
      },
      'Currency': {
        rich_text: {}
      },
      'Upside %': {
        rich_text: {}
      },
      'Timeframe': {
        rich_text: {}
      },
      'Analyst': {
        rich_text: {}
      },
      'Status': {
        select: {
          options: [
            { name: 'Active', color: 'green' },
            { name: 'Closed', color: 'gray' },
            { name: 'Monitoring', color: 'blue' }
          ]
        }
      }
    };
  }

  async createStockAnalysisDatabase(parentPageId, databaseName = 'Stock Analysis') {
    const schema = this.createStockAnalysisDatabaseSchema();
    return await this.createDatabase(parentPageId, databaseName, schema);
  }

  formatStockAnalysisForNotion(analysisData) {
    const properties = {
      'Company Name': {
        title: [
          {
            text: {
              content: analysisData.companyName || 'Unknown Company'
            }
          }
        ]
      },
      'Symbol': {
        rich_text: [
          {
            text: {
              content: analysisData.symbol || ''
            }
          }
        ]
      },
      'Analysis Date': {
        date: {
          start: analysisData.analysisDate || new Date().toISOString().split('T')[0]
        }
      },
      'Recommendation': {
        select: {
          name: analysisData.recommendation || 'HOLD'
        }
      },
      'Timeframe': {
        rich_text: [
          {
            text: {
              content: analysisData.timeframe || '12 months'
            }
          }
        ]
      },
      'Analyst': {
        rich_text: [
          {
            text: {
              content: 'Perplexity AI'
            }
          }
        ]
      },
      'Currency': {
        rich_text: [
          {
            text: {
              content: analysisData.currency || 'Not specified'
            }
          }
        ]
      },
      'Status': {
        select: {
          name: 'Active'
        }
      }
    };

    // Add target price if available
    if (analysisData.targetPrice) {
      properties['Target Price'] = {
        number: analysisData.targetPrice
      };
    }

    // Add current price if available
    if (analysisData.currentPrice) {
      properties['Current Price'] = {
        number: analysisData.currentPrice
      };
    }

    // Add upside if available
    if (analysisData.upside) {
      properties['Upside %'] = {
        rich_text: [
          {
            text: {
              content: analysisData.upside
            }
          }
        ]
      };
    }

    return properties;
  }

  createAnalysisContent(analysisData) {
    const content = [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'Executive Summary'
              }
            }
          ]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `Analysis of ${analysisData.companyName} (${analysisData.symbol}) as of ${analysisData.analysisDate}. Recommendation: ${analysisData.recommendation}${analysisData.targetPrice ? ` with target price of $${analysisData.targetPrice}` : ''}.`
              }
            }
          ]
        }
      }
    ];

    // Add full analysis if available
    if (analysisData.fullAnalysis) {
      content.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'Detailed Analysis'
              }
            }
          ]
        }
      });

      // Split analysis into paragraphs
      const paragraphs = analysisData.fullAnalysis.split('\n\n');
      paragraphs.forEach(paragraph => {
        if (paragraph.trim()) {
          content.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: paragraph.trim()
                  }
                }
              ]
            }
          });
        }
      });
    }

    // Add sources if available
    if (analysisData.sources) {
      content.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: 'Sources'
              }
            }
          ]
        }
      });

      content.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: analysisData.sources
              }
            }
          ]
        }
      });
    }

    return content;
  }

  async createStockAnalysisPage(databaseId, analysisData) {
    try {
      const properties = this.formatStockAnalysisForNotion(analysisData);
      const content = this.createAnalysisContent(analysisData);

      return await this.createPage(databaseId, properties, content);

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async findStockAnalysisDatabase(query = 'Stock Analysis') {
    try {
      const searchResult = await this.searchPages(query, {
        value: 'database',
        property: 'object'
      });

      if (searchResult.success && searchResult.results.length > 0) {
        // Return the first database found
        return {
          success: true,
          database: searchResult.results[0]
        };
      } else {
        return {
          success: false,
          error: 'Stock Analysis database not found'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = NotionHandler;