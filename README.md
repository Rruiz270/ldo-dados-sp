# LDO Dados SP

Dashboard de metas LDO e indicadores fiscais dos 645 municípios de SP.
Deploy: [institutoi10.com.br/ldo-dados](https://www.institutoi10.com.br/ldo-dados)

## Fontes de dados

- **SICONFI** (Tesouro Nacional): RREO, DCA, RGF dos 645 municípios
- **Audesp** (TCE-SP): Análises LRF, RCL mensal, Receitas, Dívida Ativa
- Scrapers rodam diariamente 4h no Mac mini, sincronizam para Neon via `sync_to_neon.py`

## Stack

- Next.js 16 + React 19 + Tailwind 4
- Neon (Postgres serverless) com `@neondatabase/serverless`
- Recharts para visualizações
- ExcelJS para export XLSX

## Dev local

```bash
npm install
cp .env.local.example .env.local  # preencher DATABASE_URL
npm run db:migrate                 # cria schema
npm run db:seed                    # popula a partir dos arquivos do scraper
npm run dev                        # localhost:3030
```

## Estrutura

```
src/
├── app/
│   ├── page.tsx                  → home: search/dropdown 645 munis
│   ├── municipio/[cod]/page.tsx  → 3 tabs (Secretário/Prefeito/Vereador)
│   └── api/                      → endpoints REST
├── components/                   → cards, charts, brand
└── lib/
    ├── db.ts                     → cliente Neon
    ├── lrf.ts                    → cálculos LRF (60% pessoal, 25% educ, 15% saúde)
    └── theme.ts                  → tokens visuais i10
```

## Personas atendidas

| Tab | Persona | Foco |
|---|---|---|
| 🔵 Secretário | Sec. de Finanças | Profundidade técnica, projeção, benchmark |
| 🟢 Prefeito | Executivo | Narrativa visual, ranking, comparação histórica |
| 🟠 Vereador | Fiscalizador | Evidência factual, tabela, export |
