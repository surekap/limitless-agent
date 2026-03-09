const database = require('./database');

class HandlerRegistry {
  constructor() {
    this.handlers = new Map();
    this.loadHandlersFromDatabase();
  }

  async loadHandlersFromDatabase() {
    try {
      const dbHandlers = await database.getRegisteredHandlers();
      for (const handler of dbHandlers) {
        let schema;
        try {
          schema = typeof handler.function_schema === 'string' 
            ? JSON.parse(handler.function_schema) 
            : handler.function_schema;
        } catch (error) {
          console.error(`Error parsing schema for handler ${handler.name}:`, error);
          continue;
        }
        
        this.handlers.set(handler.name, {
          name: handler.name,
          description: handler.description,
          schema: schema,
          execute: this.getHandlerImplementation(handler.name)
        });
      }
      console.log(`Loaded ${this.handlers.size} handlers from database`);
    } catch (error) {
      console.error('Error loading handlers from database:', error);
    }
  }

  async registerHandler(name, description, schema, implementation) {
    try {
      await database.registerHandler(name, description, schema);
      
      this.handlers.set(name, {
        name,
        description,
        schema,
        execute: implementation
      });
      
      console.log(`Handler '${name}' registered successfully`);
      return true;
    } catch (error) {
      console.error(`Error registering handler '${name}':`, error);
      return false;
    }
  }

  getHandler(name) {
    return this.handlers.get(name);
  }

  getAllHandlers() {
    return Array.from(this.handlers.values());
  }

  getHandlerSchemas() {
    return this.getAllHandlers().map(handler => ({
      type: "function",
      function: {
        name: handler.name,
        description: handler.description,
        parameters: handler.schema
      }
    }));
  }

  async executeHandler(name, args, processingId) {
    const handler = this.getHandler(name);
    if (!handler) {
      throw new Error(`Handler '${name}' not found`);
    }

    const startTime = Date.now();
    
    try {
      await database.logHandlerExecution(processingId, 'info', `Starting execution of handler '${name}'`, { args });
      
      const result = await handler.execute(args);
      const duration = Date.now() - startTime;
      
      await database.logHandlerExecution(processingId, 'info', `Handler '${name}' completed successfully`, { result, duration });
      
      return {
        success: true,
        result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      await database.logHandlerExecution(processingId, 'error', `Handler '${name}' failed: ${error.message}`, { error: error.stack, duration });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  }

  getHandlerImplementation(name) {
    const TodoistHandlers = require('../handlers/todoistHandlers');
    const StockAnalysisHandlers = require('../handlers/stockAnalysisHandlers');
    const FlexibleDatabaseHandlers = require('../handlers/flexibleDatabaseHandlers');
    const UnhandledIntentHandlers = require('../handlers/unhandledIntentHandlers');
    const EnhancedDatabaseHandlers = require('../handlers/enhancedDatabaseHandlers');
    const todoistHandlers = new TodoistHandlers();
    const stockHandlers = new StockAnalysisHandlers();
    const databaseHandlers = new FlexibleDatabaseHandlers();
    const unhandledIntentHandlers = new UnhandledIntentHandlers();
    const enhancedDbHandlers = new EnhancedDatabaseHandlers();

    const implementations = {
      // Primary handlers - one per use case
      create_todo: todoistHandlers.createTodoistTask.bind(todoistHandlers),
      complete_todo: todoistHandlers.completeTodoistTask.bind(todoistHandlers),
      update_todo: todoistHandlers.updateTodoistTask.bind(todoistHandlers),
      get_todos: todoistHandlers.getTodoistTasks.bind(todoistHandlers),
      
      // Advanced todo workflow handlers
      manage_stale_todos: todoistHandlers.manageStaleTodos.bind(todoistHandlers),
      add_todo_comment: todoistHandlers.addTodoComment.bind(todoistHandlers),
      bulk_update_todos: todoistHandlers.bulkUpdateTodos.bind(todoistHandlers),
      
      // Stock analysis handlers
      analyze_stock: stockHandlers.analyzeStock.bind(stockHandlers),
      research_stock: stockHandlers.researchStock.bind(stockHandlers),
      create_stock_database: stockHandlers.createStockDatabase.bind(stockHandlers),
      save_analysis_to_notion: stockHandlers.saveAnalysisToNotion.bind(stockHandlers),
      
      // Flexible database handlers (legacy)
      create_flexible_database: databaseHandlers.createFlexibleDatabase.bind(databaseHandlers),
      research_and_add_entry: databaseHandlers.researchAndAddEntry.bind(databaseHandlers),
      find_or_create_database: databaseHandlers.findOrCreateDatabase.bind(databaseHandlers),
      add_column_to_database: databaseHandlers.addColumnToDatabase.bind(databaseHandlers),
      update_database_schema: databaseHandlers.updateDatabaseSchema.bind(databaseHandlers),
      
      // Enhanced database handlers with intelligent planning and structured data
      create_planned_database: enhancedDbHandlers.createPlannedDatabase.bind(enhancedDbHandlers),
      research_and_add_smart_entry: enhancedDbHandlers.researchAndAddSmartEntry.bind(enhancedDbHandlers),
      add_data_to_database: enhancedDbHandlers.addDataToDatabase.bind(enhancedDbHandlers),
      get_database_info: enhancedDbHandlers.getDatabaseInfo.bind(enhancedDbHandlers),
      
      // Unhandled intent tracking handlers
      create_development_log_database: unhandledIntentHandlers.createDevelopmentLogDatabase.bind(unhandledIntentHandlers),
      log_unhandled_intent: unhandledIntentHandlers.logUnhandledIntent.bind(unhandledIntentHandlers),
      find_or_create_development_log: unhandledIntentHandlers.findOrCreateDevelopmentLog.bind(unhandledIntentHandlers),
      
      // Email handler (placeholder for future implementation)
      send_email: this.sendEmail.bind(this),
      
      // Calendar handler (placeholder for future implementation)  
      create_calendar_event: this.createGoogleCalendarEvent.bind(this),
      
      // Other specific handlers (placeholders for future implementation)
      send_message: this.sendSlackMessage.bind(this),
      add_note: this.addNotionNote.bind(this),
      create_task: this.createClickUpTask.bind(this)
    };

    return implementations[name] || this.defaultHandler.bind(this);
  }

  // Placeholder implementations for future integrations
  async sendEmail(args) {
    console.log('Email handler not yet implemented. Args:', args);
    return { message: 'Email handler needs implementation (Gmail/Outlook integration)', args };
  }

  async createGoogleCalendarEvent(args) {
    console.log('Calendar handler not yet implemented. Args:', args);
    return { message: 'Calendar handler needs implementation (Google Calendar integration)', args };
  }

  async sendSlackMessage(args) {
    console.log('Message handler not yet implemented. Args:', args);
    return { message: 'Message handler needs implementation (Slack/Teams integration)', args };
  }

  async addNotionNote(args) {
    console.log('Note handler not yet implemented. Args:', args);
    return { message: 'Note handler needs implementation (Notion/Obsidian integration)', args };
  }

  async createClickUpTask(args) {
    console.log('Task handler not yet implemented. Args:', args);
    return { message: 'Task handler needs implementation (ClickUp/Asana integration)', args };
  }

  async defaultHandler(args) {
    console.log('Default handler called with args:', args);
    return { message: 'Handler executed (default implementation)', args };
  }
}

module.exports = new HandlerRegistry();