# Operações — ldo-dados-sp

> Runbook operacional. Catálogo detalhado de dados em [`docs/DADOS.md`](docs/DADOS.md).
> Última atualização: 2026-07-12.

## 1. O que é

Dashboard ("Radar Fiscal 360") de **metas LDO e indicadores fiscais dos 645 municípios de São Paulo**, com engine de alertas e visão por persona:

| Tab | Persona | Foco |
|---|---|---|
| Secretário | Sec. de Finanças | Profundidade técnica, projeção, benchmark |
| Prefeito | Executivo | Narrativa visual, ranking, comparação histórica |
| Vereador | Fiscalizador | Evidência factual, tabela, export XLSX |

Stack: Next.js 16 + React 19 + Tailwind 4 + Recharts, Postgres serverless (Neon) via `@neondatabase/serverless`.

**Status (git log -3):**
- `46f92f4` 2026-06-17 — feat(radar): redesign dark command-center + módulos do doc de gestão (branch `redesign-conecta-dark`)
- `75b2a18` 2026-06-01 — fix(nacional): gate de publicação por base fiscal nacional + robustez do backfill RS
- `c5bdd5b` 2026-06-01 — fix(ci): pipeline resumível com orçamento de tempo + ano corrente primeiro

Há um backfill nacional em andamento (5.570 municípios, UF por UF, começando pelo RS) — SP fica intocado; UFs em staging só ficam visíveis após cobertura mínima (`uf_status`).

## 2. Onde roda

- **Produção:** https://www.institutoi10.com.br/ldo-dados (verificado HTTP 200 em 2026-07-12). O app é servido nesse subpath via **rewrite no projeto da LP do institutoi10** — por isso o `next.config.ts` lê `NEXT_PUBLIC_BASE_PATH=/ldo-dados` como `basePath`.
- **Deploy:** Vercel com integração GitHub (repo `Rruiz270/ldo-dados-sp`). **Push em `main` = deploy em produção.** Não há `.vercel/` nem `vercel.json` no repo — o projeto não está linkado localmente; deploys são automáticos a partir do GitHub.
- Branches de feature geram previews na Vercel; a branch de trabalho atual é `redesign-conecta-dark`.

## 3. Dados

- **Banco:** Postgres serverless (Neon), banco dedicado deste projeto, database `neondb`, schema `public`. Conexão via env var `DATABASE_URL` (nunca commitar o valor).
- **Fonte dos dados: o pipeline diário** (`pipeline/`), que roda às 04:00 (América/São_Paulo) e faz, em sequência:
  1. `siconfi_scraper.py` — SICONFI/Tesouro Nacional (RREO, DCA, RGF) → JSON/CSV em `pipeline/siconfi_data/`
  2. `audesp_downloader.py` — Audesp/TCE-SP (análises LRF, RCL mensal, receitas, dívida ativa) → `pipeline/audesp_data/`
  3. `siope_scraper.py` (FNDE), `siops_scraper.py` (DataSUS), `inep_scraper.py` (IDEB), `ppa_ldo_loa_scraper.py` (best-effort) → pastas `*_data/` correspondentes
  4. `sync_to_neon.py` + `sync_siope.py` + `sync_siops.py` + `sync_inep.py` + `sync_ppa_ldo.py` — sincronizam os arquivos brutos para o banco
  5. `regenerar_alertas.py` — recalcula a engine de alertas dos 645 municípios
- Os scrapers são **incrementais/resumíveis** (arquivos `*.status.json` por município nas pastas de dados).
- **Tabelas principais** (criadas por `migrations/0001..0008`, idempotentes, via `npm run db:migrate`):
  - Base: `municipios`, `publicacao_status`, `indicadores_lrf`, `indicadores_fiscais`, `despesa_por_funcao`, `raw_extracoes`
  - Radar 360: `fontes`, `extracoes`, `orgaos`, `unidades_orcamentarias`, `fontes_recursos`, `documentos_legais`, `ldo_metas_fiscais`, `programas`, `acoes`, `metas_fisicas`, `indicadores_educacao`, `indicadores_saude`, `ideb`, `indicadores_externos`, `divida_e_caixa`, `precatorios`, `riscos`, `solucoes_possiveis`, `alertas`, `providencias`, `matriz_legal`
  - Engine/gestão: `parametros_alerta`, `perfis_usuario`, `contratos_continuados`, `convenios`, `uf_status` (gate do backfill nacional)

## 4. Env vars

Somente **nomes** aqui — valores vivem na Vercel (app) e no `.env.local` do Mac mini (nunca no git; `.gitignore` cobre `pipeline/.env*`).

