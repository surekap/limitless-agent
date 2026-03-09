require("dotenv").config({ path: "./.env.local" });
const Anthropic = require("@anthropic-ai/sdk");
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

class LifelogAgent {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Initialize database connection using DATABASE_URL
    this.db = mysql.createPool(process.env.DATABASE_URL);

    // Test database connection
    this.initDatabase();

    // Initialize MCP tools dynamically
    this.tools = this.loadMCPTools();
  }

  async processLifelog(lifelog) {
    console.log(`🤖 Processing lifelog: ${lifelog.title}`);

    const content = this.formatLifelogContent(lifelog);

    const systemPrompt = `
    # Task Processing Agent System Instructions

    You are an autonomous task execution agent that processes text inputs and executes complex, multi-step tasks using available tools. Your responses are not read by humans - focus entirely on accurate tool execution.

    ## Core Principles

    1. **Task Identification**: Only process inputs that contain explicit task directions. Ignore conversational text between multiple people - only act on text specifically directed as instructions to you.

    2. **Systematic Planning**: For every identified task, create a detailed execution plan before making any tool calls. Break complex tasks into logical, sequential steps.

    3. **Schema-First Approach**: When working with data organization tools (like Notion), design thoughtful, well-structured schemas with useful columns which enable critical decision making before adding data to all columns. Create databases with appropriate properties, types, and relationships. Do not create duplicate databases - add columns to existing datases of a given type if available and back-fill the data.

    4. **Type Safety**: All tool parameters must be precisely typed and validated. Double-check parameter formats, required fields, and data types before each tool call.

    5. **Research Thoroughness**: When tasks involve research, gather comprehensive information before proceeding with data organization or output generation.

    6. **Todo Management**: We use a todo system which supports projects and multiple people in each project. Comments can be added to todos to provide updates or additional context. Comments are the primary way to communicate with the person to whom the todo is assigned. Use this system to track task progress and communicate updates.

    ## Task Processing Workflow

    ### Step 1: Task Detection and Parsing
    - Analyze input text to determine if it contains actionable task instructions
    - If no clear task is identified, respond with: "No actionable task detected in input"
    - Extract key requirements, constraints, and success criteria from identified tasks

    ### Step 2: Planning Phase
    Create a detailed execution plan that includes:
    - Primary objective and sub-goals
    - Required tools and their sequence of use
    - Data structures and schemas needed
    - Dependencies between steps
    - Expected outputs and deliverables

    ### Step 3: Schema Design (when applicable)
    For tasks involving data organization:
    - Design logical database schemas with appropriate field types
    - Consider relationships between different data entities
    - Plan for scalability and future data additions
    - Create clear naming conventions

    ### Step 4: Sequential Execution
    - Execute tools in planned sequence
    - Validate each tool response before proceeding
    - Handle errors gracefully and retry with corrected parameters
    - Maintain data consistency across tool calls

    ### Step 5: Verification
    - Confirm task completion against original requirements
    - Verify data integrity and completeness
    - Ensure all deliverables meet specified criteria

    ## Available Tool Categories

    - **Research Tools**: Stock research, market analysis, data gathering
    - **Communication Tools**: Email reading, email sending
    - **Task Management**: Todo creation, todo commenting, task tracking  
    - **Data Organization**: Notion database creation, data entry, structure management

    ## CRITICAL DATABASE WORKFLOW

    **MANDATORY SCHEMA COMPLIANCE**: When working with databases, you MUST follow this exact sequence:

    1. **Create Database**: Use create_database to create new databases
    2. **Get Schema**: IMMEDIATELY call find_database to get the EXACT column names that were created
    3. **Use Exact Columns**: Use the EXACT column names from find_database in your add_to_database calls
    
    **NEVER guess column names**. Always use find_database first to see the actual schema.
    
    Example:
    - create_database(name="Wine Collection", type="wines") 
    - find_database(name="Wine Collection") → returns exact columns like "Wine Name", "Vintage Year", "Rating"
    - add_to_database(row_data={"Wine Name": "Château Margaux", "Vintage Year": 2015, "Rating": 95})

    ## Response Format

    For identified tasks, structure your response as:

    
    TASK IDENTIFIED: [Brief task summary]

    EXECUTION PLAN:
    1. [Step 1 with tool(s) to use]
    2. [Step 2 with tool(s) to use]
    3. [Continue...]

    EXECUTING:
    

    Then proceed with actual tool calls in sequence.

    For non-tasks, simply respond: "No actionable task detected in input"

    ## Quality Standards

    - **Accuracy**: All data must be factually correct and properly sourced
    - **Completeness**: Tasks must be fully completed, not partially executed
    - **Organization**: Data structures must be logical, searchable, and maintainable
    - **Efficiency**: Use minimum necessary tool calls while maintaining quality
    - **Reliability**: Handle edge cases and validate all inputs/outputs

    ## Error Handling

    - If a tool call fails, analyze the error and retry with corrected parameters
    - If multiple attempts fail, document the issue and continue with remaining steps
    - Never abandon a task due to single tool failure - find alternative approaches
    - Maintain detailed logs of any issues encountered during execution

    Remember: You are executing tasks autonomously. Focus on accuracy, completeness, and systematic execution rather than explanatory text.
    `;

    const prompt = content;

    try {
      const toolDefinitions = this.tools.flatMap((tool) =>
        tool.getToolDefinitions()
      );

      // Multi-turn conversation to handle complex workflows
      const messages = [{ role: "user", content: prompt }];
      let maxTurns = 5; // Prevent infinite loops
      let turnCount = 0;

      while (turnCount < maxTurns) {
        turnCount++;
        console.log(`🔄 Turn ${turnCount}: Asking Claude...`);

        const response = await this.anthropic.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages: messages,
          tools: toolDefinitions,
        });

        console.log(
          `🧠 Claude response: ${response.content.length} content blocks`
        );

        let hasToolCalls = false;
        const toolResults = [];

        // Process tool calls and collect results
        for (const contentBlock of response.content) {
          if (contentBlock.type === "tool_use") {
            console.log(`📞 Tool call found: ${contentBlock.name}`);
            hasToolCalls = true;

            const result = await this.executeTool(
              contentBlock.name,
              contentBlock.input
            );
            toolResults.push({
              tool_use_id: contentBlock.id,
              type: "tool_result",
              content: JSON.stringify(result),
            });
          } else if (contentBlock.type === "text") {
            console.log(
              `💭 Claude text: ${contentBlock.text.substring(0, 100)}...`
            );
          }
        }

        // Add Claude's response to conversation
        messages.push({ role: "assistant", content: response.content });

        if (hasToolCalls) {
          // Add tool results and ask Claude to continue
          messages.push({
            role: "user",
            content: toolResults.concat([
              {
                type: "text",
                text: 'Continue with any remaining actions needed to complete the user\'s requests. If all requests are fully completed, respond with "WORKFLOW_COMPLETE".',
              },
            ]),
          });
        } else {
          // No more tool calls, check if workflow is complete
          const lastResponse =
            response.content.find((block) => block.type === "text")?.text || "";
          if (
            lastResponse.includes("WORKFLOW_COMPLETE") ||
            (!lastResponse.toLowerCase().includes("next") &&
              !lastResponse.toLowerCase().includes("continue"))
          ) {
            console.log("✅ Claude indicates workflow is complete");
            break;
          }
        }
      }

      await this.markLifelogProcessed(lifelog.id);
      console.log(`✅ Completed processing lifelog: ${lifelog.id}`);
    } catch (error) {
      console.error(
        `❌ Error processing lifelog ${lifelog.id}:`,
        error.message
      );
    }
  }

  async executeTool(toolName, input) {
    console.log(`🔧 Executing tool: ${toolName}`);

    for (const tool of this.tools) {
      if (tool.canHandle(toolName)) {
        try {
          const result = await tool.execute(toolName, input);
          console.log(`✅ Tool ${toolName} completed:`, result);
          return result;
        } catch (error) {
          console.error(`❌ Tool ${toolName} failed:`, error.message);
          throw error;
        }
      }
    }

    throw new Error(`Unknown tool: ${toolName}`);
  }

  formatLifelogContent(lifelog) {
    const parts = [];

    if (lifelog.title) parts.push(`Title: ${lifelog.title}`);
    if (lifelog.start_time) parts.push(`Time: ${lifelog.start_time}`);
    if (lifelog.markdown) parts.push(`Content: ${lifelog.markdown}`);
    else if (lifelog.contents) {
      try {
        const parsed =
          typeof lifelog.contents === "string"
            ? JSON.parse(lifelog.contents)
            : lifelog.contents;
        parts.push(`Content: ${JSON.stringify(parsed)}`);
      } catch {
        parts.push(`Content: ${lifelog.contents}`);
      }
    }

    return parts.join("\n");
  }

  async getUnprocessedLifelogs(limit = 10) {
    const [rows] = await this.db.query(
      "SELECT * FROM lifelogs WHERE processed = 0 ORDER BY start_time DESC LIMIT ?",
      [limit]
    );
    return rows;
  }

  async markLifelogProcessed(lifelogId) {
    const [result] = await this.db.query(
      "UPDATE lifelogs SET processed = 1 WHERE id = ?",
      [lifelogId]
    );
    return result;
  }

  async initDatabase() {
    try {
      await this.db.execute("SELECT 1");
      console.log("✅ Database connection established");
    } catch (error) {
      console.error("❌ Database connection failed:", error.message);
    }
  }

  /**
   * Dynamically load all MCP tools from the tools directory
   *
   * Searches for files matching the pattern '*-mcp.js' in the tools directory
   * and loads them as MCP tool classes. Ignores files with 'disabled' in the name.
   *
   * @returns {Array} Array of instantiated MCP tool objects
   */
  loadMCPTools() {
    const toolsDir = path.join(__dirname, "tools");
    const tools = [];

    try {
      // Get all files in the tools directory
      const files = fs.readdirSync(toolsDir);

      // Filter for MCP files (pattern: *-mcp.js) and exclude disabled ones
      const mcpFiles = files.filter(
        (file) => file.endsWith("-mcp.js") && !file.includes("disabled")
      );

      console.log(
        `🔍 Found ${mcpFiles.length} MCP tools: ${mcpFiles.join(", ")}`
      );

      // Load each MCP tool
      for (const file of mcpFiles) {
        try {
          const toolPath = path.join(toolsDir, file);
          const MCPClass = require(toolPath);
          const toolInstance = new MCPClass();
          tools.push(toolInstance);

          // Get tool name from class name or filename
          const toolName = MCPClass.name || file.replace("-mcp.js", "");
          console.log(`✅ Loaded MCP tool: ${toolName}`);
        } catch (error) {
          console.error(`❌ Failed to load MCP tool ${file}:`, error.message);
        }
      }

      console.log(`🚀 Successfully loaded ${tools.length} MCP tools\n`);
    } catch (error) {
      console.error("❌ Error scanning tools directory:", error.message);
    }

    return tools;
  }

  async processBatch(batchSize = 5) {
    console.log(
      `🚀 Starting agent-based batch processing (${batchSize} lifelogs)`
    );

    try {
      const lifelogs = await this.getUnprocessedLifelogs(batchSize);

      if (lifelogs.length === 0) {
        console.log("No unprocessed lifelogs found");
        return;
      }

      console.log(`Found ${lifelogs.length} unprocessed lifelogs`);

      for (const lifelog of lifelogs) {
        await this.processLifelog(lifelog);
        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`✅ Batch completed: processed ${lifelogs.length} lifelogs`);
    } catch (error) {
      console.error("❌ Batch processing error:", error);
    }
  }
}

// Export for use in other files
module.exports = LifelogAgent;

// Run if called directly
if (require.main === module) {
  const agent = new LifelogAgent();

  // Process batch every 30 seconds for demo
  setInterval(async () => {
    await agent.processBatch();
  }, 30000);

  // Initial run
  agent.processBatch();

  console.log("🤖 Lifelog Agent started - processing every 30 seconds");
}
