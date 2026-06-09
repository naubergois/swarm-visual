#!/bin/bash
# ============================================================
# Setup wacli — WhatsApp CLI para o Swarm Visual
# ============================================================
# wacli: CLI Go que conecta como dispositivo WhatsApp Web
# Repo: https://github.com/openclaw/wacli
# Docs: https://wacli.sh
# ============================================================

echo "📱 Configurando wacli para WhatsApp..."
echo ""

# Verificar se wacli está instalado
if command -v wacli &> /dev/null; then
    echo "✅ wacli já está instalado: $(wacli version 2>/dev/null || echo 'versão desconhecida')"
else
    echo "⬇️  Instalando wacli via Homebrew..."
    echo ""
    
    if command -v brew &> /dev/null; then
        brew install openclaw/tap/wacli
    else
        echo "❌ Homebrew não encontrado. Instale manualmente:"
        echo "   brew install openclaw/tap/wacli"
        echo ""
        echo "   Ou compile do fonte:"
        echo "   CGO_ENABLED=1 go install -tags sqlite_fts5 github.com/openclaw/wacli/cmd/wacli@latest"
        exit 1
    fi
fi

echo ""

# Verificar autenticação
echo "🔐 Verificando autenticação..."
if wacli doctor --json 2>/dev/null | grep -q '"ok"'; then
    echo "✅ wacli já está autenticado!"
else
    echo ""
    echo "⚠️  Você precisa autenticar escaneando o QR Code:"
    echo ""
    echo "   Execute: wacli auth"
    echo ""
    echo "   Depois abra o WhatsApp no celular → Dispositivos vinculados → Vincular dispositivo"
    echo "   e escaneie o QR Code que aparecer no terminal."
    echo ""
    read -p "Deseja autenticar agora? (s/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
        wacli auth
    fi
fi

echo ""
echo "============================================================"
echo "📋 Comandos úteis do wacli:"
echo "============================================================"
echo ""
echo "  wacli auth                              # Autenticar (QR Code)"
echo "  wacli sync --follow                     # Sync em tempo real"
echo "  wacli send text --to 5585... --message 'Oi'  # Enviar mensagem"
echo "  wacli messages search 'reunião'         # Buscar mensagens"
echo "  wacli contacts list                     # Listar contatos"
echo "  wacli chats list                        # Listar chats"
echo ""
echo "============================================================"
echo "🚀 Para iniciar o Swarm Visual com chat WhatsApp:"
echo ""
echo "   ./start-swarm.sh"
echo ""
echo "   Isso inicia:"
echo "   • wacli-bridge (WebSocket :9300) — ponte entre frontend e wacli"
echo "   • Vite dev server (:5173) — frontend React"
echo "============================================================"
