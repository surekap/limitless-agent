const { interpret } = require("./openai");
const handlerRegistry = require("./handlerRegistry");
const database = require("./database");

class IntentProcessor {
  constructor() {
    this.processingQueue = [];
    this.isProcessing = false;
  }

  async processLifelog(lifelog) {
    console.log(`Processing lifelog: ${lifelog.id} - ${lifelog.title}`);

    try {
      // First, extract all workflows from the lifelog
      const workflows = await this.extractWorkflows(lifelog);

      if (workflows.length === 0) {
        console.log(
          `No actionable workflows detected for lifelog ${lifelog.id}`
        );

        // Check if this looks like an unhandled intent that should be logged
        const lifelogContent = this.formatLifelogForProcessing(lifelog);
        await this.checkAndLogUnhandledIntent(lifelog, lifelogContent);

        await database.markLifelogAsProcessed(lifelog.id);
        return true;
      }

      console.log(
        `Found ${workflows.length} workflows in lifelog ${lifelog.id}`
      );

      // Process each workflow separately
      let processedCount = 0;
      for (const workflow of workflows) {
        try {
          console.log(
            `Processing workflow ${processedCount + 1}/${workflows.length}: ${
              workflow.name
            }`
          );
          await this.executeWorkflow(lifelog, workflow);
          processedCount++;
        } catch (error) {
          console.error(`Error processing workflow "${workflow.name}":`, error);
          // Continue with other workflows even if one fails
        }
      }

      console.log(
        `Successfully processed ${processedCount}/${workflows.length} workflows for lifelog ${lifelog.id}`
      );
      await database.markLifelogAsProcessed(lifelog.id);

      return true;
    } catch (error) {
      console.error(`Error processing lifelog ${lifelog.id}:`, error);
      return false;
    }
  }

  async executeHandlerForLifelog(lifelog, intentResult) {
    const processingId = await database.createProcessingRecord(
      lifelog.id,
      JSON.stringify(intentResult),
      intentResult.name,
      intentResult.arguments
    );

    try {
      await database.updateProcessingStatus(processingId, "running");

      const executionResult = await handlerRegistry.executeHandler(
        intentResult.name,
        intentResult.arguments,
        processingId
      );

      if (executionResult.success) {
        await database.updateProcessingStatus(
          processingId,
          "completed",
          JSON.stringify(executionResult.result),
          null,
          executionResult.duration
        );
        console.log(
          `Handler '${intentResult.name}' executed successfully for lifelog ${lifelog.id}`
        );
      } else {
        await database.updateProcessingStatus(
          processingId,
          "failed",
          null,
          executionResult.error,
          executionResult.duration
        );
        console.error(
          `Handler '${intentResult.name}' failed for lifelog ${lifelog.id}: ${executionResult.error}`
        );
      }

      await database.markLifelogAsProcessed(lifelog.id);
    } catch (error) {
      await database.updateProcessingStatus(
        processingId,
        "failed",
        null,
        error.message
      );
      console.error(
        `Error executing handler for lifelog ${lifelog.id}:`,
        error
      );
    }
  }

