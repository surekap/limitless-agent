const axios = require('axios');

class TodoistMCP {
  constructor() {
    this.apiKey = process.env.TODOIST_API_KEY;
    this.baseURL = 'https://api.todoist.com/rest/v2';
  }

  getToolDefinitions() {
    return [
      // === TASK MANAGEMENT ===
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
              description: 'Due date in YYYY-MM-DD format or natural language'
            },
            project_id: {
              type: 'string',
              description: 'Project ID to add task to'
            },
            section_id: {
              type: 'string',
              description: 'Section ID to add task to'
            },
            parent_id: {
              type: 'string',
              description: 'Parent task ID for subtasks'
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of label names to add to task'
            },
            assignee_id: {
              type: 'string',
              description: 'User ID to assign task to'
            }
          },
          required: ['title']
        }
      },
      {
        name: 'update_todo',
        description: 'Update an existing todo task',
        input_schema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task ID to update'
            },
            title: {
              type: 'string',
              description: 'New task title'
            },
            description: {
              type: 'string',
              description: 'New task description'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              description: 'New priority level'
            },
            due_date: {
              type: 'string',
              description: 'New due date'
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              description: 'New labels for task'
            }
          },
          required: ['task_id']
        }
      },
      {
        name: 'complete_todo',
        description: 'Mark a todo task as completed',
        input_schema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task ID to complete'
            }
          },
          required: ['task_id']
        }
      },
      {
        name: 'reopen_todo',
        description: 'Reopen a completed todo task',
        input_schema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task ID to reopen'
            }
          },
          required: ['task_id']
        }
      },
      {
        name: 'delete_todo',
        description: 'Delete a todo task',
        input_schema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task ID to delete'
            }
          },
          required: ['task_id']
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
              description: 'Optional filter for tasks (e.g., "today", "overdue", "p1")'
            },
            project_id: {
              type: 'string',
              description: 'Filter by specific project ID'
            },
            section_id: {
              type: 'string',
              description: 'Filter by specific section ID'
            },
            label: {
              type: 'string',
              description: 'Filter by specific label name'
            },
            lang: {
              type: 'string',
              description: 'IETF language tag for localized task content'
            }
          }
        }
      },
      
      // === PROJECT MANAGEMENT ===
      {
        name: 'create_project',
        description: 'Create a new project in Todoist',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Project name'
            },
            color: {
              type: 'string',
              description: 'Project color (berry_red, red, orange, yellow, olive_green, lime_green, green, mint_green, teal, sky_blue, light_blue, blue, grape, magenta, salmon, charcoal, grey, taupe)'
            },
            parent_id: {
              type: 'string',
              description: 'Parent project ID for sub-projects'
            },
            favorite: {
              type: 'boolean',
              description: 'Whether project should be marked as favorite'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'update_project',
        description: 'Update an existing project',
        input_schema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Project ID to update'
            },
            name: {
              type: 'string',
              description: 'New project name'
            },
            color: {
              type: 'string',
              description: 'New project color'
            },
            favorite: {
              type: 'boolean',
              description: 'Whether project should be marked as favorite'
            }
          },
          required: ['project_id']
        }
      },
      {
        name: 'delete_project',
        description: 'Delete a project',
        input_schema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Project ID to delete'
            }
          },
          required: ['project_id']
        }
      },
      {
        name: 'get_projects',
        description: 'Get all projects',
        input_schema: {
          type: 'object',
          properties: {}
        }
      },
      
      // === SECTION MANAGEMENT ===
      {
        name: 'create_section',
        description: 'Create a new section in a project',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Section name'
            },
            project_id: {
              type: 'string',
              description: 'Project ID to create section in'
            },
            order: {
              type: 'number',
              description: 'Section order within project'
            }
          },
          required: ['name', 'project_id']
        }
      },
      {
        name: 'update_section',
        description: 'Update an existing section',
        input_schema: {
          type: 'object',
          properties: {
            section_id: {
              type: 'string',
              description: 'Section ID to update'
            },
            name: {
              type: 'string',
              description: 'New section name'
            }
          },
          required: ['section_id', 'name']
        }
      },
      {
        name: 'delete_section',
        description: 'Delete a section',
        input_schema: {
          type: 'object',
          properties: {
            section_id: {
              type: 'string',
              description: 'Section ID to delete'
            }
          },
          required: ['section_id']
        }
      },
      {
        name: 'get_sections',
        description: 'Get all sections for a project',
        input_schema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Project ID to get sections for'
            }
          }
        }
      },
      
      // === LABEL MANAGEMENT ===
      {
        name: 'create_label',
        description: 'Create a new label',
        input_schema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Label name'
            },
            color: {
              type: 'string',
              description: 'Label color'
            },
            order: {
              type: 'number',
              description: 'Label order'
            },
            favorite: {
              type: 'boolean',
              description: 'Whether label should be marked as favorite'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'update_label',
        description: 'Update an existing label',
        input_schema: {
          type: 'object',
          properties: {
            label_id: {
              type: 'string',
              description: 'Label ID to update'
            },
            name: {
              type: 'string',
              description: 'New label name'
            },
            color: {
              type: 'string',
              description: 'New label color'
            },
            order: {
              type: 'number',
              description: 'New label order'
            },
            favorite: {
              type: 'boolean',
              description: 'Whether label should be marked as favorite'
            }
          },
          required: ['label_id']
        }
      },
      {
        name: 'delete_label',
        description: 'Delete a label',
        input_schema: {
          type: 'object',
          properties: {
            label_id: {
              type: 'string',
              description: 'Label ID to delete'
            }
          },
          required: ['label_id']
        }
      },
      {
        name: 'get_labels',
        description: 'Get all labels',
        input_schema: {
          type: 'object',
          properties: {}
        }
      },
      
      // === COMMENT MANAGEMENT ===
      {
        name: 'add_comment',
        description: 'Add a comment to a task or project',
        input_schema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Comment content'
            },
            task_id: {
              type: 'string',
              description: 'Task ID to comment on'
            },
            project_id: {
              type: 'string',
              description: 'Project ID to comment on'
            },
            attachment: {
              type: 'object',
              description: 'File attachment object'
            }
          },
          required: ['content']
        }
      },
      {
        name: 'get_comments',
        description: 'Get comments for a task or project',
        input_schema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task ID to get comments for'
            },
            project_id: {
              type: 'string',
              description: 'Project ID to get comments for'
            }
          }
        }
      },
      {
        name: 'update_comment',
        description: 'Update an existing comment',
        input_schema: {
          type: 'object',
          properties: {
            comment_id: {
              type: 'string',
              description: 'Comment ID to update'
            },
            content: {
              type: 'string',
              description: 'New comment content'
            }
          },
          required: ['comment_id', 'content']
        }
      },
      {
        name: 'delete_comment',
        description: 'Delete a comment',
        input_schema: {
          type: 'object',
          properties: {
            comment_id: {
              type: 'string',
              description: 'Comment ID to delete'
            }
          },
          required: ['comment_id']
        }
      }
    ];
  }

  canHandle(toolName) {
    const supportedTools = [
      // Task management
      'create_todo', 'update_todo', 'complete_todo', 'reopen_todo', 'delete_todo', 'get_todos',
      // Project management  
      'create_project', 'update_project', 'delete_project', 'get_projects',
      // Section management
      'create_section', 'update_section', 'delete_section', 'get_sections',
      // Label management
      'create_label', 'update_label', 'delete_label', 'get_labels',
      // Comment management
      'add_comment', 'get_comments', 'update_comment', 'delete_comment'
    ];
    return supportedTools.includes(toolName);
  }

  async execute(toolName, input) {
    switch (toolName) {
      // Task management
      case 'create_todo':
        return await this.createTodo(input);
      case 'update_todo':
        return await this.updateTodo(input);
      case 'complete_todo':
        return await this.completeTodo(input);
      case 'reopen_todo':
        return await this.reopenTodo(input);
      case 'delete_todo':
        return await this.deleteTodo(input);
      case 'get_todos':
        return await this.getTodos(input);
      
      // Project management
      case 'create_project':
        return await this.createProject(input);
      case 'update_project':
        return await this.updateProject(input);
      case 'delete_project':
        return await this.deleteProject(input);
      case 'get_projects':
        return await this.getProjects(input);
      
      // Section management
      case 'create_section':
        return await this.createSection(input);
      case 'update_section':
        return await this.updateSection(input);
      case 'delete_section':
        return await this.deleteSection(input);
      case 'get_sections':
        return await this.getSections(input);
      
      // Label management
      case 'create_label':
        return await this.createLabel(input);
      case 'update_label':
        return await this.updateLabel(input);
      case 'delete_label':
        return await this.deleteLabel(input);
      case 'get_labels':
        return await this.getLabels(input);
      
      // Comment management
      case 'add_comment':
        return await this.addComment(input);
      case 'get_comments':
        return await this.getComments(input);
      case 'update_comment':
        return await this.updateComment(input);
      case 'delete_comment':
        return await this.deleteComment(input);
      
      default:
        throw new Error(`Unknown Todoist tool: ${toolName}`);
    }
  }

  // === TASK MANAGEMENT METHODS ===
  
  async createTodo({ title, description, priority = 'medium', due_date, project_id, section_id, parent_id, labels, assignee_id }) {
    try {
      const priorityMap = { low: 1, medium: 2, high: 3, urgent: 4 };
      
      const taskData = {
        content: title,
        priority: priorityMap[priority] || 2
      };

      // Optional parameters
      if (description) taskData.description = description;
      if (due_date) taskData.due_string = due_date;
      if (project_id) taskData.project_id = project_id;
      if (section_id) taskData.section_id = section_id;
      if (parent_id) taskData.parent_id = parent_id;
      if (labels && labels.length > 0) taskData.labels = labels;
      if (assignee_id) taskData.assignee_id = assignee_id;

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
        project_id: response.data.project_id,
        section_id: response.data.section_id,
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

  async updateTodo({ task_id, title, description, priority, due_date, labels }) {
    try {
      const priorityMap = { low: 1, medium: 2, high: 3, urgent: 4 };
      const updateData = {};

      // Only include fields that are provided
      if (title) updateData.content = title;
      if (description !== undefined) updateData.description = description;
      if (priority) updateData.priority = priorityMap[priority];
      if (due_date !== undefined) updateData.due_string = due_date;
      if (labels !== undefined) updateData.labels = labels;

      const response = await axios.post(`${this.baseURL}/tasks/${task_id}`, updateData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        task_id: response.data.id,
        message: `Updated todo: ${task_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async completeTodo({ task_id }) {
    try {
      await axios.post(`${this.baseURL}/tasks/${task_id}/close`, {}, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        task_id,
        message: `Completed todo: ${task_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async reopenTodo({ task_id }) {
    try {
      await axios.post(`${this.baseURL}/tasks/${task_id}/reopen`, {}, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        task_id,
        message: `Reopened todo: ${task_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async deleteTodo({ task_id }) {
    try {
      await axios.delete(`${this.baseURL}/tasks/${task_id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        task_id,
        message: `Deleted todo: ${task_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async getTodos({ filter, project_id, section_id, label, lang } = {}) {
    try {
      let url = `${this.baseURL}/tasks`;
      const params = new URLSearchParams();

      if (filter) params.append('filter', filter);
      if (project_id) params.append('project_id', project_id);
      if (section_id) params.append('section_id', section_id);
      if (label) params.append('label', label);
      if (lang) params.append('lang', lang);

      if (params.toString()) url += `?${params.toString()}`;

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
          description: task.description,
          completed: task.is_completed,
          priority: task.priority,
          due: task.due?.string,
          project_id: task.project_id,
          section_id: task.section_id,
          parent_id: task.parent_id,
          labels: task.labels,
          assignee_id: task.assignee_id,
          creator_id: task.creator_id,
          created_at: task.created_at,
          url: task.url
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

  // === PROJECT MANAGEMENT METHODS ===

  async createProject({ name, color, parent_id, favorite = false }) {
    try {
      const projectData = { name, favorite };
      
      if (color) projectData.color = color;
      if (parent_id) projectData.parent_id = parent_id;

      const response = await axios.post(`${this.baseURL}/projects`, projectData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        project_id: response.data.id,
        project_url: response.data.url,
        message: `Created project: "${name}"`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async updateProject({ project_id, name, color, favorite }) {
    try {
      const updateData = {};
      
      if (name) updateData.name = name;
      if (color) updateData.color = color;
      if (favorite !== undefined) updateData.favorite = favorite;

      const response = await axios.post(`${this.baseURL}/projects/${project_id}`, updateData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        project_id: response.data.id,
        message: `Updated project: ${project_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async deleteProject({ project_id }) {
    try {
      await axios.delete(`${this.baseURL}/projects/${project_id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        project_id,
        message: `Deleted project: ${project_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async getProjects() {
    try {
      const response = await axios.get(`${this.baseURL}/projects`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        projects: response.data.map(project => ({
          id: project.id,
          name: project.name,
          color: project.color,
          parent_id: project.parent_id,
          child_order: project.child_order,
          collapsed: project.collapsed,
          shared: project.shared,
          is_deleted: project.is_deleted,
          is_archived: project.is_archived,
          is_favorite: project.is_favorite,
          sync_id: project.sync_id,
          inbox_project: project.inbox_project,
          team_inbox: project.team_inbox,
          view_style: project.view_style,
          url: project.url
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

  // === SECTION MANAGEMENT METHODS ===

  async createSection({ name, project_id, order }) {
    try {
      const sectionData = { name, project_id };
      if (order) sectionData.order = order;

      const response = await axios.post(`${this.baseURL}/sections`, sectionData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        section_id: response.data.id,
        project_id: response.data.project_id,
        message: `Created section: "${name}"`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async updateSection({ section_id, name }) {
    try {
      const response = await axios.post(`${this.baseURL}/sections/${section_id}`, { name }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        section_id: response.data.id,
        message: `Updated section: ${section_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async deleteSection({ section_id }) {
    try {
      await axios.delete(`${this.baseURL}/sections/${section_id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        section_id,
        message: `Deleted section: ${section_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async getSections({ project_id } = {}) {
    try {
      let url = `${this.baseURL}/sections`;
      if (project_id) url += `?project_id=${project_id}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        sections: response.data.map(section => ({
          id: section.id,
          project_id: section.project_id,
          order: section.order,
          name: section.name
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

  // === LABEL MANAGEMENT METHODS ===

  async createLabel({ name, order, color, favorite = false }) {
    try {
      const labelData = { name, favorite };
      if (order) labelData.order = order;
      if (color) labelData.color = color;

      const response = await axios.post(`${this.baseURL}/labels`, labelData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        label_id: response.data.id,
        message: `Created label: "${name}"`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async updateLabel({ label_id, name, order, color, favorite }) {
    try {
      const updateData = {};
      if (name) updateData.name = name;
      if (order) updateData.order = order;
      if (color) updateData.color = color;
      if (favorite !== undefined) updateData.favorite = favorite;

      const response = await axios.post(`${this.baseURL}/labels/${label_id}`, updateData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        label_id: response.data.id,
        message: `Updated label: ${label_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async deleteLabel({ label_id }) {
    try {
      await axios.delete(`${this.baseURL}/labels/${label_id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        label_id,
        message: `Deleted label: ${label_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async getLabels() {
    try {
      const response = await axios.get(`${this.baseURL}/labels`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        labels: response.data.map(label => ({
          id: label.id,
          name: label.name,
          color: label.color,
          order: label.order,
          favorite: label.favorite
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

  // === COMMENT MANAGEMENT METHODS ===

  async addComment({ content, task_id, project_id, attachment }) {
    try {
      const commentData = { content };
      
      if (task_id) commentData.task_id = task_id;
      if (project_id) commentData.project_id = project_id;
      if (attachment) commentData.attachment = attachment;

      const response = await axios.post(`${this.baseURL}/comments`, commentData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        comment_id: response.data.id,
        task_id: response.data.task_id,
        project_id: response.data.project_id,
        message: `Added comment`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async getComments({ task_id, project_id } = {}) {
    try {
      let url = `${this.baseURL}/comments`;
      const params = new URLSearchParams();

      if (task_id) params.append('task_id', task_id);
      if (project_id) params.append('project_id', project_id);

      if (params.toString()) url += `?${params.toString()}`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        comments: response.data.map(comment => ({
          id: comment.id,
          task_id: comment.task_id,
          project_id: comment.project_id,
          content: comment.content,
          posted_at: comment.posted_at,
          attachment: comment.attachment
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

  async updateComment({ comment_id, content }) {
    try {
      const response = await axios.post(`${this.baseURL}/comments/${comment_id}`, { content }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        comment_id: response.data.id,
        message: `Updated comment: ${comment_id}`
      };

    } catch (error) {
      console.error('Todoist API error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  async deleteComment({ comment_id }) {
    try {
      await axios.delete(`${this.baseURL}/comments/${comment_id}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return {
        success: true,
        comment_id,
        message: `Deleted comment: ${comment_id}`
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