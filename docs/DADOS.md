# 📊 Catálogo Completo de Dados — LDO Dados SP

> Documentação master de **todos** os dados coletados, processados e armazenados no projeto.
> Use isso como referência antes de criar qualquer nova feature.
> Última atualização: 2026-05-24

---

## Índice

1. [Pipeline geral](#1-pipeline-geral)
2. [Fontes oficiais](#2-fontes-oficiais)
3. [Dados crus por dataset](#3-dados-crus-por-dataset)
   - 3.1 SICONFI · RREO (8 anexos)
   - 3.2 SICONFI · DCA (7 anexos)
   - 3.3 SICONFI · RGF (6 anexos)
   - 3.4 Audesp · Análises
   - 3.5 Audesp · RCL Completo
   - 3.6 Audesp · Receitas
   - 3.7 Audesp · Dívida Ativa
   - 3.8 Audesp · Alertas (legado)
4. [Banco de dados Neon](#4-banco-de-dados-neon)
5. [Indicadores derivados](#5-indicadores-derivados)
6. [Áreas-fim (Lei 4.320/64 + Portaria MOG 42/99)](#6-áreas-fim)
7. [Cobertura atual](#7-cobertura-atual)
8. [Gaps conhecidos](#8-gaps-conhecidos)
9. [Padrões de uso (queries comuns)](#9-padrões-de-uso)

---

## 1. Pipeline geral

```
┌──────────────────────────────────────────────────────────────┐
│  Cron 4h diário (Mac mini, run_daily.sh)                     │
│                                                                │
│  ① siconfi_scraper.py   → SICONFI/Tesouro Nacional API       │
│     ↓ 7.6 GB JSON+CSV em ~/Projects/ldo-dados-sp/pipeline/siconfi_data│
│                                                                │
│  ② audesp_downloader.py → TCE-SP bulk CSV/ZIP downloads      │
│     ↓ 73 MB em ~/Projects/ldo-dados-sp/pipeline/audesp_data        │
│                                                                │
│  ③ sync_to_neon.py      → upserta tudo no Neon Postgres      │
│     ↓                                                          │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Neon Postgres (project ldo-dados-sp / db neondb)            │
│  Tabelas: municipios, publicacao_status, indicadores_lrf,    │
│           despesa_por_funcao, raw_extracoes (vazia)          │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Next.js app (Vercel ldo-dados-sp.vercel.app)                │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Fontes oficiais

| Fonte | Operador | API/Acesso | Cobertura |
|---|---|---|---|
| **SICONFI** | Tesouro Nacional (STN) | REST API pública | Todos os 5.570 municípios BR (filtramos SP=645) |
| **Audesp** | TCE-SP | Bulk download ZIPs/CSVs públicos | 644 municípios SP (sem capital) |
| TCM-SP | Tribunal de Contas do Município de SP | (não usado ainda) | Apenas SP capital |
| Tesouro Transparente (FINBRA) | STN | Dataset histórico CSV | (não usado, redundante com SICONFI) |
| IBGE MUNIC | IBGE | (não usado) | Indicadores institucionais municipais |
| DataSUS/SIOPS | Ministério Saúde | (não usado) | Aplicação mínima saúde |
| FNDE/SIOPE | FNDE | (não usado) | Aplicação mínima educação |

---

## 3. Dados crus por dataset

### 3.1 SICONFI · RREO (Relatório Resumido da Execução Orçamentária)

**Periodicidade:** bimestral (1 = jan-fev, 2 = mar-abr, ..., 6 = nov-dez)
**Prazo legal de publicação:** 30 dias após fim do bimestre (LRF Art. 52)
**Quem reporta:** prefeito/secretário de finanças via portal SICONFI
**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/siconfi_data/rreo_{ano}_bim{N}.json` (e `.csv`)
**Status por município:** `rreo_{ano}_bim{N}.status.json` (PUBLICADO | NAO_PUBLICADO | ERRO_COLETA)
**Cobertura atual:** ~530/645 municípios por bimestre (82% — gap estrutural, ~115 nunca publicam no prazo)

#### Anexos coletados (8 dos ~16 disponíveis)

##### RREO-Anexo 01 · Balanço Orçamentário
- **O que é:** Receita prevista vs realizada, despesa autorizada vs executada (visão macro do orçamento).
- **Contas-chave** (campo `conta`):
  - `RECEITAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)` — total receitas próprias
  - `RECEITAS (INTRA-ORÇAMENTÁRIAS) (II)` — repasses internos
  - `TOTAL DAS RECEITAS (III) = (I+II)` — total geral
  - `DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)`, `(II)`, `TOTAL (III)`
- **Colunas:**
  - `PREVISÃO INICIAL`, `PREVISÃO ATUALIZADA` — receita esperada
  - `RECEITAS REALIZADAS BIMESTRE`, `... ATÉ O BIMESTRE` — receita arrecadada
  - `% (b/a)` — % realizado / previsto
  - `SALDO A REALIZAR`
- **Uso atual:** não consumido no app (V2: dashboard executivo)

##### RREO-Anexo 02 · Despesas por Função/Subfunção 🌟
- **O que é:** Despesa orçada (LOA) e executada por **função de governo** (educação, saúde, segurança, etc.) e suas subfunções.
- **Contas-chave:** ~170 entradas — funções principais + subfunções. Lista completa de funções:
  - **Áreas-fim** (`eh_area_fim=true` no DB): Educação, Saúde, Assistência Social, Cultura, Urbanismo, Habitação, Saneamento, Gestão Ambiental, Desporto e Lazer, Agricultura, Segurança Pública, Trabalho, Transporte, Direitos da Cidadania, Ciência e Tecnologia, Indústria, Comércio e Serviços, Comunicações, Energia, Defesa Nacional, Organização Agrária, Relações Exteriores
  - **Áreas-meio**: Legislativa, Judiciária, Essencial à Justiça, Administração, Previdência Social, Encargos Especiais, Reserva de Contingência
- **Colunas-chave:**
  - `DOTAÇÃO INICIAL` ⭐ — **a meta original da LOA** (o "planejado" da LDO operacionalizado)
  - `DOTAÇÃO ATUALIZADA (a)` — após alterações orçamentárias
  - `DESPESAS EMPENHADAS NO BIMESTRE` / `... ATÉ O BIMESTRE (b)` — comprometido
  - `DESPESAS LIQUIDADAS NO BIMESTRE` / `... ATÉ O BIMESTRE (d)` — gasto efetivo
  - `% (b/total b)` — quanto a função representa do total empenhado
  - `% (d/total d)` — quanto representa do total liquidado
  - `INSCRITAS EM RESTOS A PAGAR NÃO PROCESSADOS (f)`
- **Tabela DB:** `despesa_por_funcao` (popula 25k+ linhas)
- **Uso atual:** Cards de áreas-fim no app

##### RREO-Anexo 03 · Receita Corrente Líquida (RCL)
- **O que é:** RCL — base de cálculo dos limites da LRF (pessoal 60%, dívida 1,2x, etc.).
- **Contas-chave** (campo `cod_conta`):
  - `RREO3ReceitaCorrenteLiquida` — RCL bruta
  - `RREO3ReceitaCorrenteLiquidaAjustadaParaCalculoDosLimitesDaDespesaComPessoal` — RCL ajustada (pessoal)
  - `RREO3ReceitaCorrenteLiquidaAjustadaParaCalculoDosLimitesDeEndividamento` — RCL ajustada (dívida)
  - Componentes: Cota-Parte FPM, ICMS, IPVA, ITR, IPTU, ISS, IRRF, ITBI, contribuições, etc.
- **Colunas:**
  - `<MR>`, `<MR-1>`, ..., `<MR-11>` — valores mensais retrospectivos (MR = mês de referência)
  - `TOTAL (ÚLTIMOS 12 MESES)` ⭐ — RCL consolidada
  - `PREVISÃO ATUALIZADA {ano}` — RCL esperada pro ano todo
- **Uso atual:** não consumido (V2: base de cálculo dos limites LRF)

##### RREO-Anexo 04 · Receitas/Despesas Previdenciárias
- **O que é:** Movimentação do RPPS (Regime Próprio de Previdência) — receitas, despesas, déficit/superávit atuarial.
- **Cobertura:** apenas municípios com RPPS próprio (não os que usam só INSS)
- **Uso atual:** não consumido

##### RREO-Anexo 06 · Resultado Primário (DRP)
- **O que é:** Resultado primário (receita primária – despesa primária) — meta da LDO (AMF).
- **Contas-chave:** Receita Primária, Despesa Primária, Resultado Primário
- **Uso atual:** não consumido (V2: dashboard de meta fiscal)

##### RREO-Anexo 07 · Restos a Pagar
- **O que é:** Despesas empenhadas em exercícios anteriores não pagas — dívida flutuante.
- **Uso atual:** não consumido

##### RREO-Anexo 13 · Parcerias Público-Privadas (PPPs)
- **O que é:** Compromissos com PPPs (concessões de longo prazo).
- **Cobertura:** quase sempre vazio (poucos municípios têm PPP)
- **Uso atual:** não consumido

##### RREO-Anexo 14 · Demonstrativo Simplificado
- **O que é:** Versão resumida pra municípios pequenos (<50k hab).
- **Uso atual:** não consumido (info redundante com 01-07)

---

### 3.2 SICONFI · DCA (Declaração de Contas Anuais)

**Periodicidade:** anual
**Prazo legal:** 30/abr do ano seguinte (LRF Art. 51)
**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/siconfi_data/dca_{ano}.json`
**Cobertura atual:** 645/645 (2024) | 610/645 (2025, 35 em atraso)

#### Anexos coletados (7)

##### DCA-Anexo I-AB · Balanço Patrimonial
- Ativo e Passivo do município (fotografia patrimonial em 31/dez)

##### DCA-Anexo I-C · Variações Patrimoniais
- Demonstrativo de variações ao longo do exercício

##### DCA-Anexo I-D · Despesas Orçamentárias por Natureza
- Despesas classificadas por categoria econômica (corrente vs capital), grupo (pessoal, juros, investimentos...), modalidade

##### DCA-Anexo I-E · Receitas Orçamentárias por Natureza
- Receitas por categoria (corrente vs capital), origem, espécie

##### DCA-Anexo I-F · Despesas por Função 🎯
- Mesma estrutura do RREO Anexo 02, mas **consolidada ao fim do exercício** (mais precisa que a estimativa do bimestre 6).
- **Uso atual:** não consumido (V2: substituir RREO bim6 por DCA quando disponível)

##### DCA-Anexo I-G · Dívida Consolidada
- Dívida consolidada (longo prazo) por modalidade (interna/externa, contratual/mobiliária)

##### DCA-Anexo I-HI · Receitas de Impostos e Aplicação MDE/Saúde
- Receitas de impostos + aplicação mínima em educação (25%) e saúde (15%)
- **Cruza com Audesp Análises** — uma fonte alternativa pros indicadores LRF de educ/saúde

---

### 3.3 SICONFI · RGF (Relatório de Gestão Fiscal)

**Periodicidade:** quadrimestral (Q1=jan-abr, Q2=mai-ago, Q3=set-dez)
**Prazo legal:** 30 dias após fim do quadrimestre (LRF Art. 55)
**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/siconfi_data/rgf_{ano}_q{N}.json`
**Cobertura atual:** ~525-530/645 por quadrimestre
**Periodicidade alternativa (S):** semestral, só pra municípios < 50k hab que escolheram simplificado

#### Anexos coletados (6)

##### RGF-Anexo 01 · Despesa com Pessoal 🎯
- **Conta-chave:** `DespesaComPessoalBruta` ("DESPESA BRUTA COM PESSOAL (I)")
- **Colunas:**
  - `<MR-11>` a `<MR>` — DTP mensal
  - `TOTAL (ÚLTIMOS 12 MESES) (a)` ⭐ — DTP consolidada
  - `INSCRITAS EM RESTOS A PAGAR NÃO PROCESSADOS (b)`
- **Limites legais** (mesma extração):
  - `LimiteMaximoDespesaComPessoalTotal` — 60% RCL (Executivo Municipal)
  - `LimitePrudencialDespesaComPessoalTotal` — 54%
  - `LimiteDeAlertaDespesaComPessoalTotal` — 51,3%
- **Uso atual:** não consumido pelo app (Audesp Análises já dá o % consolidado, mais simples)

##### RGF-Anexo 02 · Dívida Consolidada Líquida (DCL)
- **Conta-chave:** `PercentualDaDCLSobreARCL` ⭐ — % direto (limite 1,2× RCL = 120%)
- Demais: `DividaConsolidada`, `DividaConsolidadaLiquida`, `DividaContratual`, componentes
- **Uso atual:** não consumido pelo app (V2: card dívida)

##### RGF-Anexo 03 · Garantias e Contragarantias
- Garantias dadas pelo município (raro — quase sempre vazio).

##### RGF-Anexo 04 · Operações de Crédito
- Novos empréstimos contratados. Limite: receitas op. crédito ≤ despesas de capital (regra de ouro).

##### RGF-Anexo 05 · Restos a Pagar
- Restos a pagar com disponibilidade de caixa (importante pra fim de mandato — Art. 42 LRF).

##### RGF-Anexo 06 · Demonstrativo Simplificado
- Versão consolidada pra prefeitos. Redundante.

---

### 3.4 Audesp · Análises 🎯

**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/audesp_data/analises/resultado_analises_audesp.zip` → `resultado_analises_audesp.csv`
**Encoding:** latin-1 (precisa converter pra UTF-8)
**Separador:** `;`
**Decimal:** vírgula (`,`)
**Atualização:** mensal (TCE-SP processa madrugada do dia 1)
**Cobertura:** 644 municípios SP × ~9 anos (2016-2024) — **sem SP capital**
**Tabela DB:** `indicadores_lrf` (fonte = 'Audesp')

#### Schema do CSV

| # | Coluna | Tipo | Tabela DB |
|---|---|---|---|
| 1 | Exercício | INT (ano) | `exercicio` |
| 2 | Código IBGE | INT | `cod_ibge` |
| 3 | Município | string | (lookup) |
| 4 | Resultado da Execução Orçamentária (Valor) | NUMERIC R$ | (não usado) |
| 5 | Resultado da Execução Orçamentária (%) | decimal | indicador `resultado_execucao` |
| 6 | Despesa Empenhada FUNDEB (%) | decimal | indicador `fundeb` |
| 7 | Despesa Empenhada FUNDEB Profissionais Educação (%) | decimal | indicador `fundeb_profissionais` |
| 8 | Despesa Empenhada Ensino | NUMERIC R$ | (não usado) |
| 9 | Despesa Empenhada Ensino (%) | decimal | indicador `educacao` |
| 10 | Despesa Empenhada Saúde | NUMERIC R$ | (não usado) |
| 11 | Despesa Empenhada Saúde (%) | decimal | indicador `saude` |
| 12 | Despesa com Pessoal Poder Executivo | NUMERIC R$ | (não usado) |
| 13 | Despesa com Pessoal Poder Executivo (%) | decimal | indicador `pessoal` |

**Limites legais aplicados pelo sync:**
- `pessoal` → max 60% (LC 101/2000)
- `educacao` → min 25% (CF Art. 212)
- `saude` → min 15% (CF Art. 198 + LC 141/2012)
- `fundeb` → min 100% (CF Art. 212-A — repasse integral)
- `fundeb_profissionais` → min 70% (LC 26/2007)

---

### 3.5 Audesp · RCL Completo

**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/audesp_data/rcl/rcl_completo.zip` → `rcl_completo.csv`
**Atualização:** semanal (TCE-SP atualiza todo sábado madrugada)
**Cobertura:** mensal por município, 2015-atual

- RCL atualizada mensalmente. Mais fresca que SICONFI (que é bimestral).
- **Uso atual:** não consumido pelo app (V2: substituir RCL do SICONFI)

---

### 3.6 Audesp · Receitas anuais

**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/audesp_data/receitas/receitas-{ano}.zip`
**Cobertura:** 2024, 2025 (2026 ainda não publicado)
**Atualização:** semanal

- Receitas detalhadas por município, por fonte de recurso. Granularidade alta.
- **Uso atual:** não consumido (V2: drill-down de receitas)

---

### 3.7 Audesp · Dívida Ativa

**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/audesp_data/divida-ativa/Divida_Ativa_2019_2024.csv`
**Cobertura:** 2019-2024 consolidado

- Estoque de dívida ativa municipal (IPTU/ISS/multas não pagos). Indicador de capacidade de arrecadação.
- **Uso atual:** não consumido (V2: indicador "% RCL inscrita em dívida ativa")

---

### 3.8 Audesp · Alertas (LEGADO)

**Arquivo local:** `~/Projects/ldo-dados-sp/pipeline/audesp_data/alertas/alertas_analitico.csv`
**Status:** ⚠️ **abandonado pelo TCE-SP em 2019** (Last-Modified 07/jun/2019)
**Uso atual:** referência histórica apenas. Não use pra dados pós-2019.

---

## 4. Banco de dados Neon

**Project:** `ldo-dados-sp`
**Database:** `neondb`
**Host:** `ep-late-fog-aqc2wy62-pooler.c-8.us-east-1.aws.neon.tech`
**Driver no app:** `postgres` (NÃO `@neondatabase/serverless` — bug v1.1.0)

### 4.1 Tabela `municipios`

| Coluna | Tipo | Descrição |
|---|---|---|
| `cod_ibge` (PK) | BIGINT | Código IBGE 7 dígitos (ex: 3500105 = Adamantina) |
| `nome` | TEXT | Nome oficial |
| `populacao` | INTEGER | População IBGE mais recente |
| `faixa_pop` | TEXT | `ate_5k` / `5k_20k` / `20k_50k` / `50k_100k` / `100k_500k` / `acima_500k` |
| `regiao` | TEXT | (vazio — V2: preencher com regiões administrativas) |
| `uf` | CHAR(2) | sempre `SP` |
| `updated_at` | TIMESTAMPTZ | última sincronização |

**Cobertura:** 645/645 ✓

### 4.2 Tabela `publicacao_status`

| Coluna | Tipo | Descrição |
|---|---|---|
| `cod_ibge` (PK) | BIGINT | Município |
| `dataset` (PK) | TEXT | ex: `rreo_2024_bim1`, `dca_2025`, `rgf_2024_q1` |
| `status` | TEXT | `PUBLICADO` / `NAO_PUBLICADO` / `ERRO_COLETA` |
| `atualizado_em` | TIMESTAMPTZ | última verificação |

**Cobertura:** 13.545 rows (645 munis × 21 extrações elegíveis)

### 4.3 Tabela `indicadores_lrf` 🎯

| Coluna | Tipo | Descrição |
|---|---|---|
| `cod_ibge` (PK) | BIGINT | |
| `exercicio` (PK) | INTEGER | Ano (2016-2024) |
| `periodo` (PK) | INTEGER | 0 pra anual; 1-6 bimestre; 1-3 quadrimestre |
| `periodicidade` (PK) | CHAR(1) | `A`/`B`/`Q` |
| `indicador` (PK) | TEXT | `pessoal`/`educacao`/`saude`/`fundeb`/`fundeb_profissionais`/`resultado_execucao` |
| `valor` | NUMERIC | % do indicador (ex: 47.55) |
| `base_calculo` | NUMERIC | (vazio no V1) |
| `limite_legal` | NUMERIC | 60 (pessoal), 25 (educ), 15 (saúde), 100 (fundeb), 70 (fundeb_prof), NULL |
| `pct_do_limite` | NUMERIC | valor / limite × 100 |
| `fonte` | TEXT | `Audesp` (V1) — V2 cruzará com `RGF` e `RREO` |
| `atualizado_em` | TIMESTAMPTZ | |

**Cobertura:** 37.996 rows

### 4.4 Tabela `despesa_por_funcao` 🎯

| Coluna | Tipo | Descrição |
|---|---|---|
| `cod_ibge` (PK) | BIGINT | |
| `exercicio` (PK) | INTEGER | Ano |
| `periodo` (PK) | INTEGER | Bimestre RREO (1-6) |
| `funcao` (PK) | TEXT | Nome da função (Educação, Saúde, ...) |
| `eh_subfuncao` | BOOLEAN | true se é subfunção (ainda não coletado) |
| `eh_area_fim` | BOOLEAN | true se presta serviço direto à população |
| `funcao_pai` | TEXT | pra subfunções (vazio no V1) |
| `dotacao_inicial` | NUMERIC R$ | **META da LOA original** ⭐ |
| `dotacao_atualizada` | NUMERIC R$ | Após alterações orçamentárias |
| `empenhado` | NUMERIC R$ | Comprometido |
| `liquidado` | NUMERIC R$ | Gasto efetivo |
| `pct_do_total` | NUMERIC | % do total de despesas |
| `atualizado_em` | TIMESTAMPTZ | |

**Cobertura:** 25.438 rows (530 munis × 29 funções × 3 períodos: 2024 B6, 2025 B6, 2026 B1)

### 4.5 Tabela `raw_extracoes` (NÃO USADA)

JSONB pra snapshot bruto. Existe pro caso de debug, mas hoje não populamos.

### 4.6 View `vw_cobertura_municipio`

| Coluna | Descrição |
|---|---|
| `cod_ibge`, `nome`, `populacao` | (de municipios) |
| `publicados` | COUNT extrações onde munic publicou |
| `nao_publicados` | COUNT NAO_PUBLICADO |
| `erros` | COUNT ERRO_COLETA |
| `total_extracoes` | Total de datasets esperados |

---

## 5. Indicadores derivados

### 5.1 Indicadores LRF — semáforo de cumprimento

| Indicador | Limite legal | Semântica | Onde está |
|---|---|---|---|
| **Pessoal** (DTP/RCL) | ≤ 60% | máximo | `indicadores_lrf.indicador='pessoal'` |
| **Educação** (% impostos) | ≥ 25% | mínimo | `indicadores_lrf.indicador='educacao'` |
| **Saúde** (% impostos) | ≥ 15% | mínimo | `indicadores_lrf.indicador='saude'` |
| **FUNDEB** (% repasse) | = 100% | exato | `indicadores_lrf.indicador='fundeb'` |
| **FUNDEB Profissionais** | ≥ 70% | mínimo | `indicadores_lrf.indicador='fundeb_profissionais'` |
| **Dívida Consolidada** (DCL/RCL) | ≤ 120% | máximo | (não populado V1 — RGF Anexo 02) |
| **Resultado Execução** (sup./déf.) | livre | informativo | `indicadores_lrf.indicador='resultado_execucao'` |

**Função `lrfColor(pctOfLimit)`** (em `src/lib/theme.ts`):
- ≥95% → vermelho
- ≥90% → amarelo
- ≥80% → azul
- <80% → verde

### 5.2 Áreas-fim — % executado / dotação

Para cada (município, ano, função): `liquidado / dotacao_inicial × 100`. Indica:
- ~100% = executou o planejado (bom planejamento)
- <80% = subexecutou (problema de capacidade ou contingenciamento)
- >120% = superou meta (alteração orçamentária no meio do ano)

---

## 6. Áreas-fim

Classificação funcional brasileira (Lei 4.320/64 + Portaria MOG 42/99). Subset usado no app, marcado como `eh_area_fim=true`:

### Sociais
| # | Função | Subfunções típicas | Quem cuida |
|---|---|---|---|
| 08 | **Assistência Social** | Assistência ao Idoso, à Criança, à Pessoa com Deficiência, aos Povos Indígenas, Comunitária, Alimentação e Nutrição | Sec. Assistência Social / Cidadania |
| 10 | **Saúde** | Atenção Básica, Assistência Hospitalar, Vigilância Sanitária, Vigilância Epidemiológica, Suporte Profilático | Sec. Saúde |
| 11 | **Trabalho** | Empregabilidade, Fomento ao Trabalho, Proteção Trabalhador | Sec. Trabalho/Desenvolvimento |
| 12 | **Educação** | Educação Infantil, Ensino Fundamental, Médio, Profissional, Superior, EJA, Especial | Sec. Educação |
| 13 | **Cultura** | Difusão Cultural, Patrimônio Histórico | Sec. Cultura |
| 14 | **Direitos da Cidadania** | Direitos Individuais Coletivos e Difusos | Sec. Cidadania |

### Infraestrutura
| # | Função | Subfunções típicas | Quem cuida |
|---|---|---|---|
| 15 | **Urbanismo** | Infra-Estrutura Urbana, Serviços Urbanos, Ordenamento Territorial | Sec. Obras / Urbanismo |
| 16 | **Habitação** | Habitação Urbana, Rural | Sec. Habitação |
| 17 | **Saneamento** | Saneamento Básico Urbano, Rural | Sec. Saneamento / Obras |
| 18 | **Gestão Ambiental** | Preservação e Conservação, Controle Ambiental, Recursos Hídricos, Recuperação de Áreas Degradadas | Sec. Meio Ambiente |
| 26 | **Transporte** | Rodoviário, Aéreo, Aquaviário, Coletivos Urbanos, Especiais | Sec. Transportes/Mobilidade |

### Outros
| # | Função | Subfunções típicas | Quem cuida |
|---|---|---|---|
| 06 | **Segurança Pública** | Policiamento, Defesa Civil, Informação e Inteligência | Sec. Segurança / Guarda Municipal |
| 19 | **Ciência e Tecnologia** | Desenvolvimento Científico, Tecnológico, Difusão Conhecimento | Sec. Tec/Inovação |
| 20 | **Agricultura** | Promoção Produção Agropecuária, Defesa Agropecuária, Extensão Rural, Abastecimento | Sec. Agricultura |
| 21 | Organização Agrária | Reforma Agrária, Colonização | (raro em município) |
| 22 | **Indústria** | Promoção Industrial, Produção Industrial, Normalização | Sec. Desenvolvimento |
| 23 | **Comércio e Serviços** | Promoção Comercial, Turismo, Comercialização | Sec. Desenvolvimento / Turismo |
| 24 | Comunicações | Postais, Telecomunicações | (raro em município) |
| 25 | Energia | Conservação de Energia, Energia Elétrica | (raro) |
| 27 | **Desporto e Lazer** | Desporto Comunitário, de Rendimento, Lazer | Sec. Esportes |

### Áreas-meio (não-fim)
- **01 Legislativa** — Câmara Municipal
- **02 Judiciária** — (raro em município)
- **03 Essencial à Justiça** — Procuradoria, Defensoria
- **04 Administração** — Gestão pública, RH, finanças
- **09 Previdência Social** — RPPS quando existe
- **28 Encargos Especiais** — Juros, amortização da dívida, transferências
- **99 Reserva de Contingência**

---

## 7. Cobertura atual

(Snapshot 2026-05-24 após primeiro run completo)

### SICONFI

| Dataset | Cobertura | Notas |
|---|---|---|
| DCA 2024 | 645/645 (100%) | ✅ Completo |
| DCA 2025 | 610/645 (95%) | 35 em atraso |
| RGF 2024 Q1-Q3 | ~530/645 (82%) | Gap estrutural |
| RGF 2025 Q1-Q3 | 521-530/645 (~82%) | |
| RREO 2024 bim1-6 | 530/645 (82%) | |
| RREO 2025 bim1-6 | 522-531/645 (~82%) | |
| RREO 2026 bim1 | 505/645 (78%) | Período mais recente |
| RREO 2026 bim2-6, RGF 2026 Q1-Q3 | — | Prazos ainda não venceram |

### Audesp

| Dataset | Tamanho | Atualizado em |
|---|---|---|
| Análises | 469 KB | 01/mai/2026 (mensal) |
| RCL completo | 790 KB | sábado mais recente |
| Receitas 2024 | 33 MB | semanal |
| Receitas 2025 | 34 MB | semanal |
| Receitas 2026 | — | (ainda não publicado em zip anual) |
| Dívida Ativa 2019-2024 | 2.3 MB | (último update 2024) |
| Alertas | 1.2 MB | ⚠️ abandonado 2019 |

### Neon
| Tabela | Rows | Última atualização |
|---|---|---|
| municipios | 645 | 24/mai/2026 |
| publicacao_status | 13.545 | 24/mai/2026 |
| indicadores_lrf | 37.996 | 24/mai/2026 |
| despesa_por_funcao | 25.438 | 24/mai/2026 |

---

## 8. Gaps conhecidos

### 8.1 SP capital (3550308) sem dados Audesp
TCM-SP fiscaliza, não TCE-SP. Solução V2: adicionar fonte TCM-SP equivalente.

### 8.2 Metas LDO "brutas" (AMF — Anexo de Metas Fiscais)
Não estão em base pública estruturada. **Mas:** `despesa_por_funcao.dotacao_inicial` é a meta da LOA por área (mais granular que o AMF e disponível).
- Para meta de **resultado primário** específica: precisa parsear PDF da LDO de cada município.

### 8.3 RREO Anexos 08 (Educação) e 12 (Saúde)
Não estão no scraper. Audesp Análises cobre. Pra ter dados frescos quadrimestrais (não anuais), V2 deve adicioná-los.

### 8.4 Subfunções
RREO Anexo 02 traz subfunções (Atenção Básica, Vigilância Sanitária, etc.) mas sync atual só captura funções principais. V2: drill-down.

### 8.5 Histórico DCA pré-2024
Sync só pega 2024-2025. Pra histórico de longo prazo: SICONFI tem desde ~2008 ou usar Tesouro Transparente FINBRA.

### 8.6 Cobertura RREO/RGF: ~115 municípios sistematicamente não publicam
Não é erro nosso — gap estrutural. Status `NAO_PUBLICADO` registrado.

### 8.7 RPPS (RREO Anexo 04) e PPP (Anexo 13)
Coletados mas não usados. Geralmente vazios pra maioria dos municípios.

---

## 9. Padrões de uso

### Indicadores LRF de um município no ano mais recente

```sql
SELECT indicador, valor, limite_legal, pct_do_limite, exercicio
FROM indicadores_lrf
WHERE cod_ibge = $1
  AND exercicio = (SELECT MAX(exercicio) FROM indicadores_lrf WHERE cod_ibge = $1)
ORDER BY indicador;
```

### Áreas-fim por município, ano mais recente

```sql
SELECT funcao, dotacao_inicial, empenhado, liquidado, pct_do_total,
       CASE WHEN dotacao_inicial > 0
            THEN (liquidado / dotacao_inicial * 100)
            ELSE NULL
       END AS pct_executado
FROM despesa_por_funcao
WHERE cod_ibge = $1
  AND eh_area_fim = true
  AND (exercicio, periodo) = (
    SELECT exercicio, MAX(periodo)
    FROM despesa_por_funcao
    WHERE cod_ibge = $1 AND eh_area_fim
    GROUP BY exercicio ORDER BY exercicio DESC LIMIT 1
  )
ORDER BY empenhado DESC NULLS LAST;
```

### Ranking estadual por indicador

```sql
SELECT m.nome, i.valor, i.pct_do_limite
FROM indicadores_lrf i
JOIN municipios m USING (cod_ibge)
WHERE i.indicador = 'pessoal'
  AND i.exercicio = 2024
ORDER BY i.valor ASC  -- ou DESC pra piores
LIMIT 20;
```

### Cobertura — quem não publicou DCA 2025?

```sql
SELECT m.nome, m.populacao
FROM municipios m
JOIN publicacao_status p USING (cod_ibge)
WHERE p.dataset = 'dca_2025'
  AND p.status = 'NAO_PUBLICADO'
ORDER BY m.populacao DESC;
```

### Comparar municípios da mesma faixa populacional

```sql
SELECT m.nome, i.valor, i.pct_do_limite
FROM indicadores_lrf i
JOIN municipios m USING (cod_ibge)
WHERE i.indicador = 'educacao'
  AND i.exercicio = 2024
  AND m.faixa_pop = (SELECT faixa_pop FROM municipios WHERE cod_ibge = $1)
ORDER BY i.valor DESC;
```

---

## Glossário

- **AMF** — Anexo de Metas Fiscais (parte obrigatória da LDO, contém metas de resultado primário/nominal/dívida)
- **DCA** — Declaração de Contas Anuais
- **DCL** — Dívida Consolidada Líquida
- **DTP** — Despesa Total com Pessoal
- **FUNDEB** — Fundo de Manutenção e Desenvolvimento da Educação Básica
- **LDO** — Lei de Diretrizes Orçamentárias (anual)
- **LOA** — Lei Orçamentária Anual
- **LRF** — Lei de Responsabilidade Fiscal (LC 101/2000)
- **MOG 42/99** — Portaria que classifica funções de governo
- **PPA** — Plano Plurianual (quatro anos)
- **RCL** — Receita Corrente Líquida (base de cálculo dos limites LRF)
- **RGF** — Relatório de Gestão Fiscal (quadrimestral)
- **RPPS** — Regime Próprio de Previdência Social
- **RREO** — Relatório Resumido da Execução Orçamentária (bimestral)
- **SICONFI** — Sistema de Informações Contábeis e Fiscais (Tesouro Nacional)
- **TCE-SP** — Tribunal de Contas do Estado de SP (fiscaliza 644 municípios)
- **TCM-SP** — Tribunal de Contas do Município de SP (fiscaliza apenas a capital)