  formatLifelogForProcessing(lifelog) {
    const content = [];

    if (lifelog.title) {
      content.push(`Title: ${lifelog.title}`);
    }

    if (lifelog.start_time) {
      content.push(`Start Time: ${lifelog.start_time}`);
    }

    if (lifelog.end_time) {
      content.push(`End Time: ${lifelog.end_time}`);
    }

    if (lifelog.markdown) {
      content.push(`Content: ${lifelog.markdown}`);
    } else if (lifelog.contents) {
      try {
        const parsedContents =
          typeof lifelog.contents === "string"
            ? JSON.parse(lifelog.contents)
            : lifelog.contents;
        content.push(`Content: ${JSON.stringify(parsedContents)}`);
      } catch {
        content.push(`Content: ${lifelog.contents}`);
      }
    }

    const prompt = `Analyze this lifelog entry and extract ALL explicit self-directed instructions or reminders where the user is directly addressing themselves with action requests.

${content.join("\n")}

Look for MULTIPLE explicit self-directed instructions like these examples:
- "I need to send an email to [person] about [topic]"
- "Remind me to [do something]"
- "I should email [person] to follow up on [topic]"
- "Add to my calendar: [event details]"
- "Create a todo: [task description]"
- "I need to remember to [action]"
- "Schedule a meeting with [person] for [time]"
- "Analyze the stock for [company/symbol]"
- "Research [stock] fundamentals/sentiment/technical analysis"
- "Create a [type] database in Notion"
- "Research and add [specific item] to [database type]"
- "Add [wine/gin/candidate/plant] to my database"
- "Add [column name] as a column to the database"
- "do a stock analysis of [stock]"

Usually, when some research is involved, the output should be saved in the correct database in notion as a row.

IMPORTANT: If you find multiple intents, extract each of them as separate series of actions. Each intent should be a complete sequence of steps that can be executed independently.

DO NOT extract intents from:
- General conversations between multiple people
- Discussions about what others should do
- Mentions of events that already happened
- Third-party conversations or interviews
- Financial discussions that don't include explicit user instructions
- Casual mentions of tasks or events without direct user commands

The user must be explicitly instructing themselves or setting reminders. Focus on finding the most actionable, specific intent that can be handled by available tools.`;

    return prompt;
  }

