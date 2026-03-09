# Limitless v2.0 - Agent-based Lifelog Processor

**🎯 98% Code Reduction**: Transformed from 11,020 lines (40 files) to ~300 lines (4 files)

## Overview

Limitless v2.0 replaces complex intent processing workflows with a simple agent-based approach using Claude and MCP (Model Context Protocol) tools. The agent naturally understands user requests and chains tool calls without complex orchestration logic.

## Architecture

### v1.0 (Old System - Backed up)
- ❌ 11,020 lines across 40 files
- ❌ Complex intent extraction and workflow orchestration  
- ❌ Multiple abstraction layers violating SOLID principles
- ❌ Difficult to maintain and extend

### v2.0 (Current System)
- ✅ ~300 lines across 4 files
- ✅ Natural language processing with Claude
- ✅ Direct tool calling with MCP protocol
- ✅ Simple, maintainable architecture

## Project Structure

```
limitless/
├── agent.js                    # Main agent class (~300 lines)
├── start-production.js         # Production deployment script
├── tools/                      # MCP tool implementations
│   ├── todoist-mcp.js         # Task management integration
│   ├── notion-mcp.js          # Database management integration
│   └── stock-mcp.js           # Stock analysis integration
├── tests/                      # All test files organized in subfolder
│   ├── test-agent.js          # Basic agent functionality tests
│   ├── test-real-lifelogs.js  # Real lifelog processing tests
│   ├── test-stock-saving.js   # Stock analysis saving tests
│   ├── test-improved-agent.js # Database reuse logic tests
│   ├── comprehensive-test.js  # Full workflow tests
│   ├── debug-wine-test.js     # Wine database debug tests
│   ├── final-test.js          # Final integration tests
│   └── check-created-data.js  # Data validation tests
├── cron/                       # Lifelog fetching (kept from v1.0)
│   └── fetchLifelogs.js       # Fetch lifelogs from Limitless API
├── old-system-backup/          # Complete v1.0 system backup
└── sql/                        # Database schema
    └── schema.sql             # MySQL table definitions
```

## File Documentation

Each file is comprehensively documented with:
- **Purpose and functionality**: What the file does and why it exists
- **Key features**: Important capabilities and improvements over v1.0
- **API documentation**: Method signatures, parameters, and return values
- **Environment variables**: Required configuration
- **Usage examples**: How to use the file/functions

### Key Files Overview

- **`agent.js`**: Core agent with Claude + MCP integration (~300 lines vs 11,020 in v1.0)
- **`start-production.js`**: Production deployment with cron scheduling and monitoring
- **`tools/notion-mcp.js`**: Intelligent database management with duplicate prevention
- **`tools/stock-mcp.js`**: Real-time stock analysis with Perplexity AI integration
- **`tools/todoist-mcp.js`**: Simple task management with natural language processing
- **`tests/*`**: Comprehensive test suite organized by functionality

## Key Features

- **Database Management**: Creates and populates Notion databases intelligently
- **Stock Analysis**: Comprehensive analysis with automatic saving
- **Task Creation**: Smart Todoist task management
- **Multi-turn Conversations**: Handles complex workflows automatically
- **Database Reuse**: Prevents duplicates, reuses existing databases

## Usage

### Production
```bash
npm start              # Full production mode with cron scheduling
```

### Development  
```bash
npm run dev            # Agent only (no cron scheduling)
npm run agent          # Same as dev
```

### Testing
```bash
npm run test:agent          # Test basic agent functionality
npm run test:real           # Test with real lifelogs  
npm run test:stock          # Test stock analysis saving
npm run test:improved       # Test database reuse logic
npm run test:comprehensive  # Full workflow testing
npm run test:debug          # Debug wine database testing
npm run test:final          # Final integration tests
npm run test:check          # Check created data validation
```

### Database
```bash
npm run init-db        # Initialize MySQL schema
npm run fetch          # Manually fetch lifelogs
```

### Legacy
```bash
npm run old-system     # Run backed-up v1.0 system (for reference)
```

## Environment Variables

Required in `.env.local`:
```bash
ANTHROPIC_API_KEY=     # Claude API key
NOTION_TOKEN=          # Notion integration token  
TODOIST_API_TOKEN=     # Todoist API token
PERPLEXITY_API_KEY=    # Perplexity API key
DATABASE_URL=          # MySQL connection string
```

## Migration from v1.0

The old system has been safely backed up to `old-system-backup/` and can be restored if needed. The new agent system provides superior functionality with 98% less code.

### What Changed
- **Removed**: Complex intent extraction, workflow orchestration, multiple handler layers
- **Added**: Claude agent with MCP tools, multi-turn conversations, intelligent database management
- **Improved**: Reliability, maintainability, extensibility

## Agent Capabilities

The agent can handle complex requests like:
- "Create a database of home theater systems and research Sony, Yamaha, and Denon options"
- "Analyze NVDA stock and save the results"  
- "Add wine recommendations to my collection database"

It automatically:
1. Searches for existing databases to prevent duplicates
2. Creates databases with appropriate schemas if needed
3. Populates databases with researched data
4. Saves analyses and creates tasks as requested
5. Handles multi-step workflows through natural conversation

## Production Deployment

The system runs continuously with:
- **Lifelog fetching**: Every 5 minutes
- **Lifelog processing**: Every 30 seconds  
- **Graceful shutdown**: Proper database cleanup on exit
- **Error handling**: Robust error recovery and logging

## License

MIT