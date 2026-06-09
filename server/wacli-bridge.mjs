/**
 * wacli-bridge — Servidor WebSocket que faz ponte entre o frontend e o wacli CLI.
 * 
 * Funcionalidades:
 *   - WebSocket em ws://localhost:9300
 *   - Executa comandos wacli como subprocessos
 *   - Sincroniza mensagens em tempo real (wacli sync --follow --events)
 *   - Envia mensagens via wacli send text
 *   - Busca contatos e histórico
 * 
 * Protocolo WebSocket (JSON):
 *   Client → Server: { type: "send" | "search" | "contacts" | "sync" | "history", payload: {...} }
 *   Server → Client: { type: "message" | "status" | "contacts" | "history" | "error", payload: {...} }
 */

import { WebSocketServer, WebSocket } from 'ws';
import { spawn, execSync } from 'child_process';

const PORT = 9300;
const wss = new WebSocketServer({ port: PORT });

// Estado global
let syncProcess = null;
let wacliAvailable = false;
let connected = false;

// Verificar se wacli está instalado
try {
  execSync('which wacli', { stdio: 'pipe' });
  wacliAvailable = true;
  console.log('✅ wacli encontrado no PATH');
} catch {
  wacliAvailable = false;
  console.log('⚠️  wacli não encontrado — rodando em modo demo');
}

// Verificar se está autenticado
let authenticated = false;
if (wacliAvailable) {
  try {
    const result = execSync('wacli doctor --json 2>/dev/null || true', { encoding: 'utf-8', timeout: 5000 });
    if (result.includes('"authenticated"') || result.includes('"ok"')) {
      authenticated = true;
      console.log('✅ wacli autenticado');
    }
  } catch {
    console.log('⚠️  wacli não autenticado — use "wacli auth" primeiro');
  }
}

// ─── Executar comando wacli e retornar output ────────────────────────────────

function runWacli(args, { json = true, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const fullArgs = json ? ['--json', ...args] : args;
    const proc = spawn('wacli', fullArgs, { timeout });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(json ? JSON.parse(stdout) : stdout.trim());
        } catch {
          resolve(stdout.trim());
        }
      } else {
        reject(new Error(stderr || `wacli exited with code ${code}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });
}

// ─── Dados demo quando wacli não está disponível ─────────────────────────────

const DEMO_CONTACTS = [
  { jid: '5585999990001@s.whatsapp.net', name: 'ASESI - Equipe', phone: '+5585999990001', pushName: 'ASESI Equipe' },
  { jid: '5585999990002@s.whatsapp.net', name: 'COAFI - João', phone: '+5585999990002', pushName: 'João COAFI' },
  { jid: '5585999990003@s.whatsapp.net', name: 'CGE - Maria', phone: '+5585999990003', pushName: 'Maria CGE' },
  { jid: '5585999990004@s.whatsapp.net', name: 'USJ - DevTeam', phone: '+5585999990004', pushName: 'DevTeam USJ' },
  { jid: '5585999990005@s.whatsapp.net', name: 'Nauber', phone: '+5585999990005', pushName: 'Nauber' },
];

const DEMO_MESSAGES = [
  { id: 'dm1', from: '5585999990001@s.whatsapp.net', fromName: 'ASESI - Equipe', text: 'Bom dia! A reunião vai ser às 14h?', timestamp: Date.now() - 3600000, direction: 'received' },
  { id: 'dm2', from: 'me', fromName: 'Eu', text: 'Sim, confirmado! Sala virtual do Meet.', timestamp: Date.now() - 3500000, direction: 'sent' },
  { id: 'dm3', from: '5585999990001@s.whatsapp.net', fromName: 'ASESI - Equipe', text: 'Ok, reunião confirmada! Vou preparar a pauta sobre o agente colaborador.', timestamp: Date.now() - 3400000, direction: 'received' },
  { id: 'dm4', from: '5585999990001@s.whatsapp.net', fromName: 'ASESI - Equipe', text: 'Conseguiu avançar no deploy do ChromaDB?', timestamp: Date.now() - 1800000, direction: 'received' },
  { id: 'dm5', from: 'me', fromName: 'Eu', text: 'Sim! Base vetorial rodando. O RAG engine tá respondendo bem nos testes.', timestamp: Date.now() - 1700000, direction: 'sent' },
];

// ─── Sync em tempo real ──────────────────────────────────────────────────────

function startSync(ws) {
  if (!wacliAvailable || !authenticated) {
    // Demo mode: simular mensagens periódicas
    const demoMessages = [
      'Como está o progresso do agente?',
      'O deploy foi feito?',
      'Preciso do relatório até sexta',
      'Reunião remarcada para 15h',
      'Ótimo trabalho! 👏',
      'Vou enviar o documento agora',
    ];
    let msgIdx = 0;

    const interval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }
      // Simular recebimento de mensagem a cada 20-40 segundos
      const delay = 20000 + Math.random() * 20000;
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const contact = DEMO_CONTACTS[Math.floor(Math.random() * DEMO_CONTACTS.length)];
        const msg = {
          id: `msg_${Date.now()}`,
          from: contact.jid,
          fromName: contact.name,
          text: demoMessages[msgIdx % demoMessages.length],
          timestamp: Date.now(),
          direction: 'received',
          chatJid: contact.jid,
        };
        msgIdx++;
        ws.send(JSON.stringify({ type: 'message', payload: msg }));
      }, delay);
    }, 25000);

    return { kill: () => clearInterval(interval) };
  }

  // Real mode: wacli sync --follow --events
  const proc = spawn('wacli', ['sync', '--follow', '--events'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'message' || event.event === 'message.new') {
          const msg = {
            id: event.id || `msg_${Date.now()}`,
            from: event.from || event.sender || event.chat,
            fromName: event.pushName || event.from || 'Desconhecido',
            text: event.text || event.body || event.message?.conversation || '',
            timestamp: event.timestamp ? event.timestamp * 1000 : Date.now(),
            direction: event.fromMe ? 'sent' : 'received',
            chatJid: event.chat || event.from,
            mediaType: event.mediaType || null,
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'message', payload: msg }));
          }
        }
      } catch {
        // NDJSON parse error — skip line
      }
    }
  });

  proc.stderr.on('data', (data) => {
    console.error('[wacli sync stderr]', data.toString());
  });

  proc.on('close', (code) => {
    console.log(`[wacli sync] process exited with code ${code}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'status', payload: { sync: 'stopped', code } }));
    }
  });

  return proc;
}

