const OpenAI = require("openai");
const client = new OpenAI();

// Add retry logic with exponential backoff
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000 + Math.random() * 1000; // Exponential backoff with jitter
        console.log(`Rate limit hit, waiting ${Math.round(waitTime)}ms before retry ${i + 1}/${maxRetries}`);
        await sleep(waitTime);
        continue;
      }
      throw error;
    }
  }
}

async function interpret(message, customTools = null) {
  const tools = customTools || [
    {
      type: "function",
      function: {
        name: "create_clickup_task",
        description: "Create a new task in ClickUp",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of the task" },
            due_date: {
              type: "string",
              format: "date",
              description: "Due date (YYYY-MM-DD)",
            },
            list_id: {
              type: "string",
              description: "ClickUp list ID to insert the task into",
            },
            assignee: { type: "string", description: "Assignee ID (optional)" },
          },
          required: ["title", "list_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_notion_note",
        description: "Add a note to a Notion page or database",
        parameters: {
          type: "object",
          properties: {
            content: { type: "string", description: "Note content" },
            page_id: {
              type: "string",
              description: "Notion page or database ID",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags",
            },
          },
          required: ["content", "page_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_google_calendar_event",
        description: "Create a Google Calendar event",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Event title" },
            start_time: {
              type: "string",
              format: "date-time",
              description: "Start time (ISO8601)",
            },
            end_time: {
              type: "string",
              format: "date-time",
              description: "End time (ISO8601)",
            },
            attendees: {
              type: "array",
              items: { type: "string", format: "email" },
              description: "Emails of attendees",
            },
            description: { type: "string", description: "Event description" },
          },
          required: ["title", "start_time", "end_time"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "send_slack_message",
        description: "Send a message to a Slack channel or user",
        parameters: {
          type: "object",
          properties: {
            channel_id: {
              type: "string",
              description: "Slack channel or user ID",
            },
            message: { type: "string", description: "Message to send" },
          },
          required: ["channel_id", "message"],
        },
      },
    },
  ];

  // Convert function tools to proper format for Responses API
  const formattedTools = tools.map(tool => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));

  const response = await retryWithBackoff(async () => {
    return await client.responses.create({
      model: "gpt-4o",
      input: message,
      tools: formattedTools,
    });
  });

  // Handle structured output from Responses API
  if (response.output && response.output.length > 0) {
    const output = response.output[0];
    
    // Check if it's a tool call
    if (output.type === 'function_call' || output.function_call) {
      const toolCall = output.function_call || output;
      console.log("GPT wants to call tool:", toolCall.name);
      console.log("With arguments:", typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments);
      return {
        type: 'tool_call',
        name: toolCall.name,
        arguments: typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments
      };
    }
  }

  // If no tool call, return the text response
  console.log("GPT Response:", response.output_text);
  return {
    type: 'text_response',
    content: response.output_text
  };
}

module.exports = { interpret };
