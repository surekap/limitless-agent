const axios = require('axios');

class TodoistHandler {
  constructor() {
    this.apiKey = process.env.TODOIST_API_KEY;
    this.baseURL = 'https://api.todoist.com/rest/v2';
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // === TASK OPERATIONS ===

  async createTask(taskData) {
    try {
      const response = await axios.post(`${this.baseURL}/tasks`, taskData, {
        headers: this.headers
      });
      
      return {
        success: true,
        task: response.data,
        message: `Task "${response.data.content}" created successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async getTasks(filters = {}) {
    try {
      const params = new URLSearchParams();
      
      if (filters.project_id) params.append('project_id', filters.project_id);
      if (filters.section_id) params.append('section_id', filters.section_id);
      if (filters.label) params.append('label', filters.label);
      if (filters.filter) params.append('filter', filters.filter);
      if (filters.lang) params.append('lang', filters.lang);
      if (filters.ids) params.append('ids', filters.ids);

      const response = await axios.get(`${this.baseURL}/tasks?${params}`, {
        headers: this.headers
      });

      return {
        success: true,
        tasks: response.data,
        count: response.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async getTask(taskId) {
    try {
      const response = await axios.get(`${this.baseURL}/tasks/${taskId}`, {
        headers: this.headers
      });

      return {
        success: true,
        task: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async updateTask(taskId, updates) {
    try {
      const response = await axios.post(`${this.baseURL}/tasks/${taskId}`, updates, {
        headers: this.headers
      });

      return {
        success: true,
        task: response.data,
        message: `Task updated successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async completeTask(taskId) {
    try {
      await axios.post(`${this.baseURL}/tasks/${taskId}/close`, {}, {
        headers: this.headers
      });

      return {
        success: true,
        message: `Task completed successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async reopenTask(taskId) {
    try {
      await axios.post(`${this.baseURL}/tasks/${taskId}/reopen`, {}, {
        headers: this.headers
      });

      return {
        success: true,
        message: `Task reopened successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async deleteTask(taskId) {
    try {
      await axios.delete(`${this.baseURL}/tasks/${taskId}`, {
        headers: this.headers
      });

      return {
        success: true,
        message: `Task deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // === PROJECT OPERATIONS ===

  async getProjects() {
    try {
      const response = await axios.get(`${this.baseURL}/projects`, {
        headers: this.headers
      });

      return {
        success: true,
        projects: response.data,
        count: response.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async createProject(projectData) {
    try {
      const response = await axios.post(`${this.baseURL}/projects`, projectData, {
        headers: this.headers
      });

      return {
        success: true,
        project: response.data,
        message: `Project "${response.data.name}" created successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async getProject(projectId) {
    try {
      const response = await axios.get(`${this.baseURL}/projects/${projectId}`, {
        headers: this.headers
      });

      return {
        success: true,
        project: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async updateProject(projectId, updates) {
    try {
      const response = await axios.post(`${this.baseURL}/projects/${projectId}`, updates, {
        headers: this.headers
      });

      return {
        success: true,
        project: response.data,
        message: `Project updated successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async deleteProject(projectId) {
    try {
      await axios.delete(`${this.baseURL}/projects/${projectId}`, {
        headers: this.headers
      });

      return {
        success: true,
        message: `Project deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // === SECTION OPERATIONS ===

  async getSections(projectId = null) {
    try {
      const params = projectId ? `?project_id=${projectId}` : '';
      const response = await axios.get(`${this.baseURL}/sections${params}`, {
        headers: this.headers
      });

      return {
        success: true,
        sections: response.data,
        count: response.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async createSection(sectionData) {
    try {
      const response = await axios.post(`${this.baseURL}/sections`, sectionData, {
        headers: this.headers
      });

      return {
        success: true,
        section: response.data,
        message: `Section "${response.data.name}" created successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async updateSection(sectionId, updates) {
    try {
      const response = await axios.post(`${this.baseURL}/sections/${sectionId}`, updates, {
        headers: this.headers
      });

      return {
        success: true,
        section: response.data,
        message: `Section updated successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async deleteSection(sectionId) {
    try {
      await axios.delete(`${this.baseURL}/sections/${sectionId}`, {
        headers: this.headers
      });

      return {
        success: true,
        message: `Section deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // === LABEL OPERATIONS ===

  async getLabels() {
    try {
      const response = await axios.get(`${this.baseURL}/labels`, {
        headers: this.headers
      });

      return {
        success: true,
        labels: response.data,
        count: response.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async createLabel(labelData) {
    try {
      const response = await axios.post(`${this.baseURL}/labels`, labelData, {
        headers: this.headers
      });

      return {
        success: true,
        label: response.data,
        message: `Label "${response.data.name}" created successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async updateLabel(labelId, updates) {
    try {
      const response = await axios.post(`${this.baseURL}/labels/${labelId}`, updates, {
        headers: this.headers
      });

      return {
        success: true,
        label: response.data,
        message: `Label updated successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async deleteLabel(labelId) {
    try {
      await axios.delete(`${this.baseURL}/labels/${labelId}`, {
        headers: this.headers
      });

      return {
        success: true,
        message: `Label deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // === COMMENT OPERATIONS ===

  async getComments(taskId = null, projectId = null) {
    try {
      const params = new URLSearchParams();
      if (taskId) params.append('task_id', taskId);
      if (projectId) params.append('project_id', projectId);

      const response = await axios.get(`${this.baseURL}/comments?${params}`, {
        headers: this.headers
      });

      return {
        success: true,
        comments: response.data,
        count: response.data.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async createComment(commentData) {
    try {
      const response = await axios.post(`${this.baseURL}/comments`, commentData, {
        headers: this.headers
      });

      return {
        success: true,
        comment: response.data,
        message: `Comment added successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async updateComment(commentId, updates) {
    try {
      const response = await axios.post(`${this.baseURL}/comments/${commentId}`, updates, {
        headers: this.headers
      });

      return {
        success: true,
        comment: response.data,
        message: `Comment updated successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async deleteComment(commentId) {
    try {
      await axios.delete(`${this.baseURL}/comments/${commentId}`, {
        headers: this.headers
      });

      return {
        success: true,
        message: `Comment deleted successfully`
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // === ADVANCED FILTERING METHODS ===

  async getTasksWithActivityFilter(options = {}) {
    try {
      const {
        noActivitySince,
        noComments = false,
        projectId,
        includeActivity = true
      } = options;

      // Get all tasks first
      const tasksResult = await this.getTasks({ project_id: projectId });
      if (!tasksResult.success) return tasksResult;

      let filteredTasks = tasksResult.tasks;

      // Filter tasks with no comments if requested
      if (noComments) {
        filteredTasks = filteredTasks.filter(task => task.comment_count === 0);
      }

      // Filter by activity date if specified
      if (noActivitySince) {
        const cutoffDate = new Date(noActivitySince);
        filteredTasks = filteredTasks.filter(task => {
          const createdDate = new Date(task.created_at);
          return createdDate < cutoffDate;
        });
      }

      // Include activity details if requested
      if (includeActivity) {
        for (let task of filteredTasks) {
          try {
            const commentsResult = await this.getComments(task.id);
            if (commentsResult.success) {
              task.comments = commentsResult.comments;
              task.last_comment_date = commentsResult.comments.length > 0 
                ? commentsResult.comments[commentsResult.comments.length - 1].posted_at 
                : null;
            }
            
            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.warn(`Could not get comments for task ${task.id}:`, error.message);
          }
        }
      }

      return {
        success: true,
        tasks: filteredTasks,
        count: filteredTasks.length,
        filtered_by: options
      };

    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async getStaleTasksWithDetails(daysThreshold = 7) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

      console.log(`Looking for tasks with no activity since: ${cutoffDate.toISOString()}`);

      const result = await this.getTasksWithActivityFilter({
        noActivitySince: cutoffDate.toISOString(),
        noComments: true,
        includeActivity: true
      });

      if (result.success) {
        // Further filter by checking if there's been any recent activity
        const staleTasks = result.tasks.filter(task => {
          const createdDate = new Date(task.created_at);
          const lastCommentDate = task.last_comment_date ? new Date(task.last_comment_date) : null;
          
          // Task is stale if:
          // 1. No comments at all, OR
          // 2. Last comment is older than threshold, AND
          // 3. Task was created before threshold
          
          const isOldEnough = createdDate < cutoffDate;
          const hasNoRecentComments = !lastCommentDate || lastCommentDate < cutoffDate;
          
          return isOldEnough && hasNoRecentComments;
        });

        return {
          success: true,
          tasks: staleTasks,
          count: staleTasks.length,
          threshold_days: daysThreshold,
          cutoff_date: cutoffDate.toISOString()
        };
      }

      return result;

    } catch (error) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async addBulkComments(tasks, commentTemplate) {
    const results = {
      successful: [],
      failed: [],
      total: tasks.length
    };

    for (const task of tasks) {
      try {
        console.log(`Adding comment to task: ${task.content} (${task.id})`);
        
        const commentResult = await this.createComment({
          task_id: task.id,
          content: commentTemplate
        });

        if (commentResult.success) {
          results.successful.push({
            taskId: task.id,
            taskTitle: task.content,
            commentId: commentResult.comment.id
          });
        } else {
          results.failed.push({
            taskId: task.id,
            taskTitle: task.content,
            error: commentResult.error
          });
        }

        // Rate limiting - wait between requests
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.failed.push({
          taskId: task.id,
          taskTitle: task.content,
          error: error.message
        });
      }
    }

    return {
      success: true,
      results: results,
      summary: `Added comments to ${results.successful.length}/${results.total} tasks`
    };
  }

  // === UTILITY METHODS ===

  async findProjectByName(projectName) {
    const result = await this.getProjects();
    if (!result.success) return result;

    const project = result.projects.find(p => 
      p.name.toLowerCase() === projectName.toLowerCase()
    );

    if (project) {
      return {
        success: true,
        project: project
      };
    } else {
      return {
        success: false,
        error: `Project "${projectName}" not found`
      };
    }
  }

  async findLabelByName(labelName) {
    const result = await this.getLabels();
    if (!result.success) return result;

    const label = result.labels.find(l => 
      l.name.toLowerCase() === labelName.toLowerCase()
    );

    if (label) {
      return {
        success: true,
        label: label
      };
    } else {
      return {
        success: false,
        error: `Label "${labelName}" not found`
      };
    }
  }

  formatDueDate(dateString) {
    // Todoist accepts dates in YYYY-MM-DD format or natural language
    if (!dateString) return null;
    
    // If it's already in the correct format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // Try to parse and format the date
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString; // Return original if invalid
      
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch (error) {
      return dateString; // Return original if parsing fails
    }
  }

  // Helper method to build task data with proper formatting
  buildTaskData(params) {
    const taskData = {};
    
    if (params.content) taskData.content = params.content;
    if (params.description) taskData.description = params.description;
    if (params.project_id) taskData.project_id = params.project_id;
    if (params.section_id) taskData.section_id = params.section_id;
    if (params.parent_id) taskData.parent_id = params.parent_id;
    if (params.order) taskData.order = params.order;
    if (params.priority) taskData.priority = Math.min(Math.max(params.priority, 1), 4); // 1-4 range
    if (params.due_string) taskData.due_string = params.due_string;
    if (params.due_date) taskData.due_date = this.formatDueDate(params.due_date);
    if (params.due_datetime) taskData.due_datetime = params.due_datetime;
    if (params.due_lang) taskData.due_lang = params.due_lang;
    if (params.assignee_id) taskData.assignee_id = params.assignee_id;
    
    // Handle labels (array of label names or IDs)
    if (params.labels && Array.isArray(params.labels)) {
      taskData.labels = params.labels;
    }

    return taskData;
  }
}

module.exports = TodoistHandler;