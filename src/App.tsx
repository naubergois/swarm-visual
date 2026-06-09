import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { mcpClient, type McpCard, type McpToolInfo } from './mcpClient';
import { soundPickTask, soundTaskDone, soundMcpConnected, soundError, resumeAudio } from './sounds';
import { SwarmChat, SwarmChatFAB, type SwarmMessage } from './SwarmChat';
import { generateCodeWithDeepSeek } from './deepseekClient';
import roboIcon from './assets/robo-nordestino-chines.png';
import './App.css';

// ============================================================
// TYPES
// ============================================================
type AgentStatus = 'idle' | 'picking' | 'working' | 'done';
type AgentSkill = 'dev' | 'database' | 'billing' | 'frontend' | 'backend' | 'devops' | 'design';

interface Agent {
  id: string;
  name: string;
  skill: AgentSkill;
  color: string;
  status: AgentStatus;
  currentTask: string | null;
  progress: number;
  tasksDone: number;
}

interface TaskResult {
  agentName: string;
  agentSkill: AgentSkill;
  completedAt: number;
  duration: number; // ms
  code?: string;
  language?: string;
  output?: string;
  summary: string;
}

interface Task {
  id: string;
  title: string;
  column: ColumnId;
  priority: number;
  skill: AgentSkill;
  assignees?: string[];
  description?: string;
  result?: TaskResult;
}

type ColumnId = 'backlog' | 'todo' | 'doing' | 'testes' | 'review' | 'done';

interface Column {
  id: ColumnId;
  title: string;
  tasks: Task[];
}

type McpServerStatus = 'online' | 'offline' | 'disabled' | 'error' | 'connecting';

interface McpServerInfo {
  id: string;
  name: string;
  command: string;
  status: McpServerStatus;
  tools: McpToolInfo[];
  icon: string;
  color: string;
  description: string;
}

// ============================================================
// DATA
// ============================================================
const INITIAL_AGENTS: Agent[] = [
  { id: 'a1', name: 'Robô Dev', skill: 'dev', color: '#3B82F6', status: 'idle', currentTask: null, progress: 0, tasksDone: 0 },
  { id: 'a2', name: 'Robô BD', skill: 'database', color: '#10B981', status: 'idle', currentTask: null, progress: 0, tasksDone: 0 },
  { id: 'a3', name: 'Robô Front', skill: 'frontend', color: '#F59E0B', status: 'idle', currentTask: null, progress: 0, tasksDone: 0 },
  { id: 'a4', name: 'Robô Back', skill: 'backend', color: '#8B5CF6', status: 'idle', currentTask: null, progress: 0, tasksDone: 0 },
  { id: 'a5', name: 'Robô Deploy', skill: 'devops', color: '#EF4444', status: 'idle', currentTask: null, progress: 0, tasksDone: 0 },
  { id: 'a6', name: 'Robô Visual', skill: 'design', color: '#EC4899', status: 'idle', currentTask: null, progress: 0, tasksDone: 0 },
];

// Fallback tasks para quando MCP está offline
const FALLBACK_TASKS: Task[] = [
  // ✅ Concluídos
  { id: 'TASK-001', title: 'Desenvolver Agente Colaborador USJ e CGE', column: 'done', priority: 1, skill: 'dev' },
  { id: 'TASK-002', title: 'Definir Escopo do Agente', column: 'done', priority: 1, skill: 'dev' },
  { id: 'TASK-004', title: 'Ícone do Robô Nordestino Chinês', column: 'done', priority: 1, skill: 'design' },
  { id: 'TASK-006', title: 'Coletar Documentação USJ e CGE', column: 'done', priority: 1, skill: 'database' },
  { id: 'TASK-007', title: 'Criar Base de Conhecimento com ChromaDB', column: 'done', priority: 2, skill: 'database' },
  { id: 'TASK-008', title: 'Implementar Motor RAG (rag_engine.py)', column: 'done', priority: 2, skill: 'backend' },
  { id: 'TASK-009', title: 'Criar Interface Web (Streamlit)', column: 'done', priority: 3, skill: 'frontend' },
  { id: 'TASK-010', title: 'Integrar com WhatsApp (wacli)', column: 'done', priority: 2, skill: 'backend' },
  { id: 'TASK-013', title: 'Configurar Ambiente Python e Dependências', column: 'done', priority: 1, skill: 'devops' },
  { id: 'TASK-015', title: 'Implementar Agente Conversacional com LangChain', column: 'done', priority: 1, skill: 'backend' },
  { id: 'TASK-017', title: 'Documentação Trilíngue (PT/EN/ZH)', column: 'done', priority: 2, skill: 'dev' },
  { id: 'TASK-019', title: '🧠 Swarm Visual — Arquitetura do Enxame', column: 'done', priority: 1, skill: 'dev' },
  { id: 'TASK-021', title: '📋 Swarm Visual — Kanban Board Interativo', column: 'done', priority: 1, skill: 'frontend' },
  { id: 'TASK-022', title: '🤖 Swarm Visual — Engine dos Agentes', column: 'done', priority: 1, skill: 'backend' },
  // ⚡ Em progresso
  { id: 'TASK-018', title: 'Deploy EC2 e Homologação', column: 'doing', priority: 1, skill: 'devops' },
  { id: 'TASK-026', title: 'Vídeo Demo com HeyGen', column: 'doing', priority: 2, skill: 'design' },
  // 📝 A fazer
  { id: 'TASK-027', title: 'Hermes — Daemon de Atualização Automática', column: 'todo', priority: 2, skill: 'backend' },
  { id: 'TASK-028', title: 'Testes de Integração Completos', column: 'todo', priority: 3, skill: 'dev' },
  { id: 'TASK-029', title: 'Monitoramento e Observabilidade', column: 'todo', priority: 3, skill: 'devops' },
  // 📋 Backlog
  { id: 'TASK-030', title: 'Multi-tenancy — Suporte a Múltiplas Equipes', column: 'backlog', priority: 4, skill: 'backend' },
  { id: 'TASK-031', title: 'Dashboard Analytics de Uso', column: 'backlog', priority: 4, skill: 'frontend' },
  { id: 'TASK-032', title: 'Integração com SIEC', column: 'backlog', priority: 4, skill: 'dev' },
];

const SKILL_COLORS: Record<string, string> = {
  dev: '#3B82F6', database: '#10B981', billing: '#F59E0B',
  frontend: '#F59E0B', backend: '#8B5CF6', devops: '#EF4444', design: '#EC4899',
};

const SKILL_LABELS: Record<string, string> = {
  dev: 'Dev', database: 'BD', billing: 'Billing',
  frontend: 'Front', backend: 'Back', devops: 'DevOps', design: 'Design',
};

// Mapear skills do MCP para skills do swarm
function mapMcpSkillToAgent(skills: string[], title: string): AgentSkill {
  const joined = [...skills, title.toLowerCase()].join(' ');
  if (joined.match(/front|react|streamlit|tailwind|ui|css|animacao|framer/)) return 'frontend';
  if (joined.match(/back|fastapi|rag|llm|langchain|websocket|python/)) return 'backend';
  if (joined.match(/chroma|database|bd|dados|embeddings|pgvector/)) return 'database';
  if (joined.match(/deploy|devops|docker|setup|ambiente|config/)) return 'devops';
  if (joined.match(/design|icone|visual|arte|video|heygen/)) return 'design';
  return 'dev';
}

// ============================================================
// ROBÔ SVG
// ============================================================
const RobotSVG = ({ color, size = 40, status }: { color: string; size?: number; status?: string }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <rect x="25" y="10" width="50" height="45" rx="10" fill={color} />
    <circle cx="38" cy="30" r="6" fill="white" />
    <circle cx="62" cy="30" r="6" fill="white" />
    <circle cx="38" cy="30" r="3" fill="#1F2937" />
    <circle cx="62" cy="30" r="3" fill="#1F2937" />
    <line x1="50" y1="10" x2="50" y2="0" stroke={color} strokeWidth="3" />
    <circle cx="50" cy="0" r="4" fill={color} />
    <rect x="30" y="5" width="40" height="4" rx="2" fill={color} opacity="0.7" />
    <rect x="30" y="58" width="40" height="25" rx="5" fill={color} opacity="0.8" />
    <rect x="10" y="60" width="15" height="8" rx="4" fill={color} opacity="0.6" />
    <rect x="75" y="60" width="15" height="8" rx="4" fill={color} opacity="0.6" />
    <path d="M45 75 Q50 80 55 75" stroke={color} strokeWidth="2" fill="none" />
    {status === 'working' && <text x="50" y="55" textAnchor="middle" fontSize="8" fill="white">⚙️</text>}
    {status === 'done' && <text x="50" y="55" textAnchor="middle" fontSize="8" fill="white">✅</text>}
  </svg>
);

