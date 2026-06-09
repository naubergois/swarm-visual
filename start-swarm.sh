#!/bin/bash
# 🐝 Swarm Visual — Inicialização Rápida
# Enxame de Agentes IA + WhatsApp Chat (wacli-bridge)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🐝 Swarm Visual — Enxame de Agentes IA"
echo "========================================"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependências..."
  npm install
fi

echo "🎯 Iniciando MCP server qclaw-cards (SSE :9200)..."
node server/mcp-server.mjs &
MCP_PID=$!

sleep 1

echo "📱 Iniciando wacli-bridge (WebSocket :9300)..."
node server/wacli-bridge.mjs &
WACLI_PID=$!

# Aguardar bridge iniciar
sleep 1

echo "🚀 Iniciando servidor de desenvolvimento (Vite :5173)..."
echo ""
echo "   🌐 Frontend:     http://localhost:5173"
echo "   🎯 MCP server:   http://localhost:9200 (qclaw-cards)"
echo "   📱 wacli-bridge: ws://localhost:9300"
echo ""
echo "   O chat WhatsApp (wacli) aparece no canto inferior direito!"
echo "   Pressione Ctrl+C para parar tudo"
echo ""

# Trap para limpar processos ao sair
cleanup() {
  echo ""
  echo "🛑 Parando serviços..."
  kill $MCP_PID 2>/dev/null
  kill $WACLI_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

npx vite --host

# Cleanup on exit
kill $MCP_PID 2>/dev/null
kill $WACLI_PID 2>/dev/null
