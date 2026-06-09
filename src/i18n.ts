/**
 * i18n — Sistema de internacionalização trilíngue (PT/EN/ZH).
 * Todos os textos da interface do Swarm Visual em 3 idiomas.
 */

export type Lang = 'pt' | 'en' | 'zh';

export interface Translations {
  // Header
  headerSubtitle: string;
  mcpOnline: string;
  mcpOffline: string;
  active: string;
  completed: string;
  pause: string;
  start: string;

  // Hero
  heroTitle: string;
  heroDescription: string;
  heroConnected: string;
  cards: string;
  tools: string;

  // Sections
  agentSwarm: string;
  kanbanBoard: string;
  kanbanLive: string;
  newTask: string;
  tasksTotal: string;
  agentChat: string;
  chatTrilingual: string;
  mcpServer: string;
  connectedSSE: string;
  swarmLog: string;
  waitingSwarm: string;

  // Kanban Columns
  colBacklog: string;
  colTodo: string;
  colDoing: string;
  colTests: string;
  colReview: string;
  colDone: string;

  // Add Task Form
  addTaskTitle: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  columnLabel: string;
  priorityLabel: string;
  skillLabel: string;
  createTask: string;
  cancel: string;

  // Priority
  p1Critical: string;
  p2High: string;
  p3Medium: string;
  p4Low: string;

  // Task Detail Modal
  result: string;
  sourceCode: string;
  executionSummary: string;
  agentOutput: string;
  time: string;
  agent: string;
  skill: string;
  notExecuted: string;
  notExecutedHint: string;
  completedLabel: string;
  close: string;
  copy: string;
  lines: string;
  viewCode: string;

  // Chat inline
  waitingRobots: string;
  system: string;
  you: string;

  // Language names
  langPt: string;
  langEn: string;
  langZh: string;
}

