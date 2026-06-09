/**
 * WhatsAppChat — Painel de chat flutuante integrado com wacli via WebSocket.
 * Conecta ao wacli-bridge (ws://localhost:9300) para enviar/receber mensagens WhatsApp reais.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { wacliClient, type WacliMessage, type WacliContact, type WacliStatus } from './wacliClient';

interface WhatsAppChatProps {
  onClose: () => void;
  onLog: (msg: string) => void;
  onUnread?: (count: number) => void;
}

export function WhatsAppChat({ onClose, onLog, onUnread }: WhatsAppChatProps) {
  const [status, setStatus] = useState<WacliStatus | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [contacts, setContacts] = useState<WacliContact[]>([]);
  const [messages, setMessages] = useState<WacliMessage[]>([]);
  const [selectedChat, setSelectedChat] = useState<WacliContact | null>(null);
  const [inputText, setInputText] = useState('');
  const [showContacts, setShowContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── WebSocket Connection ────────────────────────────────────────────

  useEffect(() => {
    wacliClient.connect();

    const unsubs = [
      wacliClient.on('connected', () => {
        setWsConnected(true);
        onLog('📱 wacli-bridge conectado (WebSocket)');
        wacliClient.getContacts();
        wacliClient.getChats();
      }),

      wacliClient.on('disconnected', () => {
        setWsConnected(false);
      }),

      wacliClient.on('status', (payload) => {
        const s = payload as WacliStatus;
        setStatus(s);
        onLog(`📱 wacli mode: ${s.mode} | auth: ${s.authenticated ? '✅' : '❌'}`);
      }),

      wacliClient.on('contacts', (payload) => {
        const list = payload as WacliContact[];
        setContacts(list);
        if (!selectedChat && list.length > 0) {
          setSelectedChat(list[0]);
          wacliClient.getHistory(list[0].jid);
        }
      }),

      wacliClient.on('chats', (payload) => {
        const chats = payload as Array<{ jid: string; name: string; lastMessage?: string; unread?: number }>;
        // Merge chat info into contacts
        setContacts(prev => {
          const updated = [...prev];
          for (const chat of chats) {
            const existing = updated.find(c => c.jid === chat.jid);
            if (existing) {
              existing.name = chat.name || existing.name;
            } else {
              updated.push({ jid: chat.jid, name: chat.name, phone: chat.jid.replace('@s.whatsapp.net', '') });
            }
          }
          return updated;
        });
        const total = chats.reduce((sum, c) => sum + (c.unread || 0), 0);
        onUnread?.(total);
      }),

      wacliClient.on('history', (payload) => {
        const { messages: msgs } = payload as { chatJid: string; messages: WacliMessage[] };
        setMessages(Array.isArray(msgs) ? msgs : []);
      }),

      wacliClient.on('message', (payload) => {
        const msg = payload as WacliMessage;
        setMessages(prev => [...prev, msg]);
        onUnread?.(1);
        onLog(`📨 ${msg.fromName}: "${msg.text.substring(0, 40)}${msg.text.length > 40 ? '...' : ''}"`);
      }),

      wacliClient.on('sent', (payload) => {
        const msg = payload as WacliMessage & { to?: string };
        const sentMessage: WacliMessage = {
          id: msg.id || `sent_${Date.now()}`,
          from: 'me',
          fromName: 'Eu',
          text: msg.text || '',
          timestamp: msg.timestamp || Date.now(),
          direction: 'sent',
          chatJid: msg.to || msg.chatJid,
          status: 'sent',
        };
        setMessages(prev => prev.map(m => m.id === sentMessage.id ? sentMessage : m));
      }),

      wacliClient.on('search', (payload) => {
        const results = payload as WacliMessage[];
        setMessages(results);
      }),

      wacliClient.on('error', (payload) => {
        const err = payload as { message: string };
        onLog(`❌ wacli erro: ${err.message}`);
      }),
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
      wacliClient.disconnect();
    };
  }, [onLog]);

  // ─── Actions ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(() => {
    if (!inputText.trim() || !selectedChat) return;

    const tempId = `sending_${Date.now()}`;
    const optimistic: WacliMessage = {
      id: tempId,
      from: 'me',
      fromName: 'Eu',
      text: inputText.trim(),
      timestamp: Date.now(),
      direction: 'sent',
      chatJid: selectedChat.jid,
      status: 'sending',
    };

    setMessages(prev => [...prev, optimistic]);
    wacliClient.sendMessage(selectedChat.jid, inputText.trim());
    onLog(`📤 wacli send text --to ${selectedChat.name} --message "${inputText.trim().substring(0, 30)}..."`);
    setInputText('');
  }, [inputText, selectedChat, onLog]);

  const selectContact = useCallback((contact: WacliContact) => {
    setSelectedChat(contact);
    setShowContacts(false);
    setMessages([]);
    wacliClient.getHistory(contact.jid);
  }, []);

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    wacliClient.searchMessages(searchQuery.trim());
    onLog(`🔍 wacli messages search "${searchQuery.trim()}"`);
  }, [searchQuery, onLog]);

  // ─── Helpers ─────────────────────────────────────────────────────────

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const statusIcon = (s?: string) => {
    switch (s) {
      case 'sending': return '🕐';
      case 'sent': return '✓';
      case 'delivered': return '✓✓';
      case 'read': return '✓✓';
      case 'error': return '❌';
      default: return '✓';
    }
  };

  const modeLabel = status?.mode === 'live' ? '🟢 Live' : '🟡 Demo';

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-6 right-6 w-[420px] h-[620px] bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[100]"
      style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(37,211,102,0.15)' }}
    >
      {/* ─── Header ─── */}
      <div className="bg-[#075E54] px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#25D366]/20 flex items-center justify-center text-lg">💬</div>
          <div>
            <h3 className="text-sm font-semibold text-white">WhatsApp · wacli</h3>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-[10px] text-green-200">
                {wsConnected ? modeLabel : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowContacts(!showContacts)}
            className="text-[10px] px-2 py-1 rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
            title="Contatos"
          >
            👥
          </button>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none ml-1">×</button>
        </div>
      </div>

      {/* ─── Selected Contact Bar ─── */}
      {selectedChat && !showContacts && (
        <div className="bg-gray-800/80 px-4 py-2 border-b border-gray-700/50 flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-full bg-[#25D366]/20 flex items-center justify-center text-xs font-medium text-green-300">
            {selectedChat.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-200 truncate">{selectedChat.name}</p>
            <p className="text-[10px] text-gray-500 font-mono">{selectedChat.jid.replace('@s.whatsapp.net', '')}</p>
          </div>
          <button onClick={() => setShowContacts(true)} className="text-[10px] text-gray-400 hover:text-gray-200">
            trocar ▾
          </button>
        </div>
      )}

      {/* ─── Contacts Panel ─── */}
      <AnimatePresence>
        {showContacts && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-gray-850 border-b border-gray-700/50 overflow-hidden shrink-0"
          >
            {/* Search */}
            <div className="p-2 border-b border-gray-700/30">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder="Buscar mensagens..."
                  className="flex-1 bg-gray-900/80 border border-gray-700/50 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366]/50"
                />
                <button onClick={handleSearch} className="text-[10px] px-2 py-1 rounded-lg bg-[#25D366]/20 text-green-300 hover:bg-[#25D366]/30">
                  🔍
                </button>
              </div>
            </div>
            {/* Contact list */}
            <div className="p-2 space-y-0.5 max-h-52 overflow-y-auto">
              {contacts.map(contact => (
                <button
                  key={contact.jid}
                  onClick={() => selectContact(contact)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                    selectedChat?.jid === contact.jid ? 'bg-[#075E54]/30' : 'hover:bg-gray-800/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#25D366]/20 flex items-center justify-center text-xs font-medium text-green-300">
                    {contact.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-200 truncate">{contact.name}</p>
                    <p className="text-[10px] text-gray-500 truncate font-mono">
                      {contact.phone || contact.jid.replace('@s.whatsapp.net', '')}
                    </p>
                  </div>
                </button>
              ))}
              {contacts.length === 0 && (
                <p className="text-[11px] text-gray-500 text-center py-4">
                  {wsConnected ? 'Carregando contatos...' : 'Conectando ao wacli-bridge...'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Messages Area ─── */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.02\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      >
        {messages.length === 0 && selectedChat && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm text-gray-400">Chat com {selectedChat.name}</p>
            <p className="text-[10px] text-gray-600 mt-1">Mensagens aparecerão aqui</p>
          </div>
        )}

        {!selectedChat && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3">📱</div>
            <p className="text-sm text-gray-400">Selecione um contato</p>
            <p className="text-[10px] text-gray-600 mt-1">Clique em 👥 para ver os contatos</p>
          </div>
        )}

        {messages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className={`flex ${msg.direction === 'sent' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[78%] rounded-xl px-3 py-2 ${
                msg.direction === 'sent'
                  ? 'bg-[#005C4B] text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-100 rounded-bl-sm'
              }`}
            >
              {msg.direction === 'received' && msg.fromName && msg.fromName !== selectedChat?.name && (
                <p className="text-[9px] text-[#25D366] font-medium mb-0.5">{msg.fromName}</p>
              )}
              <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              <div className={`flex items-center gap-1 mt-0.5 ${msg.direction === 'sent' ? 'justify-end' : ''}`}>
                <span className="text-[9px] text-gray-400">{formatTime(msg.timestamp)}</span>
                {msg.direction === 'sent' && (
                  <span className={`text-[9px] ${msg.status === 'read' ? 'text-blue-400' : 'text-gray-400'}`}>
                    {statusIcon(msg.status)}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area ─── */}
      <div className="bg-gray-800/80 px-3 py-2.5 border-t border-gray-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={selectedChat ? `Mensagem para ${selectedChat.name}...` : 'Selecione um contato'}
            className="flex-1 bg-gray-900/80 border border-gray-700/50 rounded-full px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#25D366]/50 transition-colors"
            disabled={!selectedChat}
          />
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || !selectedChat}
            className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center text-white hover:bg-[#22c55e] transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[9px] text-gray-600">
            via <span className="text-[#25D366]/70 font-mono">wacli</span>
            {status?.mode === 'demo' && <span className="text-yellow-500/70 ml-1">· modo demo</span>}
          </p>
          {!wsConnected && (
            <button
              onClick={() => wacliClient.connect()}
              className="text-[9px] text-yellow-400 hover:text-yellow-300"
            >
              🔄 Reconectar
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── FAB Button ──────────────────────────────────────────────────────────────

export function WhatsAppFAB({ onClick, unread = 0 }: { onClick: () => void; unread?: number }) {
  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg z-[99] hover:bg-[#22c55e] transition-colors"
      style={{ boxShadow: '0 4px 15px rgba(37,211,102,0.4)' }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </motion.button>
  );
}
