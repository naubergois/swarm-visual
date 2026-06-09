/**
 * MCP Client — Comunicação com o servidor qclaw-cards via SSE transport.
 * 
 * O servidor MCP SSE funciona assim:
 *   1. GET /sse → Abre EventSource, recebe endpoint (session_id) + respostas JSON-RPC
 *   2. POST /messages?session_id=xxx → Envia JSON-RPC requests (retorna 202, resposta vem via SSE)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface McpCard {
  id: string;
  title: string;
  description: string;
  column: string;
  priority: number;
  assignees: string[];
  skills: string[];
  notes: string;
  created_at: string | null;
  completed_at: string | null;
  _team_id: string;
}

export interface McpBoard {
  workdir: string;
  kanban_file: string;
  team_id: string;
  columns: { id: string; title: string }[];
  total_cards: number;
}

export interface McpToolInfo {
  name: string;
  description: string;
}

// ─── MCP SSE Client ──────────────────────────────────────────────────────────

const MCP_BASE = '/mcp';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

class McpSseClient {
  private eventSource: EventSource | null = null;
  private messageEndpoint: string | null = null;
  private requestId = 0;
  private initialized = false;
  private connected = false;
  private pendingRequests = new Map<number, PendingRequest>();

  async connect(): Promise<void> {
    if (this.connected && this.eventSource) return;

    return new Promise((resolve, reject) => {
      const es = new EventSource(`${MCP_BASE}/sse`);
      this.eventSource = es;

      es.addEventListener('endpoint', (event) => {
        const data = (event as MessageEvent).data;
        // data is like: /messages?session_id=xxx
        this.messageEndpoint = `${MCP_BASE}${data}`;
        this.connected = true;
        resolve();
      });

      // Responses come back as 'message' events via SSE
      es.onmessage = (event) => {
        try {
          const response = JSON.parse(event.data);
          const id = response.id;
          if (id != null && this.pendingRequests.has(id)) {
            const pending = this.pendingRequests.get(id)!;
            this.pendingRequests.delete(id);
            if (response.error) {
              pending.reject(new Error(response.error.message || 'MCP error'));
            } else {
              pending.resolve(response.result);
            }
          }
        } catch {
          // ignore parse errors from non-JSON messages
        }
      };

      es.onerror = () => {
        if (!this.connected) {
          es.close();
          this.eventSource = null;
          reject(new Error('Falha ao conectar ao MCP server'));
        }
        // If already connected, SSE will auto-reconnect
      };

      // Timeout
      setTimeout(() => {
        if (!this.connected) {
          es.close();
          this.eventSource = null;
          reject(new Error('Timeout conectando ao MCP server'));
        }
      }, 8000);
    });
  }

  private async sendRequest(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.connected || !this.messageEndpoint) {
      await this.connect();
    }

    if (!this.initialized && method !== 'initialize') {
      await this.initialize();
    }

    const id = ++this.requestId;

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    });

    // Create a promise that will be resolved when SSE sends back the response
    const responsePromise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Timeout for individual requests
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 15000);
    });

    // POST the request (server returns 202, response comes via SSE)
    const res = await fetch(this.messageEndpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    if (!res.ok && res.status !== 202) {
      this.pendingRequests.delete(id);
      throw new Error(`MCP POST failed: ${res.status}`);
    }

    return responsePromise;
  }

  private async initialize(): Promise<void> {
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'swarm-visual', version: '1.0.0' },
    });
    this.initialized = true;
  }

  async callTool(toolName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    }) as { content: { type: string; text: string }[]; isError?: boolean };

    if (result.content && result.content[0]?.type === 'text') {
      return JSON.parse(result.content[0].text);
    }
    return result;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.sendRequest('tools/list') as { tools: McpToolInfo[] };
    return result.tools || [];
  }

  // ─── Convenience methods ─────────────────────────────────────────────

  async getBoards(): Promise<McpBoard[]> {
    const result = await this.callTool('list_kanban_boards') as { ok: boolean; boards: McpBoard[] };
    return result.ok ? result.boards : [];
  }

  async getCards(teamId?: string, column?: string): Promise<McpCard[]> {
    const args: Record<string, string> = {};
    if (teamId) args.team_id = teamId;
    if (column) args.column = column;
    const result = await this.callTool('get_cards', args) as { ok: boolean; cards: McpCard[] };
    return result.ok ? result.cards : [];
  }

  async getCardsTodo(): Promise<McpCard[]> {
    // Buscar cards do time USJASESI (c22f69a564d6)
    const result = await this.callTool('get_cards', { team_id: 'c22f69a564d6' }) as { ok: boolean; cards: McpCard[] };
    return result.ok ? result.cards : [];
  }

  async moveCard(cardId: string, targetColumn: string, teamId?: string): Promise<boolean> {
    const args: Record<string, string> = { card_id: cardId, column: targetColumn };
    if (teamId) args.team_id = teamId;
    const result = await this.callTool('move_card', args) as { ok: boolean };
    return result.ok;
  }

  async addCard(title: string, description: string, column: string, priority: number, skills: string[], teamId?: string): Promise<McpCard | null> {
    const args: Record<string, unknown> = {
      title,
      description,
      column,
      priority,
      skills,
    };
    if (teamId) args.team_id = teamId;
    try {
      const result = await this.callTool('add_card', args) as { ok: boolean; card?: McpCard };
      return result.ok && result.card ? result.card : null;
    } catch {
      return null;
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    this.messageEndpoint = null;
    this.initialized = false;
    this.requestId = 0;
    this.pendingRequests.clear();
  }
}

export const mcpClient = new McpSseClient();
