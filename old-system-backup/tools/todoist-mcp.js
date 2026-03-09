/**
 * TODOIST MCP TOOL - Task Management Integration
 * 
 * This MCP tool provides Claude with task management capabilities through Todoist:
 * - Create new tasks with titles, descriptions, priorities, and due dates
 * - Retrieve existing tasks with optional filtering
 * - Map priority levels from natural language to Todoist's numeric system
 * - Handle task creation from natural language requests in lifelogs
 * 
 * KEY FEATURES:
 * - Natural language priority mapping (low/medium/high/urgent → 1/2/3/4)
 * - Flexible due date parsing (accepts various date formats)
 * - Task retrieval with filtering (today, overdue, etc.)
 * - Error handling with detailed API error messages
 * - Simple and reliable integration with Todoist REST API v2
 * 
 * TOOLS PROVIDED:
 * - create_todo: Create new tasks from lifelog content
 * - get_todos: Retrieve tasks with optional filtering
 * 
 * ENVIRONMENT VARIABLES:
 * - TODOIST_API_TOKEN: Todoist API token for authentication
 */

const axios = require('axios');

/**
 * TodoistMCP - Handles all task management operations for the agent
 */
class TodoistMCP {
  /**
   * Initialize Todoist API client
   */
  constructor() {
    this.apiKey = process.env.TODOIST_API_KEY;
    this.baseURL = 'https://api.todoist.com/rest/v2';
  }

  /**
   * Return tool definitions for Claude to understand available Todoist operations
   * 
   * @returns {Array} Array of tool definitions with schemas
   */
  getToolDefinitions() {
    return [
      {
        name: 'create_todo',
        description: 'Create a new todo task in Todoist',
        input_schema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'The task title'
            },
            description: {
              type: 'string',
              description: 'Optional task description'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              description: 'Task priority level'
            },
            due_date: {
              type: 'string',
              description: 'Due date in YYYY-MM-DD format'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'get_todos',
        description: 'Get list of todo tasks from Todoist',
        input_schema: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              description: 'Optional filter for tasks (e.g., "today", "overdue")'
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
    return ['create_todo', 'get_todos'].includes(toolName);
  }

  /**
   * Execute a Todoist tool operation
   * 
   * @param {string} toolName - Name of the tool to execute
   * @param {Object} input - Input parameters for the tool
   * @returns {Object} Tool execution result
   */
  async execute(toolName, input) {
    switch (toolName) {
      case 'create_todo':
        return await this.createTodo(input);
      case 'get_todos':
        return await this.getTodos(input);
      default:
        throw new Error(`Unknown Todoist tool: ${toolName}`);
    }
  }

  /**
   * Create a new todo task in Todoist
   * 
   * @param {Object} params - Task creation parameters
   * @param {string} params.title - Task title
   * @param {string} params.description - Optional task description
   * @param {string} params.priority - Priority level (low/medium/high/urgent)
   * @param {string} params.due_date - Optional due date
   * @returns {Object} Creation result with task ID and URL
   */
  async createTodo({ title, description, priority = 'medium', due_date }) {
    try {
      const priorityMap = { low: 1, medium: 2, high: 3, urgent: 4 };
      
      const taskData = {
        content: title,
        priority: priorityMap[priority] || 2
      };

      if (description) taskData.description = description;
      if (due_date) taskData.due_string = due_date;

      const response = await axios.post(`${this.baseURL}/tasks`, taskData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        task_id: response.data.id,
        task_url: response.data.url,
        message: `Created todo: "${title}"`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get list of todo tasks from Todoist
   * 
   * @param {Object} params - Retrieval parameters
   * @param {string} params.filter - Optional filter (e.g., "today", "overdue")
   * @returns {Object} Task list with simplified task objects
   */
  async getTodos({ filter } = {}) {
    try {
      let url = `${this.baseURL}/tasks`;
      if (filter) url += `?filter=${encodeURIComponent(filter)}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        tasks: response.data.map(task => ({
          id: task.id,
          title: task.content,
          completed: task.is_completed,
          priority: task.priority,
          due: task.due?.string
        })),
        count: response.data.length
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }
}

module.exports = TodoistMCP;