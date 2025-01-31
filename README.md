# Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP

A Model Context Protocol (MCP) server that combines DeepSeek's reasoning capabilities with Claude 3.5 Sonnet's response generation through Cline. This implementation uses a two-stage process where DeepSeek provides structured reasoning which is then incorporated into Claude's response generation.

## Features

- **Two-Stage Processing**:
  - Uses DeepSeek for initial reasoning (50k character context)
  - Uses Claude 3.5 Sonnet for final response (600k character context)
  - Maintains conversation context between interactions
  - Injects DeepSeek's reasoning as assistant messages in Claude's context

- **Smart Conversation Management**:
  - Detects active conversations using file modification times
  - Handles multiple concurrent conversations
  - Filters out ended conversations automatically
  - Supports context clearing when needed

- **Optimized Context Handling**:
  - Model-specific context limits:
    * DeepSeek: 50,000 characters for focused reasoning
    * Claude: 600,000 characters for comprehensive responses
  - Prioritizes recent messages when approaching limits
  - Maintains conversation flow across multiple interactions

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP.git
cd Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your API keys and model configuration:
```env
# Required: DeepSeek API key for reasoning stage
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Required: Anthropic API key for Claude model
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional: OpenRouter API key for alternative models
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional: Model configuration
DEFAULT_MODEL=claude-3-5-sonnet-20241022  # or any OpenRouter model ID
OPENROUTER_MODEL=openai/gpt-4  # default OpenRouter model if not using Claude
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
    "rat": {
      "command": "/path/to/node",
      "args": ["/path/to/Deepseek-Thinking-Claude-3.5-Sonnet-CLINE-MCP/build/index.js"],
      "env": {
        "DEEPSEEK_API_KEY": "your_key_here",
        "ANTHROPIC_API_KEY": "your_key_here",
        "OPENROUTER_API_KEY": "your_key_here",
        "DEFAULT_MODEL": "claude-3-5-sonnet-20241022",
        "OPENROUTER_MODEL": "openai/gpt-4"
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
  server_name: "rat",
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

## License

MIT License - See LICENSE file for details.

## Credits

Based on the RAT (Retrieval Augmented Thinking) concept by [Skirano](https://x.com/skirano/status/1881922469411643413), which enhances AI responses through structured reasoning and knowledge retrieval.

This implementation specifically combines DeepSeek's reasoning capabilities with Claude 3.5 Sonnet's response generation through the Cline VSCode extension.
