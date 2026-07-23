# LDO Dados SP

Dashboard de metas LDO e indicadores fiscais dos 645 municípios de SP (base do Radar Fiscal 360), alimentado por scrapers de dados públicos (SICONFI, AUDESP/TCE-SP, SIOPE, SIOPS, INEP, PPA/LDO/LOA) sincronizados para Neon.

## Stack

- **Linguagem:** TypeScript (app) + Python 3.12 (pipeline de scrapers/sync).
- **Framework:** Next.js 16.2.4 (App Router) + React 19.2.4 + Tailwind CSS 4.
- **UI/viz:** Recharts, `lucide-react`, `class-variance-authority`/`clsx`/`tailwind-merge`.
- **Banco:** Neon (Postgres serverless) via `@neondatabase/serverless` e `postgres`.
- **Export:** ExcelJS (XLSX).
- **Package manager:** npm (`package-lock.json`).
- **Deploy:** Vercel, montado em subpath `institutoi10.com.br/ldo-dados` (via `NEXT_PUBLIC_BASE_PATH`).

## Comandos

```bash
npm install
cp .env.local.example .env.local   # preencher DATABASE_URL
npm run db:migrate                  # aplica migrations SQL (scripts/run-migrations.mjs)
npm run db:seed                     # popula a partir dos arquivos dos scrapers
npm run dev                         # localhost:3030
npm run build                       # next build
npm run start                       # next start -p 3030
npm run lint                        # eslint (flat config em eslint.config.mjs)
```

Não há script de testes automatizados (ver seção Testes). O typecheck acompanha o `next build` (tsconfig com `noEmit`); para checar isoladamente use `npx tsc --noEmit`.

## Estrutura

- `src/app/` — rotas do App Router: dashboard, `municipio/`, `matriz-legal/`, `sobre/`, e `api/` (ex.: `api/health/route.ts`).
- `src/components/` — componentes React (gráficos, tabelas, layout).
- `src/lib/` — acesso ao Neon e utilitários compartilhados.
- `migrations/` — schema versionado em SQL (`0001_schema.sql` … `0010_acoes_empenhado.sql`). Ordem numérica importa.
- `scripts/` — `run-migrations.mjs` (aplica migrations), `seed-from-scrapers.mjs`, além de variante `.py`.
- `pipeline/` — scrapers Python (`siconfi_scraper.py`, `audesp_downloader.py`, `siope_scraper.py`, `siops_scraper.py`, `inep_scraper.py`, `ppa_ldo_loa_scraper.py`, `tce_despesas_programas.py`, `backfill_nacional.py`, `ibge_munic.py`) + scripts `sync_*.py` (grava no Neon), `regenerar_alertas.py`, `run_daily.sh`.
- `.github/workflows/` — automações agendadas (ver CI/CD).
- `next.config.ts` — `basePath` condicional; `tsconfig.json` com alias `@/*` → `./src/*`.

## Convenções de código

- **TypeScript strict** ligado (`strict: true`, `noEmit`, `moduleResolution: bundler`, `target ES2022`).
- Imports absolutos via alias `@/*`.
- Lint com ESLint 9 flat config (`eslint.config.mjs`) estendendo `eslint-config-next`. Rode `npm run lint` antes de commitar.
- UI em Tailwind 4 (`@tailwindcss/postcss`); componha classes com `clsx`/`tailwind-merge`.
- Scrapers Python: idempotentes/resumíveis (usam `*.status.json` por município); qualquer novo scraper deve seguir esse padrão para caber no orçamento de tempo dos workflows.

## Variáveis de ambiente

Nomes (valores nunca no repo — ver `.env.local.example`):

- `DATABASE_URL` — string de conexão do Neon. Em prod é secret do GitHub Actions e env var da Vercel.
- `NEXT_PUBLIC_BASE_PATH` — `/ldo-dados` quando servido em subpath (setar na Vercel).
- `SCRAPER_DATA_DIR`, `AUDESP_DATA_DIR` — diretórios locais dos scrapers (uso local/cron).

Configurar em `.env.local` (dev), Vercel Project Settings (app) e GitHub Secrets (workflows).

## CI/CD & Deploy

- **Deploy:** Vercel com auto-deploy da branch `main`.
- **Workflows agendados** (`.github/workflows/`), todos com `DATABASE_URL` via secret, concurrency group próprio e cache de dados brutos:
  - `pipeline-diario.yml` — diário 07:00 UTC (04:00 BRT): roda todos os scrapers SP com orçamento de tempo, sincroniza para Neon e regenera alertas dos 645 munis. Substitui o antigo crontab do Mac.
  - `backfill-nacional.yml` — a cada 3h: puxa SICONFI dos 5.570 munis do Brasil, uma UF por vez (fila em `uf_status`); NUNCA toca SP (já `ready`).
  - `ibge-munic.yml` — 1x/ano (15/jan) + manual: indicadores institucionais MUNIC/IBGE (aditivo, UPSERT, SP-only).
  - `programas-acoes.yml` — mensal (dia 5) + manual: ingestão pesada (~2 GB) de despesas/programas do TCE-SP.
- **Não há CI de PR** (lint/typecheck/build). Recomenda-se adicionar um workflow mínimo em PRs: `npm ci` → `npm run lint` → `npx tsc --noEmit` → `npm run build`.

## Boas práticas de PR

- Branch naming: `feat/…`, `fix/…`, `chore/…`.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:` …).
- PRs pequenos e focados. Checklist antes de abrir:
  - `npm run build` e `npm run lint` passam localmente.
  - Nenhum segredo ou `.env*` commitado.
  - Migrations novas em `migrations/` com numeração sequencial e, quando possível, plano de rollback.
  - Screenshots para mudanças de UI.
- Pelo menos 1 review; **squash merge**; `main` sempre deployável (é o que a Vercel publica).

## Testes

Não há suíte automatizada. Recomendação mínima proporcional: (1) manter `api/health` como smoke test; (2) validar migrations rodando `npm run db:migrate` contra um Neon de dev; (3) para scrapers, um teste de fumaça por município antes de rodar o pipeline completo.

## Segurança & dados

- Nunca commitar `.env.local` nem `DATABASE_URL` (já no `.gitignore`).
- Dados são públicos/agregados por município (SICONFI, TCE-SP, INEP etc.) — sem dados pessoais; ainda assim, tratar credenciais do Neon como sensíveis.
- Revisar dependências (`npm audit`) periodicamente; scrapers usam `requests`/`psycopg2` — fixar versões nas instalações dos workflows.

## Gotchas

- **`basePath`:** em prod o app roda sob `/ldo-dados`; links e assets devem respeitar `NEXT_PUBLIC_BASE_PATH`. Testar navegação com o basePath setado antes de publicar.
- **Orçamento de tempo dos workflows:** cada scraper tem timeout individual (~total 300min) abaixo do teto de 360min do Actions; a fase de sync sempre roda mesmo se um scraper estourar. Ao adicionar scraper, respeitar esse orçamento e a resumibilidade.
- **SP é intocável no backfill nacional:** o orquestrador pula SP (`uf_status = ready`). Não reintroduzir SP na fila nacional.
- **Ordem das migrations** é sensível — sempre criar arquivo novo com o próximo número, nunca editar migration já aplicada em prod.
- Há `run_watch.log`/`run_watch2.log` versionados por acidente; não adicione logs ao repo.
