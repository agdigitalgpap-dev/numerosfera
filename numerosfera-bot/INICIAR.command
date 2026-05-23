#!/bin/bash
# Clique duas vezes neste arquivo para iniciar o bot de carrosséis

cd "$(dirname "$0")"
echo ""
echo "======================================"
echo "  NUMEROSFERA — Bot de Carrosséis"
echo "======================================"
echo ""
echo "Iniciando..."
echo "Carrosséis serão gerados todo dia às 7h."
echo "Uma notificação aparecerá no seu Mac quando estiver pronto."
echo ""
node auto-carrossel.js