// ─── WebSocket handlers ──────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  console.log('🔗 Client conectado ao wacli-bridge');

  // Enviar status inicial
  ws.send(JSON.stringify({
    type: 'status',
    payload: {
      wacliAvailable,
      authenticated,
      mode: wacliAvailable && authenticated ? 'live' : 'demo',
    },
  }));

  // Iniciar sync
  let syncProc = startSync(ws);

  ws.on('message', async (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid JSON' } }));
      return;
    }

    const { type, payload } = data;

    try {
      switch (type) {
        case 'send': {
          // Enviar mensagem via wacli
          const { to, message, replyTo } = payload;
          if (!wacliAvailable || !authenticated) {
            // Demo mode: simular envio
            const sentMsg = {
              id: `sent_${Date.now()}`,
              from: 'me',
              fromName: 'Eu',
              text: message,
              timestamp: Date.now(),
              direction: 'sent',
              chatJid: to,
              status: 'sent',
            };
            ws.send(JSON.stringify({ type: 'sent', payload: sentMsg }));
            // Simular resposta após 2-5s
            setTimeout(() => {
              const contact = DEMO_CONTACTS.find(c => c.jid === to) || DEMO_CONTACTS[0];
              const reply = {
                id: `msg_${Date.now()}`,
                from: to,
                fromName: contact.name,
                text: '👍 Recebido!',
                timestamp: Date.now(),
                direction: 'received',
                chatJid: to,
              };
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'message', payload: reply }));
              }
            }, 2000 + Math.random() * 3000);
            break;
          }

          // Real mode
          const args = ['send', 'text', '--to', to, '--message', message];
          if (replyTo) args.push('--reply-to', replyTo);
          const result = await runWacli(args);
          ws.send(JSON.stringify({ type: 'sent', payload: { ...result, text: message, to, timestamp: Date.now() } }));
          break;
        }

        case 'contacts': {
          if (!wacliAvailable || !authenticated) {
            ws.send(JSON.stringify({ type: 'contacts', payload: DEMO_CONTACTS }));
            break;
          }
          const contacts = await runWacli(['contacts', 'list', '--limit', '50']);
          ws.send(JSON.stringify({ type: 'contacts', payload: contacts.data || contacts }));
          break;
        }

        case 'history': {
          // Buscar histórico de um chat
          const { chatJid, limit = 30 } = payload;
          if (!wacliAvailable || !authenticated) {
            const filtered = DEMO_MESSAGES.filter(m => m.from === chatJid || m.chatJid === chatJid || chatJid === DEMO_CONTACTS[0].jid);
            ws.send(JSON.stringify({ type: 'history', payload: { chatJid, messages: filtered } }));
            break;
          }
          const msgs = await runWacli(['messages', 'list', '--chat', chatJid, '--limit', String(limit)]);
          ws.send(JSON.stringify({ type: 'history', payload: { chatJid, messages: msgs.data || msgs } }));
          break;
        }

        case 'search': {
          const { query } = payload;
          if (!wacliAvailable || !authenticated) {
            const results = DEMO_MESSAGES.filter(m => m.text.toLowerCase().includes(query.toLowerCase()));
            ws.send(JSON.stringify({ type: 'search', payload: results }));
            break;
          }
          const results = await runWacli(['messages', 'search', query]);
          ws.send(JSON.stringify({ type: 'search', payload: results.data || results }));
          break;
        }

        case 'chats': {
          if (!wacliAvailable || !authenticated) {
            ws.send(JSON.stringify({ type: 'chats', payload: DEMO_CONTACTS.map(c => ({ jid: c.jid, name: c.name, lastMessage: 'Demo message', unread: Math.floor(Math.random() * 3) })) }));
            break;
          }
          const chats = await runWacli(['chats', 'list', '--limit', '30']);
          ws.send(JSON.stringify({ type: 'chats', payload: chats.data || chats }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', payload: { message: `Unknown type: ${type}` } }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', payload: { message: err.message, command: type } }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 Client desconectado');
    if (syncProc && syncProc.kill) {
      syncProc.kill();
    }
  });
});

console.log(`\n📱 wacli-bridge WebSocket server rodando em ws://localhost:${PORT}`);
console.log(`   Mode: ${wacliAvailable && authenticated ? '🟢 LIVE (wacli real)' : '🟡 DEMO (dados simulados)'}`);
console.log(`   wacli: ${wacliAvailable ? '✅ instalado' : '❌ não encontrado'}`);
console.log(`   auth:  ${authenticated ? '✅ autenticado' : '❌ não autenticado'}\n`);
