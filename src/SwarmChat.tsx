/**
 * SwarmChat — Chat trilíngue do enxame de agentes.
 * Os robôs reportam em português, inglês e chinês quando pegam e completam tarefas.
 * Funciona 100% local, sem dependência de WebSocket/MCP externo.
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Lang = 'pt' | 'en' | 'zh';

export interface SwarmMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;        // PT
  textEn?: string;     // EN
  textZh?: string;     // ZH
  timestamp: number;
  type: 'user' | 'agent' | 'system';
  agentColor?: string;
  taskId?: string;
  action?: 'pick' | 'done' | 'create' | 'info' | 'progress';
}

type AgentSkill = 'dev' | 'database' | 'billing' | 'frontend' | 'backend' | 'devops' | 'design';
type ColumnId = 'backlog' | 'todo' | 'doing' | 'testes' | 'review' | 'done';

export interface TaskFromChat {
  title: string;
  skill: AgentSkill;
  column: ColumnId;
  priority: number;
  description: string;
}

interface SwarmChatProps {
  messages: SwarmMessage[];
  onSendMessage: (text: string) => void;
  onCreateTask: (task: TaskFromChat) => void;
  onClose: () => void;
}

// ─── Language Config ─────────────────────────────────────────────────────────

const LANG_CONFIG: Record<Lang, { flag: string; label: string; placeholder: string; tipPrefix: string; tipBody: string }> = {
  pt: { flag: '🇧🇷', label: 'PT', placeholder: 'Converse com os robôs ou crie tarefas...', tipPrefix: 'criar:', tipBody: 'nome da tarefa · ou converse normalmente' },
  en: { flag: '🇺🇸', label: 'EN', placeholder: 'Chat with the robots or create tasks...', tipPrefix: 'create:', tipBody: 'task name · or just chat with the swarm' },
  zh: { flag: '🇨🇳', label: 'ZH', placeholder: '与机器人聊天或创建任务...', tipPrefix: '创建：', tipBody: '任务名称 · 或与蜂群聊天' },
};

// ─── Quick Task Parser ───────────────────────────────────────────────────────

function parseTaskFromText(text: string): TaskFromChat | null {
  const match = text.match(/^(?:criar|nova\s*tarefa|tarefa|task|add|create|创建|新任务)[\s:：]+(.+)/i);
  if (!match) return null;

  const title = match[1].trim();
  const lower = title.toLowerCase();

  let skill: AgentSkill = 'dev';
  if (lower.match(/front|react|tela|botão|interface|css|ui|layout|界面|前端/)) skill = 'frontend';
  else if (lower.match(/back|api|server|rota|endpoint|python|fastapi|后端|服务器/)) skill = 'backend';
  else if (lower.match(/banco|dados|base|chroma|sql|query|bd|数据|数据库/)) skill = 'database';
  else if (lower.match(/deploy|docker|ec2|nginx|servidor|infra|部署|运维/)) skill = 'devops';
  else if (lower.match(/design|visual|icone|arte|imagem|logo|设计|视觉/)) skill = 'design';

  let priority = 2;
  if (lower.match(/urgente|crítico|p1|bloqueante|urgent|critical|紧急/)) priority = 1;
  else if (lower.match(/baixa|p4|depois|low|later|低优先/)) priority = 4;
  else if (lower.match(/média|p3|normal|medium|中等/)) priority = 3;

  return { title, skill, column: 'todo', priority, description: '' };
}

// ─── Get message text by language ────────────────────────────────────────────

function getMessageText(msg: SwarmMessage, lang: Lang): string {
  switch (lang) {
    case 'en': return msg.textEn || msg.text;
    case 'zh': return msg.textZh || msg.text;
    default: return msg.text;
  }
}

// ─── Message Content Renderer (code blocks) ─────────────────────────────────

function MessageContent({ text }: { text: string }) {
  // Split by code fences: ```lang\ncode\n```
  const parts = text.split(/(```[\s\S]*?```)/g);

  if (parts.length === 1) {
    // No code blocks, render as plain text
    return <p className="text-[12px] leading-relaxed whitespace-pre-wrap text-gray-100">{text}</p>;
  }

  return (
    <div className="space-y-1.5">
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n([\s\S]*?)\n?```$/);
        if (codeMatch) {
          const language = codeMatch[1] || 'code';
          const code = codeMatch[2];
          return (
            <div key={i} className="rounded-lg overflow-hidden border border-gray-700/50 mt-1.5">
              <div className="bg-gray-950/80 px-2.5 py-1 flex items-center justify-between border-b border-gray-700/40">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60" />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-[9px] text-gray-500 font-mono ml-1">{language}</span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  className="text-[8px] text-gray-500 hover:text-gray-300 transition-colors"
                  title="Copiar"
                >
                  📋
                </button>
              </div>
              <pre className="px-2.5 py-2 overflow-x-auto bg-gray-950/60 max-h-[200px] overflow-y-auto">
                <code className="text-[10px] text-green-300 font-mono leading-relaxed whitespace-pre">{code}</code>
              </pre>
            </div>
          );
        }
        // Regular text
        if (part.trim()) {
          return <p key={i} className="text-[12px] leading-relaxed whitespace-pre-wrap text-gray-100">{part}</p>;
        }
        return null;
      })}
    </div>
  );
}

// ─── Chat Component ──────────────────────────────────────────────────────────

export function SwarmChat({ messages, onSendMessage, onCreateTask, onClose }: SwarmChatProps) {
  const [inputText, setInputText] = useState('');
  const [lang, setLang] = useState<Lang>('pt');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();

    const task = parseTaskFromText(text);
    if (task) {
      onCreateTask(task);
    } else {
      onSendMessage(text);
    }
    setInputText('');
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const getActionEmoji = (action?: string) => {
    switch (action) {
      case 'pick': return '🎯';
      case 'done': return '✅';
      case 'create': return '➕';
      case 'progress': return '⚡';
      case 'info': return '💬';
      default: return '';
    }
  };

  const cfg = LANG_CONFIG[lang];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-6 right-6 w-[440px] h-[600px] bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-[100]"
      style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.15)' }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-purple-900 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-lg">🐝</div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              {lang === 'pt' ? 'Chat do Enxame' : lang === 'en' ? 'Swarm Chat' : '蜂群聊天'}
            </h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-blue-200">
                {lang === 'pt' ? 'Robôs ativos · trilíngue' : lang === 'en' ? 'Robots active · trilingual' : '机器人活跃 · 三语'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Language Selector */}
          <div className="flex items-center bg-white/10 rounded-full p-0.5">
            {(['pt', 'en', 'zh'] as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-all ${
                  lang === l ? 'bg-white/20 text-white font-medium' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {LANG_CONFIG[l].flag}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">×</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-sm text-gray-400">
              {lang === 'pt' ? 'Chat do Enxame' : lang === 'en' ? 'Swarm Chat' : '蜂群聊天'}
            </p>
            <p className="text-[10px] text-gray-500 mt-2 leading-relaxed max-w-[280px]">
              {lang === 'pt' && 'Os robôs reportam aqui em 🇧🇷 PT, 🇺🇸 EN e 🇨🇳 ZH quando pegam e completam tarefas.'}
              {lang === 'en' && 'Robots report here in 🇧🇷 PT, 🇺🇸 EN and 🇨🇳 ZH when they pick and complete tasks.'}
              {lang === 'zh' && '机器人在此以 🇧🇷 葡语、🇺🇸 英语和 🇨🇳 中文报告任务进展。'}
            </p>
          </div>
        )}

        {messages.map(msg => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.type !== 'user' && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] mr-2 shrink-0 mt-1"
                style={{ backgroundColor: msg.agentColor ? `${msg.agentColor}30` : '#374151' }}>
                {msg.type === 'system' ? '⚙️' : '🤖'}
              </div>
            )}
            <div className={`max-w-[80%] rounded-xl px-3 py-2 ${
              msg.type === 'system'
                ? 'bg-gray-800/50 border border-gray-700/30'
                : msg.type === 'user'
                  ? 'bg-blue-600/80 text-white rounded-br-sm'
                  : 'bg-gray-800/80 text-gray-100 rounded-bl-sm border border-gray-700/30'
            }`}
              style={msg.type === 'agent' && msg.agentColor ? { borderLeftColor: msg.agentColor, borderLeftWidth: '3px' } : {}}
            >
              {msg.type === 'agent' && (
                <p className="text-[9px] font-medium mb-0.5 flex items-center gap-1" style={{ color: msg.agentColor || '#9CA3AF' }}>
                  {getActionEmoji(msg.action)} {msg.fromName}
                  {msg.taskId && <span className="text-gray-500 font-mono">· {msg.taskId}</span>}
                </p>
              )}
              {msg.type === 'system' && (
                <p className="text-[9px] text-gray-500 font-medium mb-0.5">{getActionEmoji(msg.action)} {lang === 'pt' ? 'Sistema' : lang === 'en' ? 'System' : '系统'}</p>
              )}
              <MessageContent text={getMessageText(msg, lang)} />
              <div className={`flex items-center gap-1 mt-0.5 ${msg.type === 'user' ? 'justify-end' : ''}`}>
                <span className="text-[9px] text-gray-500">{formatTime(msg.timestamp)}</span>
                {/* Show all 3 flags for trilingual messages */}
                {msg.type === 'agent' && msg.textEn && msg.textZh && (
                  <span className="text-[8px] text-gray-600 ml-1">🇧🇷🇺🇸🇨🇳</span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="bg-gray-800/80 px-3 py-2.5 border-t border-gray-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={cfg.placeholder}
            className="flex-1 bg-gray-900/80 border border-gray-700/50 rounded-full px-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
        <p className="text-[9px] text-gray-600 mt-1.5 px-1">
          💡 <span className="text-blue-400/70">{cfg.tipPrefix}</span> {cfg.tipBody}
        </p>
      </div>
    </motion.div>
  );
}

// ─── FAB Button ──────────────────────────────────────────────────────────────

export function SwarmChatFAB({ onClick, unread = 0 }: { onClick: () => void; unread?: number }) {
  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg z-[99] hover:from-blue-500 hover:to-purple-500 transition-all"
      style={{ boxShadow: '0 4px 15px rgba(59,130,246,0.4)' }}
    >
      <span className="text-2xl">🐝</span>
      {unread > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center"
        >
          {unread > 9 ? '9+' : unread}
        </motion.span>
      )}
    </motion.button>
  );
}
