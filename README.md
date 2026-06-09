# 🤖 Swarm Visual — Enxame de Agentes IA

<p align="center">
  <img src="public/logo-cge.svg" alt="CGE - Controladoria e Ouvidoria Geral do Estado do Ceará" width="120" />
  &nbsp;&nbsp;&nbsp;
  <img src="public/logo-usj.svg" alt="USJ - University of Saint Joseph, Macau" width="120" />
  &nbsp;&nbsp;&nbsp;
  <img src="public/logo-asesi.svg" alt="ASESI - Assessoria Especial de Sistemas de Informação" width="120" />
</p>

<p align="center">
  <strong>CGE</strong> · Controladoria e Ouvidoria Geral do Estado do Ceará &nbsp;|&nbsp;
  <strong>USJ</strong> · University of Saint Joseph, Macau &nbsp;|&nbsp;
  <strong>ASESI</strong> · Assessoria Especial de Sistemas de Informação
</p>

---

<p align="center">
  <img src="public/robo-nordestino-chines.png" alt="Robô Nordestino Chinês - Mascote do Projeto" width="200" />
</p>

<h3 align="center">🎖 Robô Nordestino Chinês</h3>
<p align="center"><em>Mascote do projeto — combina a força do cangaceiro nordestino com a sabedoria tecnológica oriental</em></p>

---

## 📋 Sobre o Projeto

**Swarm Visual** é o painel de visualização do enxame de agentes IA que coordena tarefas do projeto USJ/ASESI/CGE. A interface mostra em tempo real:

- 🐝 **Enxame de Agentes** — robôs especializados (Dev, BD, Front, Back, DevOps, Design) trabalhando em paralelo
- 📊 **Kanban Board** — quadro de tarefas com movimentação automática pelos agentes
- 🔌 **MCP Servers** — integração com servidores Model Context Protocol
- 📜 **Logs em Tempo Real** — acompanhamento das ações do enxame

## 🏛️ Instituições

| Logo | Instituição | Site Oficial |
|------|------------|--------------|
| <img src="public/logo-cge.svg" width="60" /> | **CGE** — Controladoria e Ouvidoria Geral do Estado do Ceará | [cge.ce.gov.br](https://cge.ce.gov.br) |
| <img src="public/logo-usj.svg" width="60" /> | **USJ** — University of Saint Joseph, Macau | [usj.edu.mo](https://www.usj.edu.mo) |
| <img src="public/logo-asesi.svg" width="60" /> | **ASESI** — Assessoria Especial de Sistemas de Informação | — |

> **Nota:** Para substituir pelos logos oficiais, baixe as imagens dos sites acima e substitua os arquivos em `public/`.

---

## 🚀 Tecnologias

- **React 19** + TypeScript
- **Vite** (bundler)
- **Tailwind CSS 4** (estilização)
- **Framer Motion** (animações)
- **Recharts** (gráficos)
- **MCP** (Model Context Protocol)
- **SQLite** (persistência do Kanban via better-sqlite3)

## 🧹 Auto-limpeza do Kanban

A coluna **Concluído** (done) tem um limite configurável de cards (`DONE_COLUMN_LIMIT = 10` em `server/kanban-db.mjs`). Quando o limite é excedido:

- Os cards mais antigos (por `completed_at`) são removidos automaticamente
- A limpeza ocorre ao iniciar o servidor e toda vez que um card é movido para "done"
- Isso mantém o board limpo sem intervenção manual

## 🛠️ Como Executar

```bash
npm install
npm run dev
```

## 📁 Estrutura

```
swarm-visual/
├── public/
│   ├── logo-cge.svg
│   ├── logo-usj.svg
│   ├── logo-asesi.svg
│   └── robo-nordestino-chines.png
├── server/
│   ├── kanban-db.mjs      # Persistência SQLite + auto-limpeza
│   ├── mcp-server.mjs     # Servidor MCP SSE (JSON-RPC 2.0)
│   └── wacli-bridge.mjs   # Bridge WhatsApp
├── src/
│   ├── App.tsx
│   ├── App.css
│   ├── SwarmChat.tsx
│   ├── WhatsAppChat.tsx
│   ├── deepseekClient.ts
│   ├── mcpClient.ts
│   ├── i18n.ts
│   └── main.tsx
└── package.json
```

---

<p align="center">
  <img src="public/logo-cge.svg" width="40" />
  &nbsp;
  <img src="public/logo-usj.svg" width="40" />
  &nbsp;
  <img src="public/logo-asesi.svg" width="40" />
  &nbsp;&nbsp;
  <strong>USJ × CGE × ASESI</strong> — Inovação com IA para o Serviço Público
</p>