const translations: Record<Lang, Translations> = {
  pt: {
    headerSubtitle: 'Enxame de Agentes IA · USJ/ASESI · MCP',
    mcpOnline: 'MCP Online',
    mcpOffline: 'MCP Offline',
    active: 'ativos',
    completed: 'concluídos',
    pause: '⏸ Pausar',
    start: '▶ Iniciar',

    heroTitle: '🤖 Robô Nordestino Chinês · USJ/ASESI',
    heroDescription: 'Coordena o enxame de agentes IA com',
    heroConnected: 'Conectado ao MCP server com',
    cards: 'cards',
    tools: 'tools',

    agentSwarm: '🐝 Enxame de Agentes',
    kanbanBoard: '📊 Kanban Board',
    kanbanLive: '(MCP Live)',
    newTask: '➕ Nova Tarefa',
    tasksTotal: 'tasks total',
    agentChat: '🐝 Chat dos Agentes · Trilíngue',
    chatTrilingual: '🇧🇷 PT · 🇺🇸 EN · 🇨🇳 ZH',
    mcpServer: '🔌 MCP Server',
    connectedSSE: '● Conectado via SSE',
    swarmLog: '📜 Log do Enxame',
    waitingSwarm: 'Aguardando o enxame começar...',

    colBacklog: '📋 Backlog',
    colTodo: '📝 A Fazer',
    colDoing: '⚡ Em Progresso',
    colTests: '🧪 Testes',
    colReview: '👀 Revisão',
    colDone: '✅ Concluído',

    addTaskTitle: '➕ Nova Tarefa',
    titleLabel: 'Título *',
    titlePlaceholder: 'Descreva a tarefa...',
    descriptionLabel: 'Descrição',
    descriptionPlaceholder: 'Detalhes opcionais...',
    columnLabel: 'Coluna',
    priorityLabel: 'Prioridade',
    skillLabel: 'Skill',
    createTask: 'Criar Tarefa',
    cancel: 'Cancelar',

    p1Critical: '🔴 P1 — Crítica',
    p2High: '🟡 P2 — Alta',
    p3Medium: '🔵 P3 — Média',
    p4Low: '⚪ P4 — Baixa',

    result: '📋 Resultado',
    sourceCode: '💻 Código Fonte',
    executionSummary: 'Resumo da Execução',
    agentOutput: 'Output do Agente',
    time: 'Tempo',
    agent: 'Agente',
    skill: 'Skill',
    notExecuted: 'Tarefa ainda não executada por um agente',
    notExecutedHint: 'Mova para "A Fazer" e o enxame começará a trabalhar',
    completedLabel: '✅ Concluído',
    close: 'Fechar',
    copy: '📋 Copiar',
    lines: 'linhas',
    viewCode: 'ver código →',

    waitingRobots: 'Aguardando os robôs conversarem...',
    system: '⚙️ Sistema',
    you: '👤 Você',

    langPt: '🇧🇷',
    langEn: '🇺🇸',
    langZh: '🇨🇳',
  },

  en: {
    headerSubtitle: 'AI Agent Swarm · USJ/ASESI · MCP',
    mcpOnline: 'MCP Online',
    mcpOffline: 'MCP Offline',
    active: 'active',
    completed: 'completed',
    pause: '⏸ Pause',
    start: '▶ Start',

    heroTitle: '🤖 Northeastern Chinese Robot · USJ/ASESI',
    heroDescription: 'Coordinates the AI agent swarm with',
    heroConnected: 'Connected to MCP server with',
    cards: 'cards',
    tools: 'tools',

    agentSwarm: '🐝 Agent Swarm',
    kanbanBoard: '📊 Kanban Board',
    kanbanLive: '(MCP Live)',
    newTask: '➕ New Task',
    tasksTotal: 'tasks total',
    agentChat: '🐝 Agent Chat · Trilingual',
    chatTrilingual: '🇧🇷 PT · 🇺🇸 EN · 🇨🇳 ZH',
    mcpServer: '🔌 MCP Server',
    connectedSSE: '● Connected via SSE',
    swarmLog: '📜 Swarm Log',
    waitingSwarm: 'Waiting for the swarm to start...',

    colBacklog: '📋 Backlog',
    colTodo: '📝 To Do',
    colDoing: '⚡ In Progress',
    colTests: '🧪 Tests',
    colReview: '👀 Review',
    colDone: '✅ Done',

    addTaskTitle: '➕ New Task',
    titleLabel: 'Title *',
    titlePlaceholder: 'Describe the task...',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Optional details...',
    columnLabel: 'Column',
    priorityLabel: 'Priority',
    skillLabel: 'Skill',
    createTask: 'Create Task',
    cancel: 'Cancel',

    p1Critical: '🔴 P1 — Critical',
    p2High: '🟡 P2 — High',
    p3Medium: '🔵 P3 — Medium',
    p4Low: '⚪ P4 — Low',

    result: '📋 Result',
    sourceCode: '💻 Source Code',
    executionSummary: 'Execution Summary',
    agentOutput: 'Agent Output',
    time: 'Time',
    agent: 'Agent',
    skill: 'Skill',
    notExecuted: 'Task not yet executed by an agent',
    notExecutedHint: 'Move to "To Do" and the swarm will start working',
    completedLabel: '✅ Completed',
    close: 'Close',
    copy: '📋 Copy',
    lines: 'lines',
    viewCode: 'view code →',

    waitingRobots: 'Waiting for the robots to chat...',
    system: '⚙️ System',
    you: '👤 You',

    langPt: '🇧🇷',
    langEn: '🇺🇸',
    langZh: '🇨🇳',
  },

  zh: {
    headerSubtitle: 'AI智能体蜂群 · USJ/ASESI · MCP',
    mcpOnline: 'MCP 在线',
    mcpOffline: 'MCP 离线',
    active: '活跃',
    completed: '已完成',
    pause: '⏸ 暂停',
    start: '▶ 开始',

    heroTitle: '🤖 东北中国机器人 · USJ/ASESI',
    heroDescription: '以智慧、勇气和效率协调AI智能体蜂群',
    heroConnected: '已连接MCP服务器，共',
    cards: '个卡片',
    tools: '个工具',

    agentSwarm: '🐝 智能体蜂群',
    kanbanBoard: '📊 看板',
    kanbanLive: '(MCP 实时)',
    newTask: '➕ 新任务',
    tasksTotal: '个任务',
    agentChat: '🐝 智能体聊天 · 三语',
    chatTrilingual: '🇧🇷 葡 · 🇺🇸 英 · 🇨🇳 中',
    mcpServer: '🔌 MCP 服务器',
    connectedSSE: '● 通过SSE连接',
    swarmLog: '📜 蜂群日志',
    waitingSwarm: '等待蜂群启动...',

    colBacklog: '📋 待定',
    colTodo: '📝 待办',
    colDoing: '⚡ 进行中',
    colTests: '🧪 测试',
    colReview: '👀 审核',
    colDone: '✅ 完成',

    addTaskTitle: '➕ 新任务',
    titleLabel: '标题 *',
    titlePlaceholder: '描述任务...',
    descriptionLabel: '描述',
    descriptionPlaceholder: '可选详情...',
    columnLabel: '列',
    priorityLabel: '优先级',
    skillLabel: '技能',
    createTask: '创建任务',
    cancel: '取消',

    p1Critical: '🔴 P1 — 紧急',
    p2High: '🟡 P2 — 高',
    p3Medium: '🔵 P3 — 中',
    p4Low: '⚪ P4 — 低',

    result: '📋 结果',
    sourceCode: '💻 源代码',
    executionSummary: '执行摘要',
    agentOutput: '智能体输出',
    time: '时间',
    agent: '智能体',
    skill: '技能',
    notExecuted: '任务尚未被智能体执行',
    notExecutedHint: '移至"待办"，蜂群将开始工作',
    completedLabel: '✅ 已完成',
    close: '关闭',
    copy: '📋 复制',
    lines: '行',
    viewCode: '查看代码 →',

    waitingRobots: '等待机器人对话...',
    system: '⚙️ 系统',
    you: '👤 你',

    langPt: '🇧🇷',
    langEn: '🇺🇸',
    langZh: '🇨🇳',
  },
};

export function t(lang: Lang): Translations {
  return translations[lang];
}

export function getColumnTitle(lang: Lang, colId: string): string {
  const map: Record<string, keyof Translations> = {
    backlog: 'colBacklog',
    todo: 'colTodo',
    doing: 'colDoing',
    testes: 'colTests',
    review: 'colReview',
    done: 'colDone',
  };
  const key = map[colId];
  return key ? translations[lang][key] : colId;
}
