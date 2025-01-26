# RAT MCP Server (Retrieval Augmented Thinking)

A Model Context Protocol (MCP) server that implements RAT's two-stage reasoning process, combining DeepSeek's reasoning capabilities with various response models.

<a href="https://glama.ai/mcp/servers/t0ykwg3k7n"><img width="380" height="200" src="https://glama.ai/mcp/servers/t0ykwg3k7n/badge" alt="RAT Server MCP server" /></a>

## Features

- **Two-Stage Processing**:
  - Uses DeepSeek for detailed reasoning and analysis
  - Supports multiple models for final response generation
  - Maintains conversation context between interactions

- **Supported Models**:
  - DeepSeek Reasoner (for thinking process)
  - Claude 3.5 Sonnet (via Anthropic)
  - Any OpenRouter model (GPT-4, Gemini, etc.)

- **Context Management**:
  - Maintains conversation history
  - Includes previous Q&A in reasoning process
  - Supports context clearing when needed
  - Configurable context size limit

## Installation

1. Clone the repository:
```bash
git clone https://github.com/newideas99/RAT-retrieval-augmented-thinking-MCP.git
cd rat-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your API keys and model configuration:
```env
# Required: DeepSeek API key for reasoning stage
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Required: OpenRouter API key for non-Claude models
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Optional: Anthropic API key for Claude model
ANTHROPIC_API_KEY=your_anthropic_api_key_here

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
      "args": ["/path/to/rat-mcp-server/build/index.js"],
      "env": {
        "DEEPSEEK_API_KEY": "your_key_here",
        "OPENROUTER_API_KEY": "your_key_here",
        "ANTHROPIC_API_KEY": "your_key_here",
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
  "clearContext"?: boolean   // Optional: Clear conversation history
}
```

Example usage in Cline:
```typescript
use_mcp_tool({
  server_name: "rat",
  tool_name: "generate_response",
  arguments: {
    prompt: "What is Python?",
    showReasoning: true
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