// ============================================================
// ÍCONE ROBÔ NORDESTINO CHINÊS
// ============================================================
export const RoboNordestinoChines = ({ size = 80 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="28" rx="38" ry="8" fill="#8B4513" />
    <path d="M30 28 Q60 5 90 28" fill="#A0522D" stroke="#5C3317" strokeWidth="1.5" />
    <path d="M25 28 Q60 0 95 28" fill="none" stroke="#5C3317" strokeWidth="1" />
    <path d="M22 28 Q25 35 35 30" fill="#8B4513" stroke="#5C3317" strokeWidth="1" />
    <path d="M98 28 Q95 35 85 30" fill="#8B4513" stroke="#5C3317" strokeWidth="1" />
    <polygon points="60,12 62,17 67,17 63,20 64,25 60,22 56,25 57,20 53,17 58,17" fill="#FFD700" stroke="#DAA520" strokeWidth="0.5" />
    <line x1="35" y1="24" x2="85" y2="24" stroke="#DAA520" strokeWidth="1.5" />
    <circle cx="42" cy="24" r="1.5" fill="#FFD700" />
    <circle cx="52" cy="24" r="1.5" fill="#FFD700" />
    <circle cx="62" cy="24" r="1.5" fill="#FFD700" />
    <circle cx="72" cy="24" r="1.5" fill="#FFD700" />
    <circle cx="78" cy="24" r="1.5" fill="#FFD700" />
    <rect x="32" y="30" width="56" height="42" rx="12" fill="#E8E8E8" stroke="#B0B0B0" strokeWidth="1.5" />
    <circle cx="36" cy="50" r="3" fill="#A0A0A0" stroke="#808080" strokeWidth="1" />
    <circle cx="84" cy="50" r="3" fill="#A0A0A0" stroke="#808080" strokeWidth="1" />
    <path d="M42 47 Q50 42 58 47 Q50 50 42 47Z" fill="white" stroke="#333" strokeWidth="1.2" />
    <path d="M62 47 Q70 42 78 47 Q70 50 62 47Z" fill="white" stroke="#333" strokeWidth="1.2" />
    <circle cx="50" cy="47" r="2.5" fill="#1a1a1a" />
    <circle cx="70" cy="47" r="2.5" fill="#1a1a1a" />
    <circle cx="51" cy="46" r="1" fill="white" />
    <circle cx="71" cy="46" r="1" fill="white" />
    <circle cx="42" cy="56" r="4" fill="#FF6B6B" opacity="0.4" />
    <circle cx="78" cy="56" r="4" fill="#FF6B6B" opacity="0.4" />
    <path d="M52 60 Q60 66 68 60" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
    <line x1="60" y1="30" x2="60" y2="18" stroke="#888" strokeWidth="2" />
    <rect x="38" y="74" width="44" height="30" rx="8" fill="#D4D4D4" stroke="#A0A0A0" strokeWidth="1.5" />
    <rect x="50" y="78" width="20" height="20" rx="3" fill="#CC0000" stroke="#990000" strokeWidth="1" />
    <text x="60" y="93" textAnchor="middle" fontSize="14" fill="#FFD700" fontWeight="bold">福</text>
    <rect x="22" y="78" width="14" height="8" rx="4" fill="#C0C0C0" stroke="#999" strokeWidth="1" />
    <rect x="84" y="78" width="14" height="8" rx="4" fill="#C0C0C0" stroke="#999" strokeWidth="1" />
    <circle cx="20" cy="82" r="4" fill="#E0E0E0" stroke="#999" strokeWidth="1" />
    <circle cx="100" cy="82" r="4" fill="#E0E0E0" stroke="#999" strokeWidth="1" />
    <rect x="44" y="104" width="10" height="12" rx="3" fill="#B0B0B0" stroke="#888" strokeWidth="1" />
    <rect x="66" y="104" width="10" height="12" rx="3" fill="#B0B0B0" stroke="#888" strokeWidth="1" />
    <rect x="42" y="114" width="14" height="5" rx="2.5" fill="#999" />
    <rect x="64" y="114" width="14" height="5" rx="2.5" fill="#999" />
    <circle cx="46" cy="82" r="2" fill="#00FF88">
      <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
    </circle>
    <circle cx="46" cy="90" r="2" fill="#00BFFF">
      <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite" />
    </circle>
  </svg>
);

// ============================================================
// ANIMATED AGENT
// ============================================================
const AnimatedAgent = ({ agent, onClick }: { agent: Agent; onClick?: () => void }) => {
  const animProps: Record<string, unknown> = {};
  if (agent.status === 'picking') {
    animProps.animate = { y: [0, -10, 0], rotate: [0, -5, 5, 0] };
    animProps.transition = { repeat: Infinity, duration: 0.5 };
  } else if (agent.status === 'working') {
    animProps.animate = { rotate: [0, 360] };
    animProps.transition = { repeat: Infinity, duration: 2, ease: 'linear' };
  } else if (agent.status === 'done') {
    animProps.animate = { scale: [1, 1.2, 1] };
    animProps.transition = { duration: 0.3 };
  }

  return (
    <motion.div className="flex flex-col items-center gap-1 cursor-pointer" {...animProps} whileHover={{ scale: 1.1 }} onClick={onClick} layout>
      <div className="relative">
        <RobotSVG color={agent.color} size={44} status={agent.status} />
        <AnimatePresence>
          {agent.status === 'working' && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: -5 }} exit={{ opacity: 0 }} className="absolute -top-2 -right-2 w-4 h-4 bg-yellow-400 rounded-full text-[8px] flex items-center justify-center">⚡</motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="text-[10px] font-medium text-gray-300 whitespace-nowrap">{agent.name}</span>
      {agent.status === 'working' && (
        <div className="w-10 h-1 bg-gray-700 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ backgroundColor: agent.color }} initial={{ width: '0%' }} animate={{ width: `${agent.progress}%` }} transition={{ duration: 0.3 }} />
        </div>
      )}
      <span className="text-[8px] text-gray-500">{agent.tasksDone} ✅</span>
    </motion.div>
  );
};

// ============================================================
// MCP CARD COMPONENT
// ============================================================
const McpServerCard = ({ server }: { server: McpServerInfo }) => {
  const statusConfig: Record<McpServerStatus, { label: string; dotColor: string; bg: string }> = {
    online: { label: 'Online', dotColor: 'bg-green-400', bg: 'bg-green-400/10 text-green-300' },
    offline: { label: 'Offline', dotColor: 'bg-gray-500', bg: 'bg-gray-500/10 text-gray-400' },
    disabled: { label: 'Desabilitado', dotColor: 'bg-yellow-500', bg: 'bg-yellow-500/10 text-yellow-300' },
    error: { label: 'Erro', dotColor: 'bg-red-500', bg: 'bg-red-500/10 text-red-300' },
    connecting: { label: 'Conectando...', dotColor: 'bg-blue-400', bg: 'bg-blue-400/10 text-blue-300' },
  };
  const cfg = statusConfig[server.status];

  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.2 }}
      className="bg-gray-900/70 border border-gray-800/50 rounded-xl p-4 hover:border-gray-700/50 transition-colors relative overflow-hidden group">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" style={{ background: `radial-gradient(circle at top left, ${server.color}10, transparent 70%)` }} />
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ backgroundColor: `${server.color}20` }}>{server.icon}</div>
          <div>
            <h3 className="text-sm font-semibold text-gray-100">{server.name}</h3>
            <p className="text-[10px] text-gray-500 font-mono">{server.command}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bg}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} ${server.status === 'online' || server.status === 'connecting' ? 'animate-pulse' : ''}`} />
          {cfg.label}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mt-3 relative z-10">{server.description}</p>
      {server.tools.length > 0 && (
        <div className="mt-3 relative z-10">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">🔧 Ferramentas ({server.tools.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {server.tools.map(tool => (
              <span key={tool.name} title={tool.description} className="text-[9px] px-2 py-0.5 rounded-md bg-gray-800/80 text-gray-300 border border-gray-700/50 hover:border-gray-600 transition-colors cursor-default">{tool.name}</span>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ============================================================
// ADD TASK FORM
// ============================================================
const AddTaskForm = ({ onAdd, onClose }: { onAdd: (task: { title: string; description: string; column: ColumnId; priority: number; skill: AgentSkill }) => void; onClose: () => void }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [column, setColumn] = useState<ColumnId>('todo');
  const [priority, setPriority] = useState(2);
  const [skill, setSkill] = useState<AgentSkill>('dev');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), description: description.trim(), column, priority, skill });
    setTitle('');
    setDescription('');
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-2xl w-full max-w-md"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-100">➕ Nova Tarefa</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">✕</button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Título *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Descreva a tarefa..."
            className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wider">Descrição</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalhes opcionais..."
            rows={2}
            className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Coluna</label>
            <select value={column} onChange={e => setColumn(e.target.value as ColumnId)}
              className="w-full mt-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500">
              <option value="backlog">📋 Backlog</option>
              <option value="todo">📝 A Fazer</option>
              <option value="doing">⚡ Em Progresso</option>
              <option value="testes">🧪 Testes</option>
              <option value="review">👀 Revisão</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Prioridade</label>
            <select value={priority} onChange={e => setPriority(Number(e.target.value))}
              className="w-full mt-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500">
              <option value={1}>🔴 P1 — Crítica</option>
              <option value={2}>🟡 P2 — Alta</option>
              <option value={3}>🔵 P3 — Média</option>
              <option value={4}>⚪ P4 — Baixa</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wider">Skill</label>
            <select value={skill} onChange={e => setSkill(e.target.value as AgentSkill)}
              className="w-full mt-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-blue-500">
              <option value="dev">💻 Dev</option>
              <option value="frontend">🎨 Frontend</option>
              <option value="backend">⚙️ Backend</option>
              <option value="database">🗄️ Database</option>
              <option value="devops">🚀 DevOps</option>
              <option value="design">🎯 Design</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={!title.trim()}
            className="flex-1 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Criar Tarefa
          </button>
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            Cancelar
          </button>
        </div>
      </form>
    </motion.div>
  );
};

// ============================================================
// GENERATED CODE TEMPLATES (simulação de resultado dos agentes)
// ============================================================
const CODE_TEMPLATES: Record<AgentSkill, { code: string; language: string; output: string }[]> = {
  frontend: [
    {
      language: 'tsx',
      code: `import { useState } from 'react';
