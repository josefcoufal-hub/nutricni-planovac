#!/usr/bin/env bash
# Spustí všechny automatické testy. Prohlížečové testy (E2E) vyžadují Node balíček „playwright“ s nainstalovaným Chromiem;
# přeskočíte je příkazem  E2E=0 ./test-all.sh
set -euo pipefail
cd "$(dirname "$0")"
echo "== API (Java): sestavení + testy";            ./api/build.sh test
echo "== Frontend: jednotkové testy";               node frontend/test/core.test.js | tail -1
echo "== Frontend: sestavení (artefakt i server)";  (cd frontend && node build.js && node build.js --server)
echo "== Web (Node.js): testy proti skutečnému API"; (cd web && npm test 2>&1 | grep -E '^# (tests|pass|fail)')
if [ "${E2E:-1}" = "1" ]; then
  echo "== E2E v prohlížeči: samostatná verze"
  for f in frontend/test/e2e2.js frontend/test/e2e3.js frontend/test/e2e4.js frontend/test/e2e5.js frontend/test/e2e6.js frontend/test/e2e7.js frontend/test/e2e8.js; do
    node "$f" | tail -1
  done
  echo "== E2E v prohlížeči: celý zásobník (Java API + Node web + frontend)"
  node e2e/fullstack.js | tail -1
fi
echo "Vše prošlo."