| Nome | Onde vive | Para quê |
|---|---|---|
| `DATABASE_URL` | Vercel (app) · `.env.local` na raiz do repo no mini (pipeline faz fallback para ele se a env não estiver setada) · secret do GitHub Actions | Conexão Postgres (Neon) |
| `NEXT_PUBLIC_BASE_PATH` | Vercel | `/ldo-dados` em prod (subpath via rewrite); vazio em dev local |
| `AUDESP_DATA_DIR` | `.env.local` no mini | Diretório dos dados brutos Audesp (seed/scripts) |
| `SCRAPER_DATA_DIR` | `.env.local` no mini | Diretório dos dados brutos SICONFI (seed/scripts) |
| `SICONFI_UFS` | opcional (env do processo / GitHub Actions) | Restringe UFs do scraper SICONFI (default `SP`; usado pelo backfill nacional) |
| `TIME_BUDGET_MIN` | GitHub Actions (`backfill-nacional.yml`) | Orçamento de tempo do backfill (sai limpo antes do teto de 6h) |

## 5. Como rodar local

```bash
npm install
cp .env.local.example .env.local   # preencher DATABASE_URL
npm run db:migrate                 # aplica migrations (CREATE TABLE IF NOT EXISTS, seguro)
npm run dev                        # http://localhost:3030 (porta 3030, sem basePath)
npm run build                      # build de produção
```

- Em dev local **não** setar `NEXT_PUBLIC_BASE_PATH` — o app roda na raiz. Em prod a Vercel injeta `/ldo-dados`.
- **Pipeline manual:** `bash pipeline/run_daily.sh` (no Mac mini).
  **⚠️ ATENÇÃO: o pipeline escreve direto no banco de PRODUÇÃO** (o mesmo `DATABASE_URL` que o painel lê) e pode levar horas. O log vai para `pipeline/logs/run_<timestamp>.log` e, ao final, dispara notificação nativa do macOS.
  Para rodar um passo isolado: `cd pipeline && python3 <script>.py` (o `DATABASE_URL` é lido da env ou, em fallback, do `.env.local` da raiz).

## 6. Crons & automations

| Onde | Agenda | O quê |
|---|---|---|
| **Crontab do Mac mini** | `0 4 * * *` (04:00 América/São_Paulo) | `/Users/raphaelruiz/Projects/ldo-dados-sp/pipeline/run_daily.sh` — pipeline completo (scrapers → sync Neon → alertas). Referência: `pipeline/crontab.txt` |
| **GitHub Actions** `pipeline-diario.yml` | `0 7 * * *` UTC (= 04:00 BRT) | Mesmo pipeline do `run_daily.sh` (com budgets de tempo por scraper e cache dos dados brutos). Foi criado como substituto quando o cron do Mac parou na migração de máquina; pode ser disparado manualmente via `workflow_dispatch` para catch-up |
| **GitHub Actions** `backfill-nacional.yml` | `30 */3 * * *` (a cada 3h) | Backfill SICONFI nacional, uma UF incompleta por run (fila em `uf_status`); `workflow_dispatch` aceita input `uf` |

**Nota:** hoje o cron do mini **está ativo** (há log de hoje em `pipeline/logs/`) e o Actions diário também está agendado — os dois rodam no mesmo horário. Os scrapers são incrementais e os syncs idempotentes, então não corrompe, mas é trabalho duplicado; se for desligar um dos dois, prefira manter o que estiver monitorado.

- **Logs do pipeline (mini):** `pipeline/logs/run_YYYY-MM-DD_HH-MM-SS.log` (retém os 30 mais recentes; o `run_daily.sh` apaga os antigos).
- **Logs do Actions:** aba Actions do repo no GitHub.

## 7. Diagnóstico rápido

- **App no ar?**
  `curl -s -o /dev/null -w '%{http_code}' https://www.institutoi10.com.br/ldo-dados` → esperado `200`.
- **O pipeline de ontem/hoje rodou?** (no mini)
  ```bash
  ls -t /Users/raphaelruiz/Projects/ldo-dados-sp/pipeline/logs/run_*.log | head -1
  tail -20 "$(ls -t /Users/raphaelruiz/Projects/ldo-dados-sp/pipeline/logs/run_*.log | head -1)"
  ```
  Um run saudável termina com `FIM regeneração — ok=645 falhas=0 ...` e `Run finalizado: <data>`. O nome do arquivo traz o timestamp de início (deve haver um `run_<hoje>_04-00-*.log`).
- **Painel com dados desatualizados = pipeline falhou.** Checar nesta ordem:
  1. Log mais recente em `pipeline/logs/` — qual scraper falhou (seções `--- SICONFI ---`, `--- Audesp ---`, etc.) e se a fase `Sync → Neon` rodou;
  2. Run do dia em GitHub Actions (`pipeline-diario.yml`) — warnings de budget/falha por step;
  3. O Mac mini estava ligado às 04:00? (`crontab -l` para confirmar a entrada; `pmset -g` para energia);
  4. `DATABASE_URL` válido (Neon pode ter rotacionado credencial) — testar com `python3 -c "import psycopg2,os; psycopg2.connect(os.environ['DATABASE_URL'])"`;
  5. Se só os alertas estiverem defasados: rodar `cd pipeline && python3 regenerar_alertas.py`.
- **Migrations pendentes:** `npm run db:migrate` (idempotente).
