# Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP

[![smithery badge](https://smithery.ai/badge/@newideas99/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP)](https://smithery.ai/server/@newideas99/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP)

A Model Context Protocol (MCP) server that combines DeepSeek R1's reasoning capabilities with Claude 3.5 Sonnet's response generation through OpenRouter. This implementation uses a two-stage process where DeepSeek provides structured reasoning which is then incorporated into Claude's response generation.

<a href="https://glama.ai/mcp/servers/t0ykwg3k7n"><img width="380" height="200" src="https://glama.ai/mcp/servers/t0ykwg3k7n/badge" alt="RAT Server MCP server" /></a>

## Features

- **Two-Stage Processing**:
  - Uses DeepSeek R1 for initial reasoning (50k character context)
  - Uses Claude 3.5 Sonnet for final response (600k character context)
  - Both models accessed through OpenRouter's unified API
  - Injects DeepSeek's reasoning tokens into Claude's context

- **Smart Conversation Management**:
  - Detects active conversations using file modification times
  - Handles multiple concurrent conversations
  - Filters out ended conversations automatically
  - Supports context clearing when needed

- **Optimized Parameters**:
  - Model-specific context limits:
    * DeepSeek: 50,000 characters for focused reasoning
    * Claude: 600,000 characters for comprehensive responses
  - Recommended settings:
    * temperature: 0.7 for balanced creativity
    * top_p: 1.0 for full probability distribution
    * repetition_penalty: 1.0 to prevent repetition

## Installation

### Installing via Smithery

To install DeepSeek Thinking with Claude 3.5 Sonnet for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@newideas99/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP):

```bash
npx -y @smithery/cli install @newideas99/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP --client claude
```

### Manual Installation
1. Clone the repository:
```bash
git clone https://github.com/yourusername/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP.git
cd Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your OpenRouter API key:
```env
# Required: OpenRouter API key for both DeepSeek and Claude models
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional: Model configuration (defaults shown below)
DEEPSEEK_MODEL=deepseek/deepseek-r1  # DeepSeek model for reasoning
CLAUDE_MODEL=anthropic/claude-3.5-sonnet:beta  # Claude model for responses
```

4. Build the server:
```bash
npm run build
```

## Usage with Cline

Add to your Cline MCP settings (usually in `~/.vscode/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "deepseek-claude": {
      "command": "/path/to/node",
      "args": ["/path/to/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP/build/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "your_key_here"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Tool Usage

The server provides a single tool `generate_response` with the following parameters:

```typescript
{
  "prompt": string,           // Required: The question or prompt
  "showReasoning"?: boolean, // Optional: Show DeepSeek's reasoning process
  "clearContext"?: boolean,  // Optional: Clear conversation history
  "includeHistory"?: boolean // Optional: Include Cline conversation history
}
```

Example usage in Cline:
```typescript
use_mcp_tool({
  server_name: "deepseek-claude",
  tool_name: "generate_response",
  arguments: {
    prompt: "What is Python?",
    showReasoning: true,
    includeHistory: true
  }
});
```

## Development

For development with auto-rebuild:
```bash
npm run watch
```

## How It Works

1. **Reasoning Stage (DeepSeek R1)**:
   - Uses OpenRouter's reasoning tokens feature
   - Prompt is modified to output 'done' while capturing reasoning
   - Reasoning is extracted from response metadata

2. **Response Stage (Claude 3.5 Sonnet)**:
   - Receives the original prompt and DeepSeek's reasoning
   - Generates final response incorporating the reasoning
   - Maintains conversation context and history

## License

MIT License - See LICENSE file for details.

## Credits

Based on the RAT (Retrieval Augmented Thinking) concept by [Skirano](https://x.com/skirano/status/1881922469411643413), which enhances AI responses through structured reasoning and knowledge retrieval.

This implementation specifically combines DeepSeek R1's reasoning capabilities with Claude 3.5 Sonnet's response generation through OpenRouter's unified API.
