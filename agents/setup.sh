#!/bin/bash
# Setup de agentes Metanoia — ejecutar UNA SOLA VEZ
# Requiere: ant CLI instalado y autenticado con ANTHROPIC_API_KEY

set -e

echo "Creando entorno..."
ENV_ID=$(ant beta:environments create < financiero.env.yaml --transform id -r)
echo "ENV_ID=$ENV_ID"

echo "Creando agente financiero..."
AGENT_ID=$(ant beta:agents create < financiero.agent.yaml --transform id -r)
echo "AGENT_ID=$AGENT_ID"

echo ""
echo "✅ Setup completo. Guardá estos IDs en tu .env:"
echo "METANOIA_ENV_ID=$ENV_ID"
echo "METANOIA_FINANCIERO_AGENT_ID=$AGENT_ID"
