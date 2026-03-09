const TodoistHandler = require('../services/todoistHandler');

class TodoistHandlers {
  constructor() {
    this.todoist = new TodoistHandler();
  }

  // Create a new task in Todoist
  async createTodoistTask(args) {
    try {
      console.log('Creating Todoist task:', args);

      // Build task data with proper formatting
      const taskData = this.todoist.buildTaskData({
        content: args.title || args.content,
        description: args.description,
        due_string: args.due_string,
        due_date: args.due_date,
        priority: this.mapPriority(args.priority),
        project_id: args.project_id,
        section_id: args.section_id,
        labels: args.labels
      });

      // If project name is provided instead of ID, find the project
      if (args.project_name && !args.project_id) {
        const projectResult = await this.todoist.findProjectByName(args.project_name);
        if (projectResult.success) {
          taskData.project_id = projectResult.project.id;
        }
      }

      const result = await this.todoist.createTask(taskData);
      
      if (result.success) {
        return {
          message: result.message,
          taskId: result.task.id,
          taskUrl: result.task.url,
          task: result.task
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to create Todoist task: ${error.message}`);
    }
  }

  // Complete a task in Todoist
  async completeTodoistTask(args) {
    try {
      console.log('Completing Todoist task:', args);

      let taskId = args.task_id || args.taskId;

      // If task name is provided, find the task first
      if (!taskId && args.task_name) {
        const tasksResult = await this.todoist.getTasks();
        if (tasksResult.success) {
          const task = tasksResult.tasks.find(t => 
            t.content.toLowerCase().includes(args.task_name.toLowerCase())
          );
          if (task) {
            taskId = task.id;
          } else {
            throw new Error(`Task with name "${args.task_name}" not found`);
          }
        }
      }

      if (!taskId) {
        throw new Error('Task ID or task name is required');
      }

      const result = await this.todoist.completeTask(taskId);
      
      if (result.success) {
        return {
          message: result.message,
          taskId: taskId
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to complete Todoist task: ${error.message}`);
    }
  }

  // Update an existing task in Todoist
  async updateTodoistTask(args) {
    try {
      console.log('Updating Todoist task:', args);

      const taskId = args.task_id || args.taskId;
      if (!taskId) {
        throw new Error('Task ID is required for updating');
      }

      const updates = {};
      if (args.title || args.content) updates.content = args.title || args.content;
      if (args.description) updates.description = args.description;
      if (args.due_string) updates.due_string = args.due_string;
      if (args.due_date) updates.due_date = this.todoist.formatDueDate(args.due_date);
      if (args.priority) updates.priority = this.mapPriority(args.priority);
      if (args.labels) updates.labels = args.labels;

      const result = await this.todoist.updateTask(taskId, updates);
      
      if (result.success) {
        return {
          message: result.message,
          taskId: taskId,
          task: result.task
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to update Todoist task: ${error.message}`);
    }
  }

  // Create a new project in Todoist
  async createTodoistProject(args) {
    try {
      console.log('Creating Todoist project:', args);

      const projectData = {
        name: args.name || args.title,
        color: args.color,
        is_favorite: args.is_favorite || false,
        view_style: args.view_style || 'list'
      };

      if (args.parent_id) {
        projectData.parent_id = args.parent_id;
      }

      const result = await this.todoist.createProject(projectData);
      
      if (result.success) {
        return {
          message: result.message,
          projectId: result.project.id,
          projectUrl: result.project.url,
          project: result.project
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to create Todoist project: ${error.message}`);
    }
  }

  // Get tasks from Todoist with filtering
  async getTodoistTasks(args) {
    try {
      console.log('Getting Todoist tasks:', args);

      const filters = {};
      if (args.project_id) filters.project_id = args.project_id;
      if (args.section_id) filters.section_id = args.section_id;
      if (args.label) filters.label = args.label;
      if (args.filter) filters.filter = args.filter;

      // If project name is provided, find the project ID
      if (args.project_name && !args.project_id) {
        const projectResult = await this.todoist.findProjectByName(args.project_name);
        if (projectResult.success) {
          filters.project_id = projectResult.project.id;
        }
      }

      const result = await this.todoist.getTasks(filters);
      
      if (result.success) {
        return {
          message: `Retrieved ${result.count} tasks`,
          count: result.count,
          tasks: result.tasks
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to get Todoist tasks: ${error.message}`);
    }
  }

  // Add a comment to a task or project
  async addTodoistComment(args) {
    try {
      console.log('Adding Todoist comment:', args);

      const commentData = {
        content: args.content || args.comment
      };

      if (args.task_id) {
        commentData.task_id = args.task_id;
      } else if (args.project_id) {
        commentData.project_id = args.project_id;
      } else {
        throw new Error('Either task_id or project_id is required');
      }

      const result = await this.todoist.createComment(commentData);
      
      if (result.success) {
        return {
          message: result.message,
          commentId: result.comment.id,
          comment: result.comment
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to add Todoist comment: ${error.message}`);
    }
  }

  // Create a label in Todoist
  async createTodoistLabel(args) {
    try {
      console.log('Creating Todoist label:', args);

      const labelData = {
        name: args.name,
        color: args.color,
        order: args.order,
        is_favorite: args.is_favorite || false
      };

      const result = await this.todoist.createLabel(labelData);
      
      if (result.success) {
        return {
          message: result.message,
          labelId: result.label.id,
          label: result.label
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Failed to create Todoist label: ${error.message}`);
    }
  }

  // === ADVANCED WORKFLOW HANDLERS ===

  // Manage stale todos - find and update todos with no activity
  async manageStaleTodos(args) {
    try {
      console.log('Managing stale todos:', args);

      const daysThreshold = args.days_threshold || 7;
      const commentTemplate = args.comment_template || "What's the update on this?";
      const dryRun = args.dry_run || false;

      // Get stale tasks
      console.log(`Finding tasks with no activity for ${daysThreshold} days...`);
      const staleResult = await this.todoist.getStaleTasksWithDetails(daysThreshold);
      
      if (!staleResult.success) {
        throw new Error(staleResult.error);
      }

      console.log(`Found ${staleResult.count} stale tasks`);

      if (staleResult.count === 0) {
        return {
          message: `No stale tasks found (older than ${daysThreshold} days with no activity)`,
          count: 0,
          tasks: []
        };
      }

      // If dry run, just return what would be updated
      if (dryRun) {
        return {
          message: `Dry run: Found ${staleResult.count} tasks that would receive comments`,
          count: staleResult.count,
          tasks: staleResult.tasks.map(task => ({
            id: task.id,
            title: task.content,
            created: task.created_at,
            lastComment: task.last_comment_date
          })),
          wouldAddComment: commentTemplate
        };
      }

      // Add comments to stale tasks
      console.log(`Adding comments to ${staleResult.count} stale tasks...`);
      const bulkResult = await this.todoist.addBulkComments(staleResult.tasks, commentTemplate);

      if (bulkResult.success) {
        return {
          message: bulkResult.summary,
          totalFound: staleResult.count,
          successful: bulkResult.results.successful.length,
          failed: bulkResult.results.failed.length,
          successfulTasks: bulkResult.results.successful,
          failedTasks: bulkResult.results.failed,
          comment: commentTemplate
        };
      } else {
        throw new Error('Failed to add bulk comments');
      }

    } catch (error) {
      throw new Error(`Failed to manage stale todos: ${error.message}`);
    }
  }

  // Add comment to specific todo
  async addTodoComment(args) {
    try {
      console.log('Adding todo comment:', args);

      const taskId = args.task_id;
      const comment = args.comment || args.content;

      if (!taskId) {
        throw new Error('Task ID is required');
      }

      if (!comment) {
        throw new Error('Comment content is required');
      }

      const result = await this.todoist.createComment({
        task_id: taskId,
        content: comment
      });

      if (result.success) {
        return {
          message: result.message,
          commentId: result.comment.id,
          taskId: taskId,
          comment: result.comment
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`Failed to add todo comment: ${error.message}`);
    }
  }

  // Get todos with advanced filtering
  async getAdvancedTodos(args) {
    try {
      console.log('Getting todos with advanced filtering:', args);

      const options = {
        noActivitySince: args.no_activity_since,
        noComments: args.no_comments || false,
        projectId: args.project_id,
        includeActivity: args.include_activity !== false
      };

      // If project name provided, resolve to ID
      if (args.project_name && !args.project_id) {
        const projectResult = await this.todoist.findProjectByName(args.project_name);
        if (projectResult.success) {
          options.projectId = projectResult.project.id;
        }
      }

      const result = await this.todoist.getTasksWithActivityFilter(options);

      if (result.success) {
        return {
          message: `Retrieved ${result.count} tasks matching criteria`,
          count: result.count,
          tasks: result.tasks,
          filters: result.filtered_by
        };
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      throw new Error(`Failed to get advanced todos: ${error.message}`);
    }
  }

  // Bulk update multiple todos
  async bulkUpdateTodos(args) {
    try {
      console.log('Bulk updating todos:', args);

      const { filter_criteria, action, action_data } = args;

      if (!filter_criteria || !action || !action_data) {
        throw new Error('filter_criteria, action, and action_data are required');
      }

      // Get tasks based on filter criteria
      const tasksResult = await this.getAdvancedTodos(filter_criteria);
      
      if (!tasksResult.count) {
        return {
          message: 'No tasks found matching the filter criteria',
          count: 0,
          results: []
        };
      }

      const results = [];

      // Execute the specified action on each task
      for (const task of tasksResult.tasks) {
        try {
          let actionResult;

          switch (action) {
            case 'add_comment':
              actionResult = await this.addTodoComment({
                task_id: task.id,
                comment: action_data.comment
              });
              break;

            case 'update_priority':
              actionResult = await this.updateTodoistTask({
                task_id: task.id,
                priority: action_data.priority
              });
              break;

            case 'complete':
              actionResult = await this.completeTodoistTask({
                task_id: task.id
              });
              break;

            default:
              throw new Error(`Unsupported action: ${action}`);
          }

          results.push({
            taskId: task.id,
            taskTitle: task.content,
            action: action,
            success: true,
            result: actionResult
          });

        } catch (error) {
          results.push({
            taskId: task.id,
            taskTitle: task.content,
            action: action,
            success: false,
            error: error.message
          });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return {
        message: `Bulk update completed: ${successful} successful, ${failed} failed`,
        totalProcessed: results.length,
        successful: successful,
        failed: failed,
        results: results
      };

    } catch (error) {
      throw new Error(`Failed to bulk update todos: ${error.message}`);
    }
  }

  // Utility method to map priority levels
  mapPriority(priority) {
    if (!priority) return 1;
    
    if (typeof priority === 'string') {
      const priorityMap = {
        'low': 1,
        'normal': 1,
        'medium': 2,
        'high': 3,
        'urgent': 4
      };
      return priorityMap[priority.toLowerCase()] || 1;
    }

    // Ensure priority is within Todoist's 1-4 range
    return Math.min(Math.max(parseInt(priority), 1), 4);
  }

  // Get all available handler schemas for registration
  static getHandlerSchemas() {
    return [
      {
        name: 'create_todo',
        description: 'Create a new todo/task when user explicitly requests a reminder or todo item',
        schema: {
          type: 'object',
          properties: {
            title: { 
              type: 'string', 
              description: 'Task title/content (required)' 
            },
            description: { 
              type: 'string', 
              description: 'Detailed task description' 
            },
            due_date: { 
              type: 'string', 
              format: 'date', 
              description: 'Due date in YYYY-MM-DD format' 
            },
            due_string: { 
              type: 'string', 
              description: 'Natural language due date (e.g., "tomorrow", "next Monday")' 
            },
            priority: { 
              type: 'string', 
              enum: ['low', 'medium', 'high', 'urgent'],
              description: 'Task priority level' 
            },
            project_name: { 
              type: 'string', 
              description: 'Name of the project to add task to' 
            },
            labels: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Array of label names to apply to the task' 
            }
          },
          required: ['title']
        }
      },
      {
        name: 'complete_todo',
        description: 'Mark a todo/task as completed',
        schema: {
          type: 'object',
          properties: {
            task_id: { 
              type: 'string', 
              description: 'Task ID' 
            },
            task_name: { 
              type: 'string', 
              description: 'Task name to search for if ID not provided' 
            }
          },
          required: ['task_id']
        }
      },
      {
        name: 'update_todo',
        description: 'Update an existing todo/task',
        schema: {
          type: 'object',
          properties: {
            task_id: { 
              type: 'string', 
              description: 'Task ID (required)' 
            },
            title: { 
              type: 'string', 
              description: 'New task title' 
            },
            description: { 
              type: 'string', 
              description: 'New task description' 
            },
            due_date: { 
              type: 'string', 
              format: 'date', 
              description: 'New due date' 
            },
            priority: { 
              type: 'string', 
              enum: ['low', 'medium', 'high', 'urgent'],
              description: 'New priority level' 
            }
          },
          required: ['task_id']
        }
      },
      {
        name: 'get_todos',
        description: 'Retrieve todos/tasks with optional filtering',
        schema: {
          type: 'object',
          properties: {
            project_name: { 
              type: 'string', 
              description: 'Filter by project name' 
            },
            label: { 
              type: 'string', 
              description: 'Filter by label' 
            },
            filter: { 
              type: 'string', 
              description: 'Filter string (e.g., "today", "overdue")' 
            }
          }
        }
      },
      {
        name: 'manage_stale_todos',
        description: 'Find and manage todos that have been inactive for a specified period, optionally adding comments to prompt for updates',
        schema: {
          type: 'object',
          properties: {
            days_threshold: { 
              type: 'number', 
              description: 'Number of days to consider todos "stale" (default: 7)' 
            },
            comment_template: { 
              type: 'string', 
              description: 'Comment to add to stale todos (default: "What\'s the update on this?")' 
            },
            dry_run: { 
              type: 'boolean', 
              description: 'Preview changes without applying them (default: false)' 
            }
          }
        }
      },
      {
        name: 'add_todo_comment',
        description: 'Add a comment to a specific todo task',
        schema: {
          type: 'object',
          properties: {
            task_id: { 
              type: 'string', 
              description: 'Todo task ID (required)' 
            },
            comment: { 
              type: 'string', 
              description: 'Comment content (required)' 
            }
          },
          required: ['task_id', 'comment']
        }
      },
      {
        name: 'bulk_update_todos',
        description: 'Perform bulk operations on multiple todos based on filter criteria',
        schema: {
          type: 'object',
          properties: {
            filter_criteria: {
              type: 'object',
              description: 'Criteria to filter todos',
              properties: {
                no_activity_since: { type: 'string', description: 'ISO date string' },
                no_comments: { type: 'boolean', description: 'Filter todos with no comments' },
                project_name: { type: 'string', description: 'Filter by project name' }
              }
            },
            action: { 
              type: 'string', 
              enum: ['add_comment', 'update_priority', 'complete'],
              description: 'Action to perform on filtered todos' 
            },
            action_data: {
              type: 'object',
              description: 'Data for the action (e.g., {comment: "text"} for add_comment)'
            }
          },
          required: ['filter_criteria', 'action', 'action_data']
        }
      }
    ];
  }
}

module.exports = TodoistHandlers;