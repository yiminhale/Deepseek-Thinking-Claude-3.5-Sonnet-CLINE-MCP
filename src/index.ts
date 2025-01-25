#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Debug logging
const DEBUG = true;
const log = (...args: any[]) => {
  if (DEBUG) {
    console.error('[RAT MCP]', ...args);
  }
};

// Constants
const DEEPSEEK_MODEL = "deepseek-reasoner";
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-3-5-sonnet-20241022";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4";

interface ConversationEntry {
  timestamp: number;
  prompt: string;
  reasoning: string;
  response: string;
  model: string;
}

interface ConversationContext {
  entries: ConversationEntry[];
  maxEntries: number;
}

interface GenerateResponseArgs {
  prompt: string;
  showReasoning?: boolean;
  clearContext?: boolean;
}

const isValidGenerateResponseArgs = (args: any): args is GenerateResponseArgs =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.prompt === 'string' &&
  (args.showReasoning === undefined || typeof args.showReasoning === 'boolean') &&
  (args.clearContext === undefined || typeof args.clearContext === 'boolean');

class RatServer {
  private server: Server;
  private deepseekClient: OpenAI;
  private anthropicClient: Anthropic;
  private openrouterClient: OpenAI;
  private context: ConversationContext = {
    entries: [],
    maxEntries: 10
  };

  constructor() {
    log('Initializing API clients...');
    
    // Initialize API clients
    this.deepseekClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com"
    });
    log('DeepSeek client initialized');

    this.anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    log('Anthropic client initialized');

    this.openrouterClient = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY
    });
    log('OpenRouter client initialized');

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'rat-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private addToContext(entry: ConversationEntry) {
    this.context.entries.push(entry);
    if (this.context.entries.length > this.context.maxEntries) {
      this.context.entries.shift();  // Remove oldest
    }
    log('Context updated:', {
      entriesCount: this.context.entries.length,
      latestEntry: this.context.entries[this.context.entries.length - 1]
    });
  }

  private formatContextForPrompt(): string {
    return this.context.entries
      .map(entry => `Question: ${entry.prompt}\nReasoning: ${entry.reasoning}\nAnswer: ${entry.response}`)
      .join('\n\n');
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_response',
          description: 'Generate a response using RAT\'s two-stage reasoning process. Maintains conversation context between calls.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The user\'s input prompt'
              },
              showReasoning: {
                type: 'boolean',
                description: 'Whether to include reasoning in response',
                default: false
              },
              clearContext: {
                type: 'boolean',
                description: 'Clear conversation history before this request',
                default: false
              }
            },
            required: ['prompt']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'generate_response') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      if (!isValidGenerateResponseArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid generate_response arguments'
        );
      }

      try {
        if (request.params.arguments.clearContext) {
          this.context.entries = [];
          log('Context cleared');
        }

        // Get DeepSeek reasoning
        const reasoning = await this.getDeepseekReasoning(request.params.arguments.prompt);
        
        // Get final response using configured model
        const response = await this.getFinalResponse(
          request.params.arguments.prompt,
          reasoning
        );

        // Add to context after successful response
        this.addToContext({
          timestamp: Date.now(),
          prompt: request.params.arguments.prompt,
          reasoning,
          response,
          model: DEFAULT_MODEL
        });

        return {
          content: [
            {
              type: 'text',
              text: request.params.arguments.showReasoning
                ? `Reasoning:\n${reasoning}\n\nResponse:\n${response}`
                : response
            }
          ]
        };
      } catch (error) {
        if (error instanceof Error) {
          throw new McpError(ErrorCode.InternalError, error.message);
        }
        throw error;
      }
    });
  }

  private async getDeepseekReasoning(prompt: string): Promise<string> {
    const contextPrompt = this.context.entries.length > 0
      ? `Previous conversation:\n${this.formatContextForPrompt()}\n\nNew question: ${prompt}`
      : prompt;

    log('Getting DeepSeek reasoning for prompt:', contextPrompt);
    try {
      const response = await this.deepseekClient.chat.completions.create({
        model: DEEPSEEK_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: contextPrompt }],
        stream: true
      });
      log('DeepSeek stream created successfully');

      let reasoning = "";
      for await (const chunk of response) {
        // DeepSeek's reasoning content comes through as a custom property
        const delta = chunk.choices[0].delta as any;
        if (delta.reasoning_content) {
          reasoning += delta.reasoning_content;
          log('Received reasoning chunk:', delta.reasoning_content);
        }
      }

      log('Completed reasoning:', reasoning);
      return reasoning;
    } catch (error) {
      log('Error in getDeepseekReasoning:', error);
      throw error;
    }
  }

  private async getFinalResponse(prompt: string, reasoning: string): Promise<string> {
    log('Getting final response with model:', DEFAULT_MODEL);

    try {
      if (DEFAULT_MODEL.includes('claude')) {
        log('Using Claude for response');
        
        // Create messages array with proper structure
        const messages = [
          // First the user's question
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: prompt
              }
            ]
          },
          // Then the reasoning as assistant's thoughts
          {
            role: "assistant" as const,
            content: [
              {
                type: "text" as const,
                text: `<thinking>${reasoning}</thinking>`
              }
            ]
          }
        ];

        // If we have context, prepend it as previous turns
        if (this.context.entries.length > 0) {
          const contextMessages = this.context.entries.flatMap(entry => [
            {
              role: "user" as const,
              content: [{ type: "text" as const, text: entry.prompt }]
            },
            {
              role: "assistant" as const,
              content: [{ type: "text" as const, text: entry.response }]
            }
          ]);
          messages.unshift(...contextMessages);
        }

        log('Claude messages:', messages);

        const response = await this.anthropicClient.messages.create({
          model: DEFAULT_MODEL,
          max_tokens: 4096,
          messages: messages
        });
        
        const content = response.content[0];
        if (content.type === "text") {
          log('Received Claude response:', content.text);
          return content.text;
        }
        log('Unexpected Claude response type:', content);
        return "Error: Unexpected response type from Claude";
      } else {
        // For non-Claude models, keep the existing format
        const contextPrompt = this.context.entries.length > 0
          ? `Previous conversation:\n${this.formatContextForPrompt()}\n\n`
          : '';
        
        const combinedPrompt = `${contextPrompt}Current question: <question>${prompt}</question>\n\n<thinking>${reasoning}</thinking>\n\n`;
        log('Using OpenRouter for response');
        log('Combined prompt:', combinedPrompt);
        
        const completion = await this.openrouterClient.chat.completions.create({
          model: OPENROUTER_MODEL,
          messages: [{ role: "user", content: combinedPrompt }]
        });
        const response = completion.choices[0].message.content || "";
        log('Received OpenRouter response:', response);
        return response;
      }
    } catch (error) {
      log('Error in getFinalResponse:', error);
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('RAT MCP server running on stdio');
  }
}

const server = new RatServer();
server.run().catch(console.error);