import { motion } from 'framer-motion';

export function Dashboard() {
  const [data, setData] = useState<Metric[]>([]);

  useEffect(() => {
    fetch('/api/metrics').then(r => r.json()).then(setData);
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="grid grid-cols-3 gap-4 p-6">
      {data.map(m => (
        <MetricCard key={m.id} value={m.value} label={m.label} />
      ))}
    </motion.div>
  );
}`,
      output: '✅ Componente Dashboard criado com sucesso\n📦 Bundle size: 2.3KB gzipped\n🧪 3 testes passando',
    },
    {
      language: 'tsx',
      code: `export function KanbanColumn({ column, tasks, onDrop }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { onDrop(e); setIsDragOver(false); }}
      className={\`rounded-xl p-4 min-h-[400px] transition-colors \${
        isDragOver ? 'bg-blue-500/10 border-blue-500' : 'bg-gray-900/50'
      }\`}
    >
      <h3 className="font-bold text-sm mb-3">{column.title}</h3>
      {tasks.map(task => <TaskCard key={task.id} task={task} />)}
    </div>
  );
}`,
      output: '✅ Drag & Drop implementado\n🎯 Responsivo: mobile + desktop\n🧪 Testes E2E passando',
    },
  ],
  backend: [
    {
      language: 'python',
      code: `from langchain.chains import RetrievalQA
from langchain_community.vectorstores import Chroma
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

class RAGEngine:
    def __init__(self, persist_dir: str = "./chroma_db"):
        self.embeddings = OpenAIEmbeddings()
        self.vectorstore = Chroma(
            persist_directory=persist_dir,
            embedding_function=self.embeddings
        )
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
        self.chain = RetrievalQA.from_chain_type(
            llm=self.llm,
            retriever=self.vectorstore.as_retriever(search_kwargs={"k": 5}),
            return_source_documents=True,
        )

    async def query(self, question: str) -> dict:
        result = await self.chain.ainvoke({"query": question})
        return {
            "answer": result["result"],
            "sources": [doc.metadata for doc in result["source_documents"]]
        }`,
      output: '✅ RAG Engine implementado com LangChain\n📊 Latência média: 1.2s\n🔍 Precisão retrieval: 92%',
    },
    {
      language: 'python',
      code: `from fastapi import FastAPI, WebSocket
from pydantic import BaseModel
import asyncio

app = FastAPI(title="USJ Agent API")

class MessageRequest(BaseModel):
    text: str
    chat_id: str
    context: dict = {}

@app.post("/api/chat")
async def chat(req: MessageRequest):
    response = await agent.process(req.text, req.context)
    return {"reply": response.text, "sources": response.sources}

@app.websocket("/ws/stream")
async def stream(ws: WebSocket):
    await ws.accept()
    async for chunk in agent.stream(await ws.receive_text()):
        await ws.send_json({"chunk": chunk})`,
      output: '✅ API REST + WebSocket implementada\n🚀 FastAPI rodando em :8000\n📡 Streaming de respostas ativo',
    },
  ],
  database: [
    {
      language: 'python',
      code: `import chromadb
from chromadb.config import Settings

class KnowledgeBase:
    def __init__(self):
        self.client = chromadb.PersistentClient(
            path="./chroma_db",
            settings=Settings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
            name="usj_docs",
            metadata={"hnsw:space": "cosine"}
        )

    def ingest(self, documents: list[dict]):
        self.collection.upsert(
            ids=[d["id"] for d in documents],
            documents=[d["text"] for d in documents],
            metadatas=[d.get("metadata", {}) for d in documents],
        )
        return len(documents)

    def search(self, query: str, n_results: int = 5):
        results = self.collection.query(
            query_texts=[query], n_results=n_results
        )
        return results["documents"][0]`,
      output: '✅ ChromaDB configurado com persistência\n📚 1,247 documentos indexados\n⚡ Busca vetorial < 50ms',
    },
  ],
  devops: [
    {
      language: 'yaml',
      code: `# docker-compose.yml — Deploy Stack USJ/ASESI
version: "3.9"
services:
  agent:
    build: ./agente-usj-cge
    ports: ["8000:8000"]
    environment:
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
      - CHROMA_HOST=chromadb
    depends_on: [chromadb]
    restart: unless-stopped
    deploy:
      resources:
        limits: { memory: 512M, cpus: "0.5" }

  chromadb:
    image: chromadb/chroma:latest
    ports: ["8001:8000"]
    volumes: ["chroma_data:/chroma/chroma"]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl

volumes:
  chroma_data:`,
      output: '✅ Stack Docker criada com sucesso\n🐳 3 containers configurados\n🔒 SSL/TLS habilitado\n📊 Limites de recursos definidos',
    },
    {
      language: 'bash',
      code: `#!/bin/bash
# deploy-code.sh — Deploy automatizado para EC2
set -euo pipefail

INSTANCE_IP=$(cat .ec2-info | grep IP | cut -d= -f2)
KEY_FILE="./usj-asesi-key.pem"
APP_DIR="/opt/usj-agent"

echo "🚀 Deploying to $INSTANCE_IP..."

# Sync código
rsync -avz --exclude='node_modules' --exclude='.git' \\
  -e "ssh -i $KEY_FILE" \\
  ./agente-usj-cge/ ubuntu@$INSTANCE_IP:$APP_DIR/

# Rebuild e restart
ssh -i $KEY_FILE ubuntu@$INSTANCE_IP << 'EOF'
  cd /opt/usj-agent
  docker compose pull
  docker compose up -d --build
  docker compose logs --tail=20
EOF

echo "✅ Deploy concluído!"`,
      output: '✅ Deploy executado com sucesso\n📦 Código sincronizado via rsync\n🐳 Containers rebuilt e rodando\n🌐 Aplicação disponível em https://usj.asesi.ce.gov.br',
    },
  ],
  design: [
    {
      language: 'svg',
      code: `<svg width="120" height="120" viewBox="0 0 120 120" fill="none">
  <!-- Robô Nordestino Chinês — Ícone do Projeto -->
  <rect x="32" y="30" width="56" height="42" rx="12"
    fill="#E8E8E8" stroke="#B0B0B0" stroke-width="1.5"/>
  <!-- Olhos estilo chinês -->
  <path d="M42 47 Q50 42 58 47 Q50 50 42 47Z"
    fill="white" stroke="#333" stroke-width="1.2"/>
  <path d="M62 47 Q70 42 78 47 Q70 50 62 47Z"
    fill="white" stroke="#333" stroke-width="1.2"/>
  <!-- Chapéu de couro -->
  <ellipse cx="60" cy="28" rx="38" ry="8" fill="#8B4513"/>
  <path d="M30 28 Q60 5 90 28" fill="#A0522D"/>
  <!-- Ideograma 福 (sorte) -->
  <rect x="50" y="78" width="20" height="20" rx="3"
    fill="#CC0000" stroke="#990000"/>
  <text x="60" y="93" text-anchor="middle"
    font-size="14" fill="#FFD700" font-weight="bold">福</text>
</svg>`,
      output: '✅ Ícone SVG criado (120x120)\n🎨 Palette: Sertanejo + Oriental\n📐 Viewbox otimizado para favicon',
    },
  ],
  dev: [
    {
      language: 'typescript',
      code: `/**
 * Swarm Coordinator — Orquestra os agentes do enxame.
 * Distribui tarefas baseado em skill matching e prioridade.
 */
export class SwarmCoordinator {
  private agents: Agent[] = [];
  private queue: Task[] = [];

  constructor(agents: Agent[]) {
    this.agents = agents;
  }

  async dispatch(task: Task): Promise<TaskResult> {
    const agent = this.findBestAgent(task);
    if (!agent) throw new Error('Nenhum agente disponível');

    agent.status = 'working';
    agent.currentTask = task.id;

    const startTime = Date.now();
    const result = await agent.execute(task);
    const duration = Date.now() - startTime;

    agent.status = 'idle';
    agent.tasksDone++;

    return { ...result, duration, agentName: agent.name };
  }

  private findBestAgent(task: Task): Agent | null {
    const available = this.agents.filter(a => a.status === 'idle');
    const matching = available.filter(a => a.skill === task.skill);
    return matching[0] ?? available[0] ?? null;
  }
}`,
      output: '✅ SwarmCoordinator implementado\n🤖 6 agentes registrados\n📊 Skill matching ativo\n⚡ Dispatch médio: 12ms',
    },
    {
      language: 'typescript',
      code: `import { McpClient } from './mcpClient';

/**
 * Task Runner — Executa tarefas e coleta resultados.
 * Integra com MCP server para persistir cards.
 */
export async function runTask(
  task: Task,
  mcp: McpClient
): Promise<TaskResult> {
  // 1. Atualizar status no MCP
  await mcp.moveCard(task.id, 'doing');

  // 2. Executar baseado no tipo
  const result = await executeBySkill(task);

  // 3. Salvar resultado
  await mcp.moveCard(task.id, 'done');
  await mcp.addNote(task.id, result.summary);

  return result;
}

async function executeBySkill(task: Task): Promise<TaskResult> {
  switch (task.skill) {
    case 'frontend': return buildComponent(task);
    case 'backend': return buildEndpoint(task);
    case 'database': return migrateSchema(task);
    case 'devops': return deployService(task);
    default: return { summary: 'Task completed', code: '' };
  }
}`,
      output: '✅ Task Runner integrado com MCP\n🔄 Pipeline: doing → done\n📝 Notas salvas automaticamente',
    },
  ],
  billing: [
    {
      language: 'typescript',
      code: `// Billing module placeholder
export function calculateCost(usage: Usage): number {
  return usage.tokens * 0.00001 + usage.requests * 0.001;
}`,
      output: '✅ Módulo billing criado',
    },
  ],
};

