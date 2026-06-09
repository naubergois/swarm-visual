/**
 * wacliClient — Cliente WebSocket para comunicação com o wacli-bridge server.
 * Conecta ao ws://localhost:9300 e expõe métodos para enviar/receber mensagens WhatsApp.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WacliMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: number;
  direction: 'sent' | 'received';
  chatJid?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
  mediaType?: string | null;
}

export interface WacliContact {
  jid: string;
  name: string;
  phone?: string;
  pushName?: string;
}

export interface WacliChat {
  jid: string;
  name: string;
  lastMessage?: string;
  unread?: number;
}

export interface WacliStatus {
  wacliAvailable: boolean;
  authenticated: boolean;
  mode: 'live' | 'demo';
}

type WacliEventType = 'message' | 'sent' | 'status' | 'contacts' | 'history' | 'search' | 'chats' | 'error' | 'connected' | 'disconnected';
type WacliEventHandler = (payload: unknown) => void;

// ─── Client ──────────────────────────────────────────────────────────────────

const WS_URL = 'ws://localhost:9300';

class WacliWebSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Map<WacliEventType, Set<WacliEventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private _status: WacliStatus | null = null;

  get connected() { return this._connected; }
  get status() { return this._status; }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this._connected = true;
        this.emit('connected', {});
        console.log('[wacli] Conectado ao bridge');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          const { type, payload } = data;
          if (type === 'status') {
            this._status = payload as WacliStatus;
          }
          this.emit(type as WacliEventType, payload);
        } catch (err) {
          console.error('[wacli] Parse error:', err);
        }
      };

      this.ws.onclose = () => {
        this._connected = false;
        this.emit('disconnected', {});
        console.log('[wacli] Desconectado — tentando reconectar...');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[wacli] WebSocket error:', err);
        this._connected = false;
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private send(type: string, payload: Record<string, unknown> = {}): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[wacli] WebSocket não conectado');
      return;
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }

  // ─── Event system ────────────────────────────────────────────────────

  on(event: WacliEventType, handler: WacliEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => { this.listeners.get(event)?.delete(handler); };
  }

  private emit(event: WacliEventType, payload: unknown): void {
    this.listeners.get(event)?.forEach(handler => handler(payload));
  }

  // ─── API Methods ─────────────────────────────────────────────────────

  sendMessage(to: string, message: string, replyTo?: string): void {
    this.send('send', { to, message, replyTo });
  }

  getContacts(): void {
    this.send('contacts');
  }

  getChats(): void {
    this.send('chats');
  }

  getHistory(chatJid: string, limit = 30): void {
    this.send('history', { chatJid, limit });
  }

  searchMessages(query: string): void {
    this.send('search', { query });
  }
}

export const wacliClient = new WacliWebSocketClient();