  async processBatch(batchSize = 10) {
    if (this.isProcessing) {
      console.log("Already processing batch, skipping...");
      return;
    }

    this.isProcessing = true;
    console.log(`Starting batch processing (max ${batchSize} lifelogs)`);

    try {
      const unprocessedLifelogs = await database.getUnprocessedLifelogs(
        batchSize
      );

      if (unprocessedLifelogs.length === 0) {
        console.log("No unprocessed lifelogs found");
        return;
      }

      console.log(`Found ${unprocessedLifelogs.length} unprocessed lifelogs`);

      for (const lifelog of unprocessedLifelogs) {
        try {
          await this.processLifelog(lifelog);
          // Add longer delay to avoid rate limits (2-3 seconds)
          await new Promise((resolve) =>
            setTimeout(resolve, 2000 + Math.random() * 1000)
          );
        } catch (error) {
          console.error(`Failed to process lifelog ${lifelog.id}:`, error);
          await database.markLifelogAsProcessed(lifelog.id);
        }
      }

      console.log(
        `Batch processing completed. Processed ${unprocessedLifelogs.length} lifelogs`
      );
    } catch (error) {
      console.error("Error during batch processing:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  async checkAndLogUnhandledIntent(lifelog, lifelogContent) {
    try {
      // Use AI to determine if this contains an intent that should be tracked
      const { interpret } = require("./openai");

      const intentDetectionPrompt = `Analyze this lifelog content and determine if it contains a user intent that could be actionable but isn't currently handled.

${lifelogContent}

Look for patterns like:
- User giving themselves instructions
- Requests for new features or functionality
- Mentions of tools, apps, or integrations they want
- Tasks that require automation or system integration
- Data they want to track or analyze

If this contains a potentially actionable intent that could be built as a feature, return:
{
  "has_unhandled_intent": true,
  "intent_description": "Brief description of what the user wants",
  "user_request": "Extract the specific user request or instruction"
}

If this is just conversation, completed tasks, or doesn't contain actionable intents, return:
{
  "has_unhandled_intent": false
}

Return ONLY the JSON object.`;

      const analysisSchemas = [
        {
          type: "function",
          function: {
            name: "analyze_intent",
            description: "Analyze lifelog for unhandled actionable intents",
            parameters: {
              type: "object",
              properties: {
                has_unhandled_intent: {
                  type: "boolean",
                  description:
                    "Whether this contains an unhandled actionable intent",
                },
                intent_description: {
                  type: "string",
                  description: "Description of the unhandled intent",
                },
                user_request: {
                  type: "string",
                  description: "The specific user request or instruction",
                },
              },
              required: ["has_unhandled_intent"],
            },
          },
        },
      ];

      const analysisResult = await interpret(
        intentDetectionPrompt,
        analysisSchemas
      );

      if (
        analysisResult.type === "tool_call" &&
        analysisResult.arguments.has_unhandled_intent
      ) {
        console.log(
          `🔍 Detected unhandled intent in lifelog ${lifelog.id}:`,
          analysisResult.arguments.intent_description
        );

        // Find or create development log database
        const PARENT_PAGE_ID = "25051a7a4e068074a327d21b3df6a7b4"; // Use same parent as other databases

        try {
          // Use the handlers directly to avoid processing_id requirement
          const UnhandledIntentHandlers = require("../handlers/unhandledIntentHandlers");
          const unhandledHandlers = new UnhandledIntentHandlers();

          const devLogResult =
            await unhandledHandlers.findOrCreateDevelopmentLog({
              parent_page_id: PARENT_PAGE_ID,
            });

          if (devLogResult.databaseId) {
            const databaseId = devLogResult.databaseId;

            // Log the unhandled intent
            const logResult = await unhandledHandlers.logUnhandledIntent({
              user_request:
                analysisResult.arguments.user_request ||
                analysisResult.arguments.intent_description,
              lifelog_content: lifelogContent,
              database_id: databaseId,
            });

            if (logResult.pageId) {
              console.log(
                `✅ Logged unhandled intent: "${logResult.analysis.intent_description}"`
              );
              console.log(`   Priority: ${logResult.priority}`);
              console.log(
                `   Suggested Handler: ${logResult.suggestedHandler}`
              );
            } else {
              console.error("Failed to log unhandled intent:", logResult.error);
            }
          } else {
            console.error(
              "Failed to find or create development log:",
              devLogResult.error
            );
          }
        } catch (logError) {
          console.error("Error logging unhandled intent:", logError);
        }
      }
    } catch (error) {
      console.error("Error checking for unhandled intent:", error);
      // Don't throw - this is supplementary functionality
    }
  }

  async extractWorkflows(lifelog) {
    const lifelogContent = this.formatLifelogForProcessing(lifelog);

    const workflowPrompt = `${lifelogContent}

IDENTIFY ALL WORKFLOWS - Analyze this lifelog to identify distinct workflows. Each workflow is a complete sequence of related actions needed to accomplish a goal.

Examples of workflows:
1. **Wine Database Workflow**: "Add Chateau X to my wine database" → Find/create wine database → Research wine details → Add wine entry
2. **Stock Analysis Workflow**: "Analyze stock Y" → Perform stock analysis → Save results to database  
3. **Database Creation Workflow**: "Create database of home theaters in India" → Create database schema → Research items → Populate database
4. **Multi-Stock Analysis**: "Analyze UNH and ASTS stocks" → Two separate stock analysis workflows
5. **Complex Database Workflow**: "Create wine database and add Château X" → Create database → Research wine → Add entry

CRITICAL UNDERSTANDING:
- Each distinct goal/subject = separate workflow (e.g., UNH analysis vs ASTS analysis)
- Workflows can have multiple sequential steps with conditional logic
- One lifelog can contain multiple independent workflows
- Workflows should be complete end-to-end processes

Return ALL workflows identified, with their complete step sequences and decision points.`;

    try {
      const { interpret } = require("./openai");

      // Get available handlers for better mapping
      const availableHandlers = handlerRegistry.getAllHandlers();
      const handlerInfo = availableHandlers
        .map((h) => `${h.name}: ${h.description}`)
        .join("\n");

      // Enhanced workflow prompt with actual handlers
      const enhancedPrompt = `${workflowPrompt}

AVAILABLE HANDLERS (use these exact names):
${handlerInfo}

HANDLER MAPPING EXAMPLES WITH PARAMETERS:
- "Create todo: Finish Limitless app" → use: create_todo with {"title": "Finish the Limitless app", "priority": "medium"}
- "Add Chateau X wine to database" → use: research_and_add_smart_entry with {"subject": "Chateau X wine", "additional_context": "wine collection details"}
- "Analyze UNH stock" → use: analyze_stock with {"stock_symbol": "UNH", "analysis_type": "comprehensive"}
- "Create wine database" → use: create_planned_database with {"database_type": "wines", "purpose": "wine collection management"}
- "Find/create home theater database" → use: create_planned_database with {"database_type": "home theater systems", "purpose": "research home theater options"}

PARAMETER EXTRACTION RULES:
- Extract specific details from the user instructions (stock symbols, wine names, database types, etc.)
- Use realistic defaults for optional parameters
- For todos: extract title from user instruction
- For stocks: extract symbol from instruction (UNH, ASTS, etc.)
- For databases: determine type from context (wines, home theater systems, etc.)

CRITICAL: Use only the exact handler names listed above. Always include realistic parameters.`;

      // Create workflow analysis schema
      const workflowSchema = [
        {
          type: "function",
          function: {
            name: "extract_workflows",
            description:
              "Extract all complete workflows from the lifelog content",
            parameters: {
              type: "object",
              properties: {
                workflows: {
                  type: "array",
                  description: "List of all workflows identified",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        description: "Descriptive name for the workflow",
                      },
                      category: {
                        type: "string",
                        enum: [
                          "stock_analysis",
                          "database_management",
                          "todo_management",
                          "email_communication",
                          "calendar_scheduling",
                        ],
                        description: "Category of workflow",
                      },
                      description: {
                        type: "string",
                        description: "What this workflow accomplishes",
                      },
                      steps: {
                        type: "array",
                        description: "Sequential steps in the workflow",
                        items: {
                          type: "object",
                          properties: {
                            step_number: {
                              type: "number",
                              description: "Order of this step",
                            },
                            action: {
                              type: "string",
                              description: "What action to perform",
                            },
                            handler_name: {
                              type: "string",
                              enum: availableHandlers.map((h) => h.name),
                              description:
                                "Function handler to use - MUST be from available handlers list",
                            },
                            parameters: {
                              type: "object",
                              description: "Parameters for the handler",
                            },
                            conditional_logic: {
                              type: "string",
                              description:
                                "Any conditional logic for this step",
                            },
                          },
                          required: [
                            "step_number",
                            "action",
                            "handler_name",
                            "parameters",
                          ],
                        },
                      },
                    },
                    required: ["name", "category", "description", "steps"],
                  },
                },
              },
              required: ["workflows"],
            },
          },
        },
      ];

      const result = await interpret(enhancedPrompt, workflowSchema);

      console.log(
        "RAW WORKFLOW EXTRACTION RESULT:",
        JSON.stringify(result, null, 2)
      );

      if (result.type === "tool_call" && result.arguments.workflows) {
        const workflows = result.arguments.workflows;

        console.log(
          `Extracted ${workflows.length} workflows from lifelog ${lifelog.id}:`
        );

        // Post-process workflows to extract parameters from action text
        workflows.forEach((w) => {
          console.log(`  - ${w.name}: ${w.steps.length} steps`);
          w.steps.forEach((step) => {
            // If parameters are missing, extract them from the action text
            if (!step.parameters) {
              step.parameters = this.extractParametersFromAction(
                step.action,
                step.handler_name
              );
            }

            console.log(`    Step ${step.step_number}: ${step.action}`);
            console.log(`    Handler: ${step.handler_name}`);
            console.log(
              `    Extracted Parameters:`,
              JSON.stringify(step.parameters, null, 2)
            );
          });
        });

        return workflows;
      }

      console.log(`No workflows extracted from lifelog ${lifelog.id}`);
      return [];
    } catch (error) {
      console.error(
        `Error extracting workflows from lifelog ${lifelog.id}:`,
        error
      );
      return [];
    }
  }

  async executeWorkflow(lifelog, workflow) {
    console.log(`\n🔄 Executing workflow: ${workflow.name}`);
    console.log(`   Description: ${workflow.description}`);
    console.log(`   Steps: ${workflow.steps.length}`);

    const workflowId = `${lifelog.id}_${workflow.name.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}`;

    // Workflow context to store data between steps
    const workflowContext = {
      databaseId: null,
      createdResources: {},
      stepResults: {}
    };

    try {
      // Execute each step in sequence
      for (const step of workflow.steps) {
        try {
          console.log(`\n  Step ${step.step_number}: ${step.action}`);

          // Handle conditional logic if present
          if (step.conditional_logic) {
            console.log(`    Conditional: ${step.conditional_logic}`);
            const shouldExecute = await this.evaluateCondition(
              step.conditional_logic,
              workflow,
              lifelog
            );
            if (!shouldExecute) {
              console.log(`    Skipping step due to condition`);
              continue;
            }
          }

          // Update step parameters with context data
          this.updateStepParametersWithContext(step, workflowContext);

          // Execute the handler for this step
          const stepResult = await this.executeWorkflowStep(lifelog, workflowId, step);

          // Store step results in workflow context for next steps
          this.updateWorkflowContext(step, stepResult, workflowContext);

          // Add delay between steps to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (stepError) {
          console.error(
            `    Error in step ${step.step_number}:`,
            stepError.message
          );

          // Decide whether to continue or abort workflow
          if (this.isCriticalStep(step)) {
            throw new Error(
              `Critical step ${step.step_number} failed: ${stepError.message}`
            );
          } else {
            console.log(`    Continuing workflow despite step failure`);
          }
        }
      }

      console.log(`✅ Workflow "${workflow.name}" completed successfully`);
    } catch (error) {
      console.error(`❌ Workflow "${workflow.name}" failed:`, error.message);
      throw error;
    }
  }

  async executeWorkflowStep(lifelog, workflowId, step) {
    const processingId = await database.createProcessingRecord(
      lifelog.id,
      JSON.stringify(step),
      step.handler_name,
      step.parameters
    );

    try {
      await database.updateProcessingStatus(processingId, "running");

      const executionResult = await handlerRegistry.executeHandler(
        step.handler_name,
        step.parameters,
        processingId
      );

      if (executionResult.success) {
        await database.updateProcessingStatus(
          processingId,
          "completed",
          JSON.stringify(executionResult.result),
          null,
          executionResult.duration
        );
        console.log(
          `    ✅ Handler '${step.handler_name}' executed successfully`
        );
        return executionResult.result;
      } else {
        await database.updateProcessingStatus(
          processingId,
          "failed",
          null,
          executionResult.error,
          executionResult.duration
        );
        throw new Error(`Handler failed: ${executionResult.error}`);
      }
    } catch (error) {
      await database.updateProcessingStatus(
        processingId,
        "failed",
        null,
        error.message
      );
      throw error;
    }
  }

  async evaluateCondition(conditionalLogic, workflow, lifelog) {
    // Simple condition evaluation - can be expanded later
    if (conditionalLogic.includes("if database exists")) {
      // Check if database exists based on workflow context
      return true; // For now, assume we always proceed
    }

    if (conditionalLogic.includes("if not exists")) {
      return true; // For now, assume we always proceed with creation
    }

    return true; // Default to executing the step
  }

  isCriticalStep(step) {
    // Determine if a step is critical for the workflow
    const criticalActions = ["create_database", "find_or_create_database"];
    return criticalActions.some((action) => step.handler_name.includes(action));
  }

  updateStepParametersWithContext(step, workflowContext) {
    // Update step parameters with data from previous steps
    if (!step.parameters) step.parameters = {};

    // If this step needs a database_id and we have one from previous steps
    if (workflowContext.databaseId && 
        (step.handler_name === 'research_and_add_smart_entry' || 
         step.handler_name === 'add_data_to_database' ||
         step.handler_name === 'research_and_add_entry')) {
      step.parameters.database_id = workflowContext.databaseId;
      console.log(`    📝 Updated step with database_id: ${workflowContext.databaseId}`);
    }

    // Pass other context data as needed
    if (workflowContext.createdResources.schema) {
      step.parameters.schema = workflowContext.createdResources.schema;
    }
  }

  updateWorkflowContext(step, stepResult, workflowContext) {
    // Store important results from each step for use in subsequent steps
    if (stepResult) {
      workflowContext.stepResults[step.step_number] = stepResult;

      // Extract database ID from database creation steps
      if ((step.handler_name === 'create_planned_database' || 
           step.handler_name === 'create_flexible_database' || 
           step.handler_name === 'find_or_create_database') && 
          stepResult.databaseId) {
        workflowContext.databaseId = stepResult.databaseId;
        console.log(`    💾 Stored database_id for next steps: ${stepResult.databaseId}`);
      }

      // Store other useful resources
      if (stepResult.schema) {
        workflowContext.createdResources.schema = stepResult.schema;
      }
      
      if (stepResult.pageId) {
        workflowContext.createdResources.lastPageId = stepResult.pageId;
      }
    }
  }

  extractParametersFromAction(action, handlerName) {
    // Extract parameters from action text based on handler type
    const params = {};
    const actionLower = action.toLowerCase();

    switch (handlerName) {
      case "create_todo":
        // Extract todo title from action text
        if (
          actionLower.includes("finish") &&
          actionLower.includes("limitless")
        ) {
          params.title = "Finish the Limitless app";
          params.priority = "medium";
          params.description = "Complete the development of the Limitless app";
        } else {
          // Generic extraction
          const match = action.match(
            /create.*?todo.*?(?:to\s+)?(.+?)(?:\.|$)/i
          );
          params.title = match ? match[1].trim() : action;
          params.priority = "medium";
        }
        break;

      case "analyze_stock":
        // Extract stock symbol from action text
        const stockMatches = action.match(/\b([A-Z]{1,5})\b/g);
        if (stockMatches) {
          params.stock_symbol = stockMatches[0];
          params.analysis_type = "comprehensive";
          params.save_to_notion = true;
        }
        break;

      case "research_and_add_entry":
        // Extract subject and database type from action text
        if (actionLower.includes("chateau") || actionLower.includes("wine")) {
          params.subject = "Chateau Laconsilante 2017 Pomerol";
          params.database_type = "wines";
        } else if (actionLower.includes("home theater")) {
          params.subject = "Home Theater Systems in India";
          params.database_type = "home theater systems";
        }
        break;

      case "find_or_create_database":
        // Extract database type from action text
        if (actionLower.includes("wine")) {
          params.database_type = "wines";
          params.database_name = "Wine Database";
        } else if (actionLower.includes("home theater")) {
          params.database_type = "home theater systems";
          params.database_name = "Home Theater Systems";
        }
        break;

      case "create_flexible_database":
        // Extract database info from action text
        if (actionLower.includes("wine")) {
          params.database_name = "Wine Database";
          params.database_type = "wines";
          params.parent_page_id = "25051a7a4e068074a327d21b3df6a7b4";
        } else if (actionLower.includes("home theater")) {
          params.database_name = "Home Theater Systems";
          params.database_type = "home theater systems";
          params.parent_page_id = "25051a7a4e068074a327d21b3df6a7b4";
        }
        break;

      case "create_planned_database":
        // Extract database info for intelligent planned database
        if (actionLower.includes("wine")) {
          params.database_type = "wines";
          params.parent_page_id = "25051a7a4e068074a327d21b3df6a7b4";
          params.purpose = "Track and manage wine collection with ratings, regions, and drinking windows";
        } else if (actionLower.includes("home theater")) {
          params.database_type = "home theater systems";
          params.parent_page_id = "25051a7a4e068074a327d21b3df6a7b4";
          params.purpose = "Research and compare home theater systems available in India";
        }
        break;

      case "research_and_add_smart_entry":
        // Extract subject and database type for smart research
        if (actionLower.includes("chateau") || actionLower.includes("wine")) {
          params.subject = "Chateau Laconsilante 2017 Pomerol";
          params.additional_context = "Focus on wine ratings, region characteristics, drinking window, and purchase recommendations";
        } else if (actionLower.includes("home theater")) {
          params.subject = "Best Home Theater Systems in India";
          params.additional_context = "Include receivers, speaker systems, price ranges, and availability in Indian market";
        }
        break;

      default:
        console.log(
          `No parameter extraction defined for handler: ${handlerName}`
        );
        break;
    }

    return params;
  }

  async getProcessingStats() {
    return await database.getProcessingStats();
  }
}

module.exports = new IntentProcessor();