export function _generateTaskResult(task: Task, agentName: string, agentSkill: AgentSkill, duration: number): TaskResult {
  const templates = CODE_TEMPLATES[agentSkill] || CODE_TEMPLATES['dev'];
  const template = templates[Math.floor(Math.random() * templates.length)];
  return {
    agentName,
    agentSkill,
    completedAt: Date.now(),
    duration,
    code: template.code,
    language: template.language,
    output: template.output,
    summary: `Tarefa "${task.title}" concluída por ${agentName} em ${(duration / 1000).toFixed(1)}s`,
  };
}

// ============================================================
// TASK DETAIL MODAL (mostra resultado + código fonte)
// ============================================================
const TaskDetailModal = ({ task, onClose }: { task: Task; onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState<'resultado' | 'codigo'>('resultado');
  const result = task.result;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-800/50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">{task.id}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                task.column === 'done' ? 'bg-green-500/15 text-green-300' :
                task.column === 'doing' ? 'bg-yellow-500/15 text-yellow-300' :
                'bg-blue-500/15 text-blue-300'
              }`}>
                {task.column}
              </span>
              <span className={`text-[10px] font-medium ${task.priority === 1 ? 'text-red-400' : task.priority === 2 ? 'text-yellow-400' : 'text-blue-400'}`}>P{task.priority}</span>
            </div>
            <h2 className="text-base font-bold text-gray-100 leading-tight">{task.title}</h2>
            {task.description && <p className="text-xs text-gray-400 mt-1">{task.description}</p>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none ml-4">✕</button>
        </div>

        {/* Result info bar */}
        {result && (
          <div className="px-5 py-3 bg-gray-800/30 border-b border-gray-800/50 flex items-center gap-4 shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: `${SKILL_COLORS[result.agentSkill]}30` }}>
                <span style={{ color: SKILL_COLORS[result.agentSkill] }}>🤖</span>
              </div>
              <span className="text-xs text-gray-300">{result.agentName}</span>
            </div>
            <span className="text-[10px] text-gray-500">⏱ {(result.duration / 1000).toFixed(1)}s</span>
            <span className="text-[10px] text-gray-500">📅 {new Date(result.completedAt).toLocaleString('pt-BR')}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-300">✅ Concluído</span>
          </div>
        )}

        {/* Tabs */}
        {result && (
          <div className="flex border-b border-gray-800/50 shrink-0">
            <button
              onClick={() => setActiveTab('resultado')}
              className={`px-5 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'resultado' ? 'text-blue-300 border-b-2 border-blue-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              📋 Resultado
            </button>
            <button
              onClick={() => setActiveTab('codigo')}
              className={`px-5 py-2.5 text-xs font-medium transition-colors ${
                activeTab === 'codigo' ? 'text-green-300 border-b-2 border-green-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              💻 Código Fonte
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {!result && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-4xl mb-3">🔄</div>
              <p className="text-sm">Tarefa ainda não executada por um agente</p>
              <p className="text-[10px] mt-1">Mova para "A Fazer" e o enxame começará a trabalhar</p>
            </div>
          )}

          {result && activeTab === 'resultado' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/30">
                <h4 className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Resumo da Execução</h4>
                <p className="text-sm text-gray-200">{result.summary}</p>
              </div>

              {/* Output */}
              {result.output && (
                <div className="bg-gray-950/80 rounded-xl p-4 border border-gray-700/30">
                  <h4 className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Output do Agente</h4>
                  <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">{result.output}</pre>
                </div>
              )}

              {/* Meta */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-800/30 rounded-lg p-3 text-center">
                  <div className="text-lg mb-1">⏱</div>
                  <div className="text-xs text-gray-300 font-medium">{(result.duration / 1000).toFixed(1)}s</div>
                  <div className="text-[9px] text-gray-500">Tempo</div>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-3 text-center">
                  <div className="text-lg mb-1">🤖</div>
                  <div className="text-xs text-gray-300 font-medium">{result.agentName}</div>
                  <div className="text-[9px] text-gray-500">Agente</div>
                </div>
                <div className="bg-gray-800/30 rounded-lg p-3 text-center">
                  <div className="text-lg mb-1" style={{ color: SKILL_COLORS[result.agentSkill] }}>●</div>
                  <div className="text-xs text-gray-300 font-medium">{SKILL_LABELS[result.agentSkill]}</div>
                  <div className="text-[9px] text-gray-500">Skill</div>
                </div>
              </div>
            </div>
          )}

          {result && activeTab === 'codigo' && (
            <div className="space-y-3">
              {/* Language badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 font-mono">
                    {result.language || 'text'}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {result.code ? result.code.split('\n').length : 0} linhas
                  </span>
                </div>
                <button
                  onClick={() => { if (result.code) navigator.clipboard.writeText(result.code); }}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  📋 Copiar
                </button>
              </div>

              {/* Code block */}
              <div className="bg-gray-950 rounded-xl border border-gray-800/50 overflow-hidden">
                <div className="bg-gray-900/80 px-4 py-2 border-b border-gray-800/50 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-[10px] text-gray-500 ml-2 font-mono">{task.id.toLowerCase()}.{result.language}</span>
                </div>
                <pre className="p-4 overflow-x-auto">
                  <code className="text-[11px] text-gray-200 font-mono leading-relaxed whitespace-pre">
                    {result.code || '// Sem código fonte disponível'}
                  </code>
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800/50 flex items-center justify-between shrink-0">
          <span className="text-[9px] text-gray-600">
            Skill: <span style={{ color: SKILL_COLORS[task.skill] }}>{SKILL_LABELS[task.skill]}</span>
            {task.assignees && task.assignees.length > 0 && ` · Assignees: ${task.assignees.join(', ')}`}
          </span>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            Fechar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ============================================================
// ROBOT CHAT RESPONSES — Gerador de respostas trilíngues dos robôs
// ============================================================
interface AgentLike { name: string; skill: string; color: string; }

interface TrilingualResponse {
  pt: string;
  en: string;
  zh: string;
}

const ROBOT_RESPONSES: Record<string, TrilingualResponse[]> = {
  dev: [
    { pt: 'Analisei o código e posso ajudar com isso! Vou criar uma branch e trabalhar na implementação.', en: 'I analyzed the code and can help with that! I\'ll create a branch and work on the implementation.', zh: '我分析了代码，可以帮助处理这个！我将创建一个分支并进行实现。' },
    { pt: 'Boa pergunta! Do ponto de vista de arquitetura, sugiro separar em módulos menores.', en: 'Great question! From an architecture perspective, I suggest splitting into smaller modules.', zh: '好问题！从架构角度来看，我建议拆分为更小的模块。' },
    { pt: 'Já passei por isso antes. A solução é usar um padrão de Observer para desacoplar os componentes.', en: 'I\'ve been through this before. The solution is to use an Observer pattern to decouple components.', zh: '我以前遇到过这种情况。解决方案是使用观察者模式来解耦组件。' },
    { pt: 'Vou rodar os testes e verificar. Geralmente esse tipo de problema é de tipagem.', en: 'I\'ll run the tests and check. Usually this type of problem is a typing issue.', zh: '我将运行测试并检查。通常这类问题是类型问题。' },
    { pt: 'Posso refatorar isso rapidinho. Vou aplicar o princípio de responsabilidade única.', en: 'I can refactor this quickly. I\'ll apply the single responsibility principle.', zh: '我可以快速重构这个。我将应用单一职责原则。' },
  ],
  frontend: [
    { pt: 'Pelo lado da interface, posso melhorar a UX com uma animação suave usando Framer Motion! 🎨', en: 'On the UI side, I can improve the UX with a smooth animation using Framer Motion! 🎨', zh: '在界面方面，我可以使用Framer Motion添加流畅动画来提升用户体验！🎨' },
    { pt: 'Vou criar o componente com Tailwind. Fica responsivo e bonito.', en: 'I\'ll create the component with Tailwind. It\'ll be responsive and beautiful.', zh: '我将用Tailwind创建组件。它将是响应式且美观的。' },
    { pt: 'Sugiro usar um estado local com useState e elevar só o que precisar.', en: 'I suggest using local state with useState and lifting only what\'s needed.', zh: '我建议使用useState管理本地状态，只提升必要的内容。' },
    { pt: 'A acessibilidade é importante! Vou garantir que tenha aria-labels e contraste adequado.', en: 'Accessibility is important! I\'ll make sure it has aria-labels and proper contrast.', zh: '无障碍访问很重要！我会确保有aria标签和适当的对比度。' },
    { pt: 'Posso fazer um protótipo rápido com React. Mando o preview em 5 minutos!', en: 'I can make a quick prototype with React. I\'ll send the preview in 5 minutes!', zh: '我可以用React快速做一个原型。5分钟内发送预览！' },
  ],
  backend: [
    { pt: 'Pelo backend, vou criar uma rota FastAPI com validação de dados via Pydantic.', en: 'On the backend, I\'ll create a FastAPI route with data validation via Pydantic.', zh: '在后端，我将创建一个带有Pydantic数据验证的FastAPI路由。' },
    { pt: 'O RAG engine pode processar isso. Vou ajustar o prompt para ser mais específico.', en: 'The RAG engine can process this. I\'ll adjust the prompt to be more specific.', zh: 'RAG引擎可以处理这个。我将调整提示词使其更具体。' },
    { pt: 'Sugiro cachear essa resposta com Redis para melhorar a performance.', en: 'I suggest caching this response with Redis to improve performance.', zh: '我建议使用Redis缓存此响应以提高性能。' },
    { pt: 'Vou implementar um endpoint assíncrono. O LangChain vai processar em background.', en: 'I\'ll implement an async endpoint. LangChain will process in the background.', zh: '我将实现一个异步端点。LangChain将在后台处理。' },
    { pt: 'A integração com a API está quase pronta. Só falta configurar o middleware de auth.', en: 'The API integration is almost ready. Just need to configure the auth middleware.', zh: 'API集成即将完成。只需配置认证中间件。' },
  ],
  database: [
    { pt: 'Posso otimizar essa query! Vou adicionar um índice no campo de busca. 🗄️', en: 'I can optimize that query! I\'ll add an index on the search field. 🗄️', zh: '我可以优化这个查询！我将在搜索字段上添加索引。🗄️' },
    { pt: 'O ChromaDB já tem esses embeddings. Vou fazer uma busca semântica para encontrar.', en: 'ChromaDB already has those embeddings. I\'ll do a semantic search to find them.', zh: 'ChromaDB已经有这些嵌入向量了。我将进行语义搜索来查找。' },
    { pt: 'Sugiro normalizar essa tabela. Vai melhorar tanto a consulta quanto a manutenção.', en: 'I suggest normalizing that table. It\'ll improve both querying and maintenance.', zh: '我建议对该表进行规范化。这将改善查询和维护。' },
    { pt: 'Vou criar um backup antes de migrar. Segurança em primeiro lugar!', en: 'I\'ll create a backup before migrating. Safety first!', zh: '我将在迁移前创建备份。安全第一！' },
    { pt: 'Os vetores estão indexados. A busca por similaridade retorna em <100ms.', en: 'Vectors are indexed. Similarity search returns in <100ms.', zh: '向量已建立索引。相似性搜索在100毫秒内返回。' },
  ],
  devops: [
    { pt: 'Vou preparar o Dockerfile e o docker-compose. Deploy automatizado! 🚀', en: 'I\'ll prepare the Dockerfile and docker-compose. Automated deploy! 🚀', zh: '我将准备Dockerfile和docker-compose。自动化部署！🚀' },
    { pt: 'O EC2 está configurado. Vou rodar o provision.sh e subir o serviço.', en: 'EC2 is configured. I\'ll run provision.sh and start the service.', zh: 'EC2已配置。我将运行provision.sh并启动服务。' },
    { pt: 'Sugiro usar um healthcheck no container para restart automático.', en: 'I suggest using a healthcheck in the container for automatic restart.', zh: '我建议在容器中使用健康检查以实现自动重启。' },
    { pt: 'O nginx está com SSL configurado. O certificado renova automaticamente.', en: 'Nginx has SSL configured. The certificate renews automatically.', zh: 'Nginx已配置SSL。证书自动续期。' },
    { pt: 'Vou monitorar os logs. Se cair, o systemd reinicia em 5 segundos.', en: 'I\'ll monitor the logs. If it crashes, systemd restarts in 5 seconds.', zh: '我将监控日志。如果崩溃，systemd会在5秒内重启。' },
  ],
  design: [
    { pt: 'Pelo lado visual, sugiro usar uma paleta mais contrastante para acessibilidade. 🎯', en: 'On the visual side, I suggest using a more contrasting palette for accessibility. 🎯', zh: '在视觉方面，我建议使用对比度更高的调色板以提高可访问性。🎯' },
    { pt: 'Posso criar um ícone SVG animado para representar isso!', en: 'I can create an animated SVG icon to represent that!', zh: '我可以创建一个动画SVG图标来表示这个！' },
    { pt: 'O layout ficaria melhor com um grid de 3 colunas no desktop.', en: 'The layout would look better with a 3-column grid on desktop.', zh: '桌面端使用3列网格布局会更好看。' },
    { pt: 'Vou desenhar um wireframe rápido. Fica mais fácil visualizar a proposta.', en: 'I\'ll draw a quick wireframe. It\'ll be easier to visualize the proposal.', zh: '我将快速绘制线框图。这样更容易可视化方案。' },
    { pt: 'As cores seguem o design system do projeto. Consistência é tudo! 🎨', en: 'Colors follow the project\'s design system. Consistency is everything! 🎨', zh: '颜色遵循项目的设计系统。一致性就是一切！🎨' },
  ],
};

const COMPLEMENT_RESPONSES: TrilingualResponse[] = [
  { pt: 'Concordo! Posso complementar com minha expertise.', en: 'Agreed! I can complement with my expertise.', zh: '同意！我可以用我的专业知识来补充。' },
  { pt: 'Boa! Do meu lado, posso ajudar com a parte de {skill}.', en: 'Nice! On my side, I can help with the {skill} part.', zh: '好的！我这边可以帮助处理{skill}部分。' },
  { pt: 'Enquanto isso eu cuido da parte técnica aqui.', en: 'Meanwhile I\'ll take care of the technical part here.', zh: '与此同时，我在这里处理技术部分。' },
  { pt: 'Legal! Se precisar de suporte na minha área, é só chamar. 🤝', en: 'Cool! If you need support in my area, just call. 🤝', zh: '好的！如果在我的领域需要支持，随时叫我。🤝' },
  { pt: 'Tô ligado! Posso começar a preparar o terreno do meu lado.', en: 'On it! I can start laying the groundwork on my end.', zh: '收到！我可以开始在我这边做准备工作。' },
  { pt: 'Show! Vou ficar de olho e ajudar quando precisar.', en: 'Great! I\'ll keep an eye and help when needed.', zh: '好的！我会持续关注并在需要时提供帮助。' },
];

const SKILL_LABELS_TRI: Record<string, { pt: string; en: string; zh: string }> = {
  dev: { pt: 'Dev', en: 'Dev', zh: '开发' },
  database: { pt: 'BD', en: 'DB', zh: '数据库' },
  billing: { pt: 'Billing', en: 'Billing', zh: '计费' },
  frontend: { pt: 'Front', en: 'Front', zh: '前端' },
  backend: { pt: 'Back', en: 'Back', zh: '后端' },
  devops: { pt: 'DevOps', en: 'DevOps', zh: '运维' },
  design: { pt: 'Design', en: 'Design', zh: '设计' },
};

function generateRobotResponse(userText: string, agent: AgentLike): { pt: string; en: string; zh: string } {
  const pool = ROBOT_RESPONSES[agent.skill] || ROBOT_RESPONSES.dev;
  const response = pool[Math.floor(Math.random() * pool.length)];

  if (userText.includes('?')) {
    return {
      pt: `Sobre sua pergunta: ${response.pt}`,
      en: `About your question: ${response.en}`,
      zh: `关于你的问题：${response.zh}`,
    };
  }
  return response;
}

export function _generateComplementResponse(_userText: string, agent: AgentLike): { pt: string; en: string; zh: string } {
  const response = COMPLEMENT_RESPONSES[Math.floor(Math.random() * COMPLEMENT_RESPONSES.length)];
  const skillTri = SKILL_LABELS_TRI[agent.skill] || SKILL_LABELS_TRI.dev;
  return {
    pt: response.pt.replace('{skill}', skillTri.pt),
    en: response.en.replace('{skill}', skillTri.en),
    zh: response.zh.replace('{skill}', skillTri.zh),
  };
}

// ============================================================
// SWARM APP — MAIN COMPONENT
// ============================================================
function SwarmApp() {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [columns, setColumns] = useState<Column[]>([
    { id: 'backlog', title: '📋 Backlog', tasks: FALLBACK_TASKS.filter(t => t.column === 'backlog') },
    { id: 'todo', title: '📝 A Fazer', tasks: FALLBACK_TASKS.filter(t => t.column === 'todo') },
    { id: 'doing', title: '⚡ Em Progresso', tasks: [] },
    { id: 'testes', title: '🧪 Testes', tasks: [] },
    { id: 'review', title: '👀 Revisão', tasks: [] },
    { id: 'done', title: '✅ Concluído', tasks: [] },
  ]);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [stats, setStats] = useState({ totalDone: 0, avgTime: 0, activeAgents: 0 });

  // MCP State
  const [mcpCards, setMcpCards] = useState<McpCard[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolInfo[]>([]);
  const [mcpConnected, setMcpConnected] = useState(false);

  // Drag-and-drop State
  const draggedTaskRef = useRef<{ task: Task; sourceCol: ColumnId } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ColumnId | null>(null);

  // Chat State
  const [, setMcpLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Swarm Chat State
  const [swarmChatOpen, setSwarmChatOpen] = useState(false);
  const [swarmMessages, setSwarmMessages] = useState<SwarmMessage[]>([
    {
      id: 'welcome_1',
      from: 'Sistema',
      fromName: '🐝 Enxame',
      text: '🇧🇷 Bem-vindo ao Chat do Enxame! Os robôs reportam em 3 idiomas quando pegam e completam tarefas. Alterne entre PT/EN/ZH no topo.',
      textEn: '🇺🇸 Welcome to the Swarm Chat! Robots report in 3 languages when they pick and complete tasks. Switch between PT/EN/ZH at the top.',
      textZh: '🇨🇳 欢迎来到蜂群聊天！机器人在领取和完成任务时以三种语言报告。可在顶部切换 PT/EN/ZH。',
      timestamp: Date.now(),
      type: 'system',
      action: 'info',
    },
  ]);
  const [swarmUnread, setSwarmUnread] = useState(0);

  const [mcpServer, setMcpServer] = useState<McpServerInfo>({
    id: 'qclaw-cards', name: 'qclaw-cards', command: 'python -m qclawmonitor.mcp_sse_server --port 9200',
    status: 'connecting', tools: [], icon: '📋', color: '#6366F1',
    description: 'Kanban Cards do time USJASESI via MCP SSE (localhost:9200)',
  });
  const mcpLoadedRef = useRef(false);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 80));
  }, []);

  // ── Swarm Chat Message Helper ───────────────────────────────────────────
  const addSwarmMessage = useCallback((fromName: string, text: string, opts: { type?: 'agent' | 'user' | 'system'; agentColor?: string; taskId?: string; action?: SwarmMessage['action']; textEn?: string; textZh?: string } = {}) => {
    const msg: SwarmMessage = {
      id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      from: fromName,
      fromName,
      text,
      textEn: opts.textEn,
      textZh: opts.textZh,
      timestamp: Date.now(),
      type: opts.type || 'agent',
      agentColor: opts.agentColor,
      taskId: opts.taskId,
      action: opts.action,
    };
    setSwarmMessages(prev => [...prev, msg].slice(-100));
    if (!swarmChatOpen) {
      setSwarmUnread(prev => prev + 1);
    }
  }, [swarmChatOpen]);

  // ── Handle Swarm Chat user message (robôs respondem com DeepSeek!) ─────────────────
  const handleSwarmUserMessage = useCallback((text: string) => {
    addSwarmMessage('Você', text, { type: 'user', action: 'info' });

    // Selecionar o robô mais adequado para responder com base no conteúdo
    const textLower = text.toLowerCase();
    let responder = agents[0]; // default: Robô Dev
    if (textLower.match(/front|react|tela|botão|interface|css|ui|layout/)) {
      responder = agents.find(a => a.skill === 'frontend') || agents[0];
    } else if (textLower.match(/back|api|server|rota|endpoint|python|fastapi/)) {
      responder = agents.find(a => a.skill === 'backend') || agents[0];
    } else if (textLower.match(/banco|dados|base|chroma|sql|query|bd/)) {
      responder = agents.find(a => a.skill === 'database') || agents[0];
    } else if (textLower.match(/deploy|docker|ec2|nginx|servidor|infra/)) {
      responder = agents.find(a => a.skill === 'devops') || agents[0];
    } else if (textLower.match(/design|visual|icone|arte|imagem|logo/)) {
      responder = agents.find(a => a.skill === 'design') || agents[0];
    }

    // Chamar DeepSeek para resposta real
    const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
    const baseUrl = import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const model = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat';

    if (apiKey) {
      // Resposta real via DeepSeek
      addSwarmMessage(responder.name, '⏳ Pensando...', {
        agentColor: responder.color,
        action: 'info',
      });

      fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: `Você é "${responder.name}", um robô agente de IA do projeto USJ/ASESI/CGE (Controladoria Geral do Estado do Ceará). Sua especialidade é ${responder.skill}. Responda de forma concisa, útil e técnica em português. Se a pergunta envolver código, inclua um bloco de código com a linguagem apropriada (use \`\`\`lang). Máximo 800 tokens de resposta.`,
            },
            { role: 'user', content: text },
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      })
        .then(r => r.json())
        .then(data => {
          const reply = data.choices?.[0]?.message?.content || 'Não consegui processar a resposta.';
          // Remover a mensagem "Pensando..." substituindo pela resposta real
          setSwarmMessages(prev => {
            const filtered = prev.filter(m => m.text !== '⏳ Pensando...' || m.fromName !== responder.name);
            return filtered;
          });
          addSwarmMessage(responder.name, reply, {
            agentColor: responder.color,
            action: 'info',
          });
        })
        .catch(err => {
          console.error('DeepSeek chat error:', err);
          setSwarmMessages(prev => prev.filter(m => m.text !== '⏳ Pensando...' || m.fromName !== responder.name));
          addSwarmMessage(responder.name, `Erro ao conectar com DeepSeek: ${err.message || 'desconhecido'}`, {
            agentColor: responder.color,
            action: 'info',
          });
        });
    } else {
      // Fallback: respostas pré-definidas se não tiver API key
      setTimeout(() => {
        const response = generateRobotResponse(text, responder);
        addSwarmMessage(responder.name, response.pt, {
          agentColor: responder.color,
          action: 'info',
          textEn: response.en,
          textZh: response.zh,
        });
      }, 800 + Math.random() * 1200);
    }
  }, [addSwarmMessage, agents]);

  // ── Handle Task Creation from Chat ──────────────────────────────────────
  const handleSwarmChatCreateTask = useCallback(async (taskData: { title: string; skill: AgentSkill; column: ColumnId; priority: number; description: string }) => {
    const newId = `TASK-${String(Date.now()).slice(-3)}`;
    const newTask: Task = {
      id: newId,
      title: taskData.title,
      column: taskData.column,
      priority: taskData.priority,
      skill: taskData.skill,
      description: taskData.description,
    };

    // Adicionar localmente ao kanban
    setColumns(prev => prev.map(col =>
      col.id === taskData.column ? { ...col, tasks: [...col.tasks, newTask] } : col
    ));
    addLog(`➕ Tarefa criada via chat: ${newId} — "${taskData.title}" [${taskData.skill}]`);
    addSwarmMessage('Sistema', `Tarefa criada: "${taskData.title}" [${taskData.skill}] → ${taskData.column}`, {
      type: 'system', action: 'create',
      textEn: `Task created: "${taskData.title}" [${taskData.skill}] → ${taskData.column}`,
      textZh: `任务已创建："${taskData.title}" [${taskData.skill}] → ${taskData.column}`,
    });

    // Tentar persistir no MCP server
    if (mcpConnected) {
      const card = await mcpClient.addCard(taskData.title, taskData.description, taskData.column, taskData.priority, [taskData.skill], 'c22f69a564d6');
      if (card) {
        addLog(`☁️ Card sincronizado com MCP: ${card.id}`);
        setColumns(prev => prev.map(col => ({
          ...col,
          tasks: col.tasks.map(t => t.id === newId ? { ...t, id: card.id } : t)
        })));
      }
    }
  }, [addLog, addSwarmMessage, mcpConnected]);

  // ── Drag-and-Drop Handlers ──────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, task: Task, sourceCol: ColumnId) => {
    draggedTaskRef.current = { task, sourceCol };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, colId: ColumnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(colId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverCol(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetCol: ColumnId) => {
    e.preventDefault();
    setDragOverCol(null);
    const dragged = draggedTaskRef.current;
    if (!dragged || dragged.sourceCol === targetCol) return;

    const { task, sourceCol } = dragged;
    draggedTaskRef.current = null;

    // Update local state
    setColumns(prev => prev.map(col => {
      if (col.id === sourceCol) return { ...col, tasks: col.tasks.filter(t => t.id !== task.id) };
      if (col.id === targetCol) return { ...col, tasks: [...col.tasks, { ...task, column: targetCol }] };
      return col;
    }));

    // Persist via MCP
    if (mcpConnected) {
      mcpClient.moveCard(task.id, targetCol, 'c22f69a564d6').catch(() => {
        addLog(`⚠️ Falha ao mover card ${task.id} no MCP`);
      });
    }

    addLog(`🖱️ Card ${task.id} movido de ${sourceCol} → ${targetCol}`);
  }, [mcpConnected, addLog]);

  // ── Add Task Handler ────────────────────────────────────────────────────
  const handleAddTaskInternal = useCallback(async (taskData: { title: string; description: string; column: ColumnId; priority: number; skill: AgentSkill }) => {
    const newId = `TASK-${String(Date.now()).slice(-3)}`;
    const newTask: Task = {
      id: newId,
      title: taskData.title,
      column: taskData.column,
      priority: taskData.priority,
      skill: taskData.skill,
      description: taskData.description,
    };

    // Adicionar localmente ao kanban
    setColumns(prev => prev.map(col =>
      col.id === taskData.column ? { ...col, tasks: [...col.tasks, newTask] } : col
    ));
    addLog(`➕ Nova tarefa criada: ${newId} — "${taskData.title}" (${taskData.column})`);

    // Tentar persistir no MCP server
    if (mcpConnected) {
      const card = await mcpClient.addCard(
        taskData.title,
        taskData.description,
        taskData.column,
        taskData.priority,
        [taskData.skill],
        'c22f69a564d6'
      );
      if (card) {
        addLog(`☁️ Card sincronizado com MCP: ${card.id}`);
        // Atualizar o ID local com o ID real do MCP
        setColumns(prev => prev.map(col => ({
          ...col,
          tasks: col.tasks.map(t => t.id === newId ? { ...t, id: card.id } : t)
        })));
      } else {
        addLog(`⚠️ Card criado localmente (MCP indisponível para persistir)`);
      }
    }
  }, [addLog, mcpConnected]);

  // Wrapper para uso externo (AddTaskForm modal)
  const handleAddTask = handleAddTaskInternal;

  // ── MCP Connection ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mcpLoadedRef.current) return;
    mcpLoadedRef.current = true;

    const loadMcpData = async () => {
      setMcpLoading(true);
      setMcpServer(prev => ({ ...prev, status: 'connecting' }));
      addLog('🔌 Conectando ao MCP server qclaw-cards (localhost:9200)...');

      try {
        await mcpClient.connect();
        setMcpConnected(true);
        addLog('✅ Conectado ao MCP server qclaw-cards');
        soundMcpConnected();

        // List tools
        const tools = await mcpClient.listTools();
        setMcpTools(tools);
        setMcpServer(prev => ({ ...prev, status: 'online', tools }));
        addLog(`🔧 ${tools.length} ferramentas MCP carregadas: ${tools.map(t => t.name).join(', ')}`);

        // Get cards do time USJASESI
        const cards = await mcpClient.getCardsTodo();
        setMcpCards(cards);
        addLog(`📋 ${cards.length} cards carregados do time USJASESI`);

        // Converter cards MCP em tasks do kanban
        const mcpTasks: Task[] = cards.map(card => ({
          id: card.id,
          title: card.title,
          column: (card.column === 'todo' || card.column === 'backlog' || card.column === 'doing' || card.column === 'done' || card.column === 'review') ? card.column as ColumnId : 'todo',
          priority: card.priority || 3,
          skill: mapMcpSkillToAgent(card.skills, card.title),
          assignees: card.assignees,
          description: card.description,
        }));

        // Atualizar kanban com os dados reais
        setColumns([
          { id: 'backlog', title: '📋 Backlog', tasks: mcpTasks.filter(t => t.column === 'backlog') },
          { id: 'todo', title: '📝 A Fazer', tasks: mcpTasks.filter(t => t.column === 'todo') },
          { id: 'doing', title: '⚡ Em Progresso', tasks: mcpTasks.filter(t => t.column === 'doing') },
          { id: 'testes', title: '🧪 Testes', tasks: mcpTasks.filter(t => t.column === 'testes') },
          { id: 'review', title: '👀 Revisão', tasks: mcpTasks.filter(t => t.column === 'review') },
          { id: 'done', title: '✅ Concluído', tasks: mcpTasks.filter(t => t.column === 'done') },
        ]);
        addLog('📊 Kanban atualizado com dados do MCP server');
      } catch (err) {
        console.error('MCP connection error:', err);
        setMcpConnected(false);
        setMcpServer(prev => ({ ...prev, status: 'error' }));
        addLog(`❌ Falha ao conectar: ${err instanceof Error ? err.message : 'erro desconhecido'}`);
        soundError();        addLog('⚠️ Usando dados fallback do kanban local');
      } finally {
        setMcpLoading(false);
      }
    };

    loadMcpData();
  }, [addLog]);

  // Refresh MCP cards a cada 30s
  useEffect(() => {
    if (!mcpConnected) return;
    const interval = setInterval(async () => {
      try {
        const cards = await mcpClient.getCardsTodo();
        setMcpCards(cards);
      } catch { /* silent */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [mcpConnected]);

  // ── Swarm Engine ────────────────────────────────────────────────────────
  const assignTask = useCallback((task: Task) => {
    const available = agents.filter(a => a.status === 'idle');
    if (available.length === 0) return false;

    const matching = available.filter(a => a.skill === task.skill);
    const agent = matching.length > 0 ? matching[0] : available[0];

    setAgents(prev => prev.map(a =>
      a.id === agent.id ? { ...a, status: 'picking', currentTask: task.id, progress: 0 } : a
    ));
    addLog(`🤖 ${agent.name} pegou ${task.id} — "${task.title}"`);
    // Robô reporta no chat que pegou a tarefa (trilíngue)
    addSwarmMessage(agent.name, `Peguei a tarefa "${task.title}". Vou trabalhar nela agora! 💪`, {
      agentColor: agent.color, taskId: task.id, action: 'pick',
      textEn: `I picked up task "${task.title}". Working on it now! 💪`,
      textZh: `我领取了任务"${task.title}"。现在开始工作！💪`,
    });
    soundPickTask();
    setTimeout(() => {
      setAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, status: 'working', progress: 10 } : a
      ));

      const interval = setInterval(() => {
        setAgents(prev => prev.map(a => {
          if (a.id !== agent.id) return a;
          const newProgress = Math.min(a.progress + Math.random() * 15, 100);
          if (newProgress >= 100) {
            clearInterval(interval);
            // Chamar DeepSeek para gerar código REAL
            addSwarmMessage(agent.name, `Gerando solução para "${task.title}" com DeepSeek... ⏳`, {
              agentColor: agent.color, taskId: task.id, action: 'progress',
              textEn: `Generating solution for "${task.title}" with DeepSeek... ⏳`,
              textZh: `正在用DeepSeek生成"${task.title}"的解决方案... ⏳`,
            });
            const startTime = Date.now();
            generateCodeWithDeepSeek(task.title, task.description || '', agent.skill, agent.name).then(deepSeekResult => {
              const taskDuration = Date.now() - startTime;
              const taskResult: TaskResult = {
                agentName: agent.name,
                agentSkill: agent.skill,
                completedAt: Date.now(),
                duration: taskDuration,
                code: deepSeekResult.code,
                language: deepSeekResult.language,
                output: deepSeekResult.output,
                summary: deepSeekResult.summary,
              };
              const completedTask = { ...task, column: 'done' as const, result: taskResult };
              setColumns(prev => prev.map(col => {
                if (col.tasks.some(t => t.id === task.id)) return { ...col, tasks: col.tasks.filter(t => t.id !== task.id) };
                if (col.id === 'done') return { ...col, tasks: [...col.tasks, completedTask] };
                return col;
              }));
              setAgents(prev => prev.map(a =>
                a.id === agent.id ? { ...a, status: 'done', tasksDone: a.tasksDone + 1, currentTask: null, progress: 100 } : a
              ));
              setStats(prev => ({ ...prev, totalDone: prev.totalDone + 1 }));
              addLog(`✅ ${agent.name} concluiu ${task.id} — "${task.title}"`);
              addLog(`   💻 Código gerado (DeepSeek): ${taskResult.code ? taskResult.code.split('\n').length : 0} linhas (${taskResult.language})`);
              // Robô reporta no chat com código real gerado pelo DeepSeek
              const codePreview = taskResult.code
                ? `\n\n\`\`\`${taskResult.language}\n${taskResult.code}\n\`\`\`\n\n${taskResult.output || ''}`
                : '';
              addSwarmMessage(agent.name, `Concluí a tarefa "${task.title}"! ✅ Solução gerada com DeepSeek (${taskResult.language}).${codePreview}`, {
                agentColor: agent.color, taskId: task.id, action: 'done',
                textEn: `Completed task "${task.title}"! ✅ Solution generated with DeepSeek (${taskResult.language}).${codePreview}`,
                textZh: `完成了任务"${task.title}"！✅ 已用DeepSeek生成解决方案（${taskResult.language}）。${codePreview}`,
              });
              soundTaskDone();
              // Tentar mover card no MCP server
              if (mcpConnected) {
                mcpClient.moveCard(task.id, 'done', 'c22f69a564d6').catch(() => {});
              }

              setTimeout(() => {
                setAgents(prev => prev.map(a =>
                  a.id === agent.id ? { ...a, status: 'idle', progress: 0 } : a
                ));
              }, 1500);
            });
            return a;
          }
          return { ...a, progress: newProgress };
        }));
      }, 600);
    }, 1500);
    return true;
  }, [agents, addLog, addSwarmMessage, mcpConnected]);

  // Swarm cycle
  useEffect(() => {
    if (!isRunning) return;
    const cycle = setInterval(() => {
      setColumns(prev => {
        const todoCol = prev.find(c => c.id === 'todo');
        if (!todoCol || todoCol.tasks.length === 0) return prev;
        const sorted = [...todoCol.tasks].sort((a, b) => a.priority - b.priority);
        for (const task of sorted.slice(0, 2)) {
          setTimeout(() => assignTask(task), 50);
        }
        return prev;
      });
    }, 4000);
    return () => clearInterval(cycle);
  }, [isRunning, assignTask]);

  // Active agents count
  useEffect(() => {
    const active = agents.filter(a => a.status !== 'idle').length;
    setStats(prev => ({ ...prev, activeAgents: active }));
  }, [agents]);

  // ── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800/50 backdrop-blur-sm bg-gray-950/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={roboIcon} alt="Robô Nordestino Chinês" className="w-12 h-12 rounded-lg object-contain" />
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Swarm Visual</h1>
              <p className="text-[10px] text-gray-500">Enxame de Agentes IA · USJ/ASESI · MCP</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${mcpConnected ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
              <span className="text-gray-300 text-xs">{mcpConnected ? 'MCP Online' : 'MCP Offline'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-300">{stats.activeAgents}/{agents.length} ativos</span>
            </div>
            <div className="text-gray-300">
              <span className="text-green-400 font-bold">{stats.totalDone}</span> concluídos
            </div>
            <button onClick={() => { resumeAudio(); setIsRunning(!isRunning); }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${isRunning ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'}`}>
              {isRunning ? '⏸ Pausar' : '▶ Iniciar'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
        {/* Hero */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="flex items-center gap-6 bg-gradient-to-r from-gray-900/80 via-gray-900/50 to-gray-900/80 border border-gray-800/50 rounded-2xl p-6">
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}>
              <img src={roboIcon} alt="Robô Nordestino Chinês" className="w-24 h-24 rounded-xl object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
            </motion.div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-100 mb-1">🤖 Robô Nordestino Chinês · USJ/ASESI</h2>
              <p className="text-sm text-gray-400 leading-relaxed">
                Coordena o enxame de agentes IA com <span className="text-yellow-400">inteligência</span>, <span className="text-red-400">coragem</span> e <span className="text-green-400">eficiência</span>.
                {mcpConnected && <span className="text-indigo-400"> Conectado ao MCP server com {mcpCards.length} cards reais do projeto.</span>}
              </p>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">🔌 MCP: qclaw-cards</span>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">📋 {mcpCards.length} cards</span>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">🔧 {mcpTools.length} tools</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Agent Pool */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">🐝 Enxame de Agentes</h2>
          <div className="flex gap-4 flex-wrap">
            {agents.map(agent => <AnimatedAgent key={agent.id} agent={agent} />)}
          </div>
        </section>

        {/* Kanban Board */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">📊 Kanban Board {mcpConnected && '(MCP Live)'}</h2>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowAddTask(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition-colors">
                ➕ Nova Tarefa
              </button>
              <span className="text-[10px] text-gray-500">
                {columns.reduce((sum, c) => sum + c.tasks.length, 0)} tasks total
              </span>
            </div>
          </div>

          {/* Add Task Modal */}
          <AnimatePresence>
            {showAddTask && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={(e) => { if (e.target === e.currentTarget) setShowAddTask(false); }}
              >
                <AddTaskForm onAdd={handleAddTask} onClose={() => setShowAddTask(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Task Detail Modal (resultado + código fonte) */}
          <AnimatePresence>
            {selectedTask && (
              <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} />
            )}
          </AnimatePresence>

          <div className="grid grid-cols-6 gap-3">
            {columns.map(col => (
              <div key={col.id}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`bg-gray-900/50 border rounded-xl p-3 min-h-[300px] transition-colors ${dragOverCol === col.id ? 'border-blue-500/60 bg-blue-900/10' : 'border-gray-800/50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-gray-300">{col.title}</h3>
                  <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{col.tasks.length}</span>
                </div>
                <div className="space-y-2">
                  <AnimatePresence>
                    {col.tasks.map(task => (
                      <motion.div key={task.id} layout initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5, y: -20 }}
                        draggable
                        onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, task, col.id)}
                        onClick={() => setSelectedTask(task)}
                        className={`bg-gray-800/80 rounded-lg p-2.5 border-l-4 cursor-grab active:cursor-grabbing hover:bg-gray-700/80 transition-colors ${task.priority === 1 ? 'border-l-red-500' : task.priority === 2 ? 'border-l-yellow-500' : task.priority === 3 ? 'border-l-blue-500' : 'border-l-gray-600'} ${task.result ? 'ring-1 ring-green-500/20' : ''}`}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-[11px] font-medium text-gray-200 leading-tight">{task.title}</span>
                          <span className="text-[8px] bg-gray-700 text-gray-400 px-1 py-0.5 rounded shrink-0">{task.id}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SKILL_COLORS[task.skill] }} />
                          <span className="text-[9px] text-gray-500">{SKILL_LABELS[task.skill]}</span>
                          <span className={`text-[9px] ml-auto ${task.priority === 1 ? 'text-red-400' : task.priority === 2 ? 'text-yellow-400' : 'text-blue-400'}`}>P{task.priority}</span>
                        </div>
                        {task.result && (
                          <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-gray-700/50">
                            <span className="text-[9px] text-green-400">💻 {task.result.language}</span>
                            <span className="text-[9px] text-gray-500">· {task.result.code ? task.result.code.split('\n').length : 0} linhas</span>
                            <span className="text-[9px] text-green-500/70 ml-auto">ver código →</span>
                          </div>
                        )}
                        {col.id === 'doing' && !task.result && (() => {
                          const assigned = agents.find(a => a.currentTask === task.id);
                          return assigned ? (
                            <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-gray-700/50">
                              <RobotSVG color={assigned.color} size={14} />
                              <span className="text-[9px] text-gray-400">{assigned.name}</span>
                            </div>
                          ) : null;
                        })()}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Swarm Trilingual Chat Feed — Inline */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">🐝 Chat dos Agentes · Trilíngue</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">🇧🇷 PT · 🇺🇸 EN · 🇨🇳 ZH</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </div>
          </div>
          <div className="bg-gray-900/70 border border-gray-800/50 rounded-2xl overflow-hidden">
            {/* Chat messages feed */}
            <div className="max-h-[420px] overflow-y-auto p-4 space-y-3" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 100%)' }}>
              {swarmMessages.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-3xl mb-2">🤖</div>
                  <p className="text-xs">Aguardando os robôs conversarem...</p>
                </div>
              )}
              {swarmMessages.slice(-20).map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`rounded-xl p-3 ${
                    msg.type === 'system'
                      ? 'bg-gray-800/40 border border-gray-700/30'
                      : msg.type === 'user'
                        ? 'bg-blue-600/20 border border-blue-500/30 ml-12'
                        : 'bg-gray-800/60 border border-gray-700/30'
                  }`}
                  style={msg.type === 'agent' && msg.agentColor ? { borderLeftColor: msg.agentColor, borderLeftWidth: '3px' } : {}}
                >
                  {/* Agent header */}
                  {msg.type === 'agent' && (
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px]"
                        style={{ backgroundColor: msg.agentColor ? `${msg.agentColor}30` : '#374151' }}>🤖</div>
                      <span className="text-[10px] font-semibold" style={{ color: msg.agentColor || '#9CA3AF' }}>{msg.fromName}</span>
                      {msg.taskId && <span className="text-[9px] text-gray-500 font-mono">{msg.taskId}</span>}
                      {msg.action && <span className="text-[9px]">{msg.action === 'pick' ? '🎯' : msg.action === 'done' ? '✅' : msg.action === 'progress' ? '⚡' : '💬'}</span>}
                      <span className="text-[9px] text-gray-600 ml-auto">{new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {msg.type === 'system' && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-gray-400 font-medium">⚙️ Sistema</span>
                      <span className="text-[9px] text-gray-600 ml-auto">{new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {msg.type === 'user' && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-blue-300 font-medium">👤 Você</span>
                      <span className="text-[9px] text-gray-600 ml-auto">{new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}

                  {/* Trilingual messages - show all 3 languages side by side */}
                  {(msg.textEn || msg.textZh) ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-900/50 rounded-lg p-2 border border-gray-700/20">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[9px]">🇧🇷</span>
                          <span className="text-[8px] text-gray-500 font-medium">PT</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-gray-200 whitespace-pre-wrap">{msg.text}</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-2 border border-gray-700/20">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[9px]">🇺🇸</span>
                          <span className="text-[8px] text-gray-500 font-medium">EN</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-gray-200 whitespace-pre-wrap">{msg.textEn || msg.text}</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-2 border border-gray-700/20">
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-[9px]">🇨🇳</span>
                          <span className="text-[8px] text-gray-500 font-medium">ZH</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-gray-200 whitespace-pre-wrap">{msg.textZh || msg.text}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-gray-200 whitespace-pre-wrap">{msg.text}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* MCP Server Card */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">🔌 MCP Server</h2>
            {mcpConnected && <span className="text-[10px] text-green-400">● Conectado via SSE</span>}
          </div>
          <McpServerCard server={mcpServer} />
        </section>



        {/* Logs */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">📜 Log do Enxame</h2>
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4 max-h-48 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="text-[11px] font-mono text-gray-400 leading-6">{log}</div>
            ))}
            {logs.length === 0 && <div className="text-[11px] text-gray-600 italic">Aguardando o enxame começar...</div>}
          </div>
        </section>
      </div>

      {/* Swarm Chat — Robôs respondem aqui */}
      <AnimatePresence>
        {swarmChatOpen && (
          <SwarmChat
            messages={swarmMessages}
            onSendMessage={handleSwarmUserMessage}
            onCreateTask={handleSwarmChatCreateTask}
            onClose={() => { setSwarmChatOpen(false); setSwarmUnread(0); }}
          />
        )}
      </AnimatePresence>

      {/* Swarm Chat FAB */}
      {!swarmChatOpen && (
        <SwarmChatFAB onClick={() => { setSwarmChatOpen(true); setSwarmUnread(0); }} unread={swarmUnread} />
      )}
    </div>
  );
}

export default SwarmApp;
