#!/usr/bin/env node
/**
 * MCP SSE Server Local — qclaw-cards
 * 
 * Servidor MCP com transporte SSE para desenvolvimento local.
 * Implementa o protocolo MCP (JSON-RPC 2.0) com as ferramentas:
 *   - list_kanban_boards
 *   - get_cards
 *   - move_card
 *   - add_card
 *   - update_card
 *   - delete_card
 * 
 * Dados persistidos em SQLite (server/kanban.db)
 * 
 * Uso: node server/mcp-server.mjs [--port 9200]
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import kanbanDb from './kanban-db.mjs';

// ─── Argumentos CLI ──────────────────────────────────────────
const PORT = (() => {
  const idx = process.argv.indexOf('--port');
  return idx !== -1 ? parseInt(process.argv[idx + 1], 10) : 9200;
})();

// ─── Dados do Kanban via SQLite ──────────────────────────────

// ─── MCP Tools ───────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_kanban_boards',
    description: 'Lista os boards Kanban disponíveis no workspace.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_cards',
    description: 'Retorna os cards do Kanban, opcionalmente filtrando por time ou coluna.',
    inputSchema: {
      type: 'object',
      properties: {
        team_id: { type: 'string', description: 'ID do time (opcional)' },
        column: { type: 'string', description: 'Filtrar por coluna (opcional)' },
      },
      required: [],
    },
  },
  {
    name: 'move_card',
    description: 'Move um card para outra coluna do Kanban.',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: 'ID do card' },
        column: { type: 'string', description: 'Coluna de destino' },
      },
      required: ['card_id', 'column'],
    },
  },
  {
    name: 'add_card',
    description: 'Adiciona um novo card ao Kanban.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título do card' },
        description: { type: 'string', description: 'Descrição' },
        column: { type: 'string', description: 'Coluna inicial' },
        priority: { type: 'number', description: 'Prioridade (1=alta, 5=baixa)' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Skills relacionadas' },
        team_id: { type: 'string', description: 'ID do time (opcional)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_card',
    description: 'Atualiza campos de um card existente.',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: 'ID do card' },
        title: { type: 'string', description: 'Novo título' },
        description: { type: 'string', description: 'Nova descrição' },
        column: { type: 'string', description: 'Nova coluna' },
        priority: { type: 'number', description: 'Nova prioridade' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Novas skills' },
        notes: { type: 'string', description: 'Novas notas' },
      },
      required: ['card_id'],
    },
  },
  {
    name: 'delete_card',
    description: 'Remove um card do Kanban.',
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: 'ID do card a remover' },
      },
      required: ['card_id'],
    },
  },
];

function handleToolCall(name, args) {
  switch (name) {
    case 'list_kanban_boards': {
      const boards = kanbanDb.listBoards();
      return { ok: true, boards };
    }

    case 'get_cards': {
      const cards = kanbanDb.getCards({ team_id: args.team_id, column: args.column });
      return { ok: true, cards };
    }

    case 'move_card': {
      const card = kanbanDb.moveCard(args.card_id, args.column);
      if (!card) return { ok: false, error: `Card ${args.card_id} não encontrado` };
      return { ok: true, card };
    }

    case 'add_card': {
      const card = kanbanDb.addCard({
        title: args.title,
        description: args.description,
        column: args.column,
        priority: args.priority,
        skills: args.skills,
        team_id: args.team_id,
      });
      return { ok: true, card };
    }

    case 'update_card': {
      const card = kanbanDb.updateCard(args.card_id, {
        title: args.title,
        description: args.description,
        column: args.column,
        priority: args.priority,
        skills: args.skills,
        notes: args.notes,
      });
      if (!card) return { ok: false, error: `Card ${args.card_id} não encontrado` };
      return { ok: true, card };
    }

    case 'delete_card': {
      const deleted = kanbanDb.deleteCard(args.card_id);
      if (!deleted) return { ok: false, error: `Card ${args.card_id} não encontrado` };
      return { ok: true, deleted: args.card_id };
    }

    default:
      return { ok: false, error: `Tool '${name}' não encontrada` };
  }
}

// ─── SSE Sessions ────────────────────────────────────────────

const sessions = new Map(); // sessionId -> { res, alive }

// ─── HTTP Server ─────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ─── GET /sse — Abre conexão SSE ────────────────────────
  if (req.method === 'GET' && url.pathname === '/sse') {
    const sessionId = randomUUID();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Envia o endpoint para o cliente
    res.write(`event: endpoint\ndata: /messages?session_id=${sessionId}\n\n`);

    sessions.set(sessionId, { res, alive: true });

    // Keep-alive
    const keepAlive = setInterval(() => {
      if (sessions.has(sessionId)) {
        res.write(': keep-alive\n\n');
      } else {
        clearInterval(keepAlive);
      }
    }, 30000);

    req.on('close', () => {
      sessions.delete(sessionId);
      clearInterval(keepAlive);
    });

    return;
  }

  // ─── POST /messages — Recebe JSON-RPC ───────────────────
  if (req.method === 'POST' && url.pathname === '/messages') {
    const sessionId = url.searchParams.get('session_id');
    const session = sessions.get(sessionId);

    if (!session) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      // Responde 202 imediatamente
      res.writeHead(202);
      res.end('Accepted');

      try {
        const request = JSON.parse(body);
        const response = handleJsonRpc(request);

        // Envia resposta via SSE
        session.res.write(`data: ${JSON.stringify(response)}\n\n`);
      } catch (err) {
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        };
        session.res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      }
    });

    return;
  }

  // ─── Health check ──────────────────────────────────────
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    const cards = kanbanDb.getCards();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      server: 'qclaw-cards',
      storage: 'sqlite',
      sessions: sessions.size,
      cards: cards.length,
    }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── JSON-RPC Handler ────────────────────────────────────────

function handleJsonRpc(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'qclaw-cards', version: '1.0.0' },
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };

    case 'tools/call': {
      const { name, arguments: args } = params || {};
      const result = handleToolCall(name, args || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: !result.ok,
        },
      };
    }

    case 'notifications/initialized':
      // Client notification, no response needed but we'll send one anyway
      return { jsonrpc: '2.0', id, result: {} };

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

// ─── Start ───────────────────────────────────────────────────

server.listen(PORT, () => {
  const cards = kanbanDb.getCards();
  console.log(`🎯 MCP Server (qclaw-cards) rodando em http://localhost:${PORT}`);
  console.log(`   Storage:      SQLite (server/kanban.db)`);
  console.log(`   SSE endpoint: GET /sse`);
  console.log(`   Messages:     POST /messages?session_id=xxx`);
  console.log(`   Health:       GET /health`);
  console.log(`   Cards:        ${cards.length} cards carregados`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando MCP server...');
  kanbanDb.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  kanbanDb.close();
  process.exit(0);
});
