#!/usr/bin/env bash
# Puxa a versão nova do GitHub e reinicia o rastreador.
# Se os testes ou a checagem de saúde falharem, volta para a versão anterior.
# Rodado a cada minuto pelo tracking-update.timer.
set -euo pipefail
cd "${TRACKING_DIR:-/opt/tracking}"

git fetch -q origin main
ATUAL=$(git rev-parse HEAD)
NOVA=$(git rev-parse origin/main)
[ "$ATUAL" = "$NOVA" ] && exit 0
# Versão que já falhou: espera um commit novo em vez de tentar de novo.
[ "$(cat .versao-com-falha 2>/dev/null)" = "$NOVA" ] && exit 0

echo "Atualizando $ATUAL -> $NOVA"
# .env e dados/ estão no .gitignore: o reset não mexe neles.
git reset -q --hard "$NOVA"

voltar() {
  echo "FALHOU ($1). Voltando para $ATUAL"
  git reset -q --hard "$ATUAL"
  echo "$NOVA" > .versao-com-falha
  systemctl restart tracking
  exit 1
}

npm test --silent >/tmp/tracking-testes.log 2>&1 || voltar "testes, veja /tmp/tracking-testes.log"

systemctl restart tracking
for i in $(seq 1 15); do
  sleep 1
  if curl -fsS http://127.0.0.1:${PORT:-3100}/saude >/dev/null 2>&1; then
    rm -f .versao-com-falha
    echo "OK: rodando $NOVA"
    exit 0
  fi
done
voltar "servidor não respondeu /saude"
