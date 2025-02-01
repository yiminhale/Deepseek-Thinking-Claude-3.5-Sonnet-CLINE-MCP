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
import dotenv from 'dotenv';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Load environment variables
dotenv.config();

// Debug logging
const DEBUG = true;
const log = (...args: any[]) => {
  if (DEBUG) {
    console.error('[DEEPSEEK-CLAUDE MCP]', ...args);
  }
};

// Constants
const DEEPSEEK_MODEL = "deepseek/deepseek-r1";
const CLAUDE_MODEL = "anthropic/claude-3.5-sonnet:beta";

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
  includeHistory?: boolean;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | { type: string; text: string }[];
}

interface UiMessage {
  ts: number;
  type: string;
  say?: string;
  ask?: string;
  text: string;
  conversationHistoryIndex: number;
}

const isValidGenerateResponseArgs = (args: any): args is GenerateResponseArgs =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.prompt === 'string' &&
  (args.showReasoning === undefined || typeof args.showReasoning === 'boolean') &&
  (args.clearContext === undefined || typeof args.clearContext === 'boolean') &&
  (args.includeHistory === undefined || typeof args.includeHistory === 'boolean');

function getClaudePath(): string {
  const homeDir = os.homedir();
  switch (process.platform) {
    case 'win32':
      return path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'tasks');
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'tasks');
    default: // linux
      return path.join(homeDir, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'tasks');
  }
}

async function findActiveConversation(): Promise<ClaudeMessage[] | null> {
  try {
    const tasksPath = getClaudePath();
    const dirs = await fs.readdir(tasksPath);
    
    // Get modification time for each api_conversation_history.json
    const dirStats = await Promise.all(
      dirs.map(async (dir) => {
        try {
          const historyPath = path.join(tasksPath, dir, 'api_conversation_history.json');
          const stats = await fs.stat(historyPath);
          const uiPath = path.join(tasksPath, dir, 'ui_messages.json');
          const uiContent = await fs.readFile(uiPath, 'utf8');
          const uiMessages: UiMessage[] = JSON.parse(uiContent);
          const hasEnded = uiMessages.some(m => m.type === 'conversation_ended');
          
          return {
            dir,
            mtime: stats.mtime.getTime(),
            hasEnded
          };
        } catch (error) {
          log('Error checking folder:', dir, error);
          return null;
        }
      })
    );

    // Filter out errors and ended conversations, then sort by modification time
    const sortedDirs = dirStats
      .filter((stat): stat is NonNullable<typeof stat> => 
        stat !== null && !stat.hasEnded
      )
      .sort((a, b) => b.mtime - a.mtime);

    // Use most recently modified active conversation
    const latest = sortedDirs[0]?.dir;
    if (!latest) {
      log('No active conversations found');
      return null;
    }
    
    const historyPath = path.join(tasksPath, latest, 'api_conversation_history.json');
    const history = await fs.readFile(historyPath, 'utf8');
    return JSON.parse(history);
  } catch (error) {
    log('Error finding active conversation:', error);
    return null;
  }
}

function formatHistoryForModel(history: ClaudeMessage[], isDeepSeek: boolean): string {
  let totalLength = 0;
  const maxLength = isDeepSeek ? 50000 : 600000; // 50k chars for DeepSeek, 600k for Claude
  const formattedMessages = [];
  
  // Process messages from most recent to oldest
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const content = Array.isArray(msg.content)
      ? msg.content.map(c => c.text).join('\n')
      : msg.content;
    
    const formattedMsg = `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${content}`;
    const msgLength = formattedMsg.length;
    
    // Stop adding messages if we'd exceed the limit
    if (totalLength + msgLength > maxLength) {
      break;
    }
    
    formattedMessages.unshift(formattedMsg); // Add to start to maintain order
    totalLength += msgLength;
  }
  
  return formattedMessages.join('\n\n');
}

class DeepseekClaudeServer {
  private server: Server;
  private openrouterClient: OpenAI;
  private context: ConversationContext = {
    entries: [],
    maxEntries: 10
  };

  constructor() {
    log('Initializing API clients...');
    
    // Initialize OpenRouter client
    this.openrouterClient = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY
    });
    log('OpenRouter client initialized');

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'deepseek-thinking-claude-mcp',
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
          description: 'Generate a response using DeepSeek\'s reasoning and Claude\'s response generation through OpenRouter.',
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
              },
              includeHistory: {
                type: 'boolean',
                description: 'Include Cline conversation history for context',
                default: true
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
        }

        // Get Cline conversation history if requested
        let history: ClaudeMessage[] | null = null;
        if (request.params.arguments.includeHistory !== false) {
          history = await findActiveConversation();
        }

        // Get DeepSeek reasoning with limited history
        const reasoningHistory = history ? formatHistoryForModel(history, true) : '';
        const reasoningPrompt = reasoningHistory 
          ? `${reasoningHistory}\n\nNew question: ${request.params.arguments.prompt}`
          : request.params.arguments.prompt;
        const reasoning = await this.getDeepseekReasoning(reasoningPrompt);
        
        // Get final response with full history
        const responseHistory = history ? formatHistoryForModel(history, false) : '';
        const fullPrompt = responseHistory 
          ? `${responseHistory}\n\nCurrent task: ${request.params.arguments.prompt}`
          : request.params.arguments.prompt;
        const response = await this.getFinalResponse(fullPrompt, reasoning);

        // Add to context after successful response
        this.addToContext({
          timestamp: Date.now(),
          prompt: request.params.arguments.prompt,
          reasoning,
          response,
          model: CLAUDE_MODEL
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

    try {
      // Ask DeepSeek to think but only output 'done'
      const response = await this.openrouterClient.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [{ 
          role: "user", 
          content: `${contextPrompt} Please think this through, but don't output an answer -- only think about the problem, and output 'done'.`
        }],
        include_reasoning: true,
        temperature: 0.7,
        top_p: 1,
        repetition_penalty: 1
      } as any);

      // Get reasoning from response
      const responseData = response as any;
      if (!responseData.choices?.[0]?.message?.reasoning) {
        throw new Error('No reasoning received from DeepSeek');
      }
      return responseData.choices[0].message.reasoning;
    } catch (error) {
      log('Error in getDeepseekReasoning:', error);
      throw error;
    }
  }

  private async getFinalResponse(prompt: string, reasoning: string): Promise<string> {
    try {
      // Create messages array with proper structure
      const messages = [
        // First the user's question
        {
          role: "user" as const,
          content: prompt
        },
        // Then the reasoning as assistant's thoughts
        {
          role: "assistant" as const,
          content: `<thinking>${reasoning}</thinking>`
        }
      ];

      // If we have context, prepend it as previous turns
      if (this.context.entries.length > 0) {
        const contextMessages = this.context.entries.flatMap(entry => [
          {
            role: "user" as const,
            content: entry.prompt
          },
          {
            role: "assistant" as const,
            content: entry.response
          }
        ]);
        messages.unshift(...contextMessages);
      }

      const response = await this.openrouterClient.chat.completions.create({
        model: CLAUDE_MODEL,
        messages: messages,
        temperature: 0.7,
        top_p: 1,
        repetition_penalty: 1
      } as any);
      
      return response.choices[0].message.content || "Error: No response content";
    } catch (error) {
      log('Error in getFinalResponse:', error);
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('DeepSeek-Claude MCP server running on stdio');
  }
}

const server = new DeepseekClaudeServer();
server.run().catch(console.error);
