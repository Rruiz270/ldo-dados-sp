#!/usr/bin/env node
/**
 * Roda todas as migrations em ordem. Idempotente (CREATE TABLE IF NOT EXISTS).
 * Uso: npm run db:migrate
 *
 * Usa `postgres` lib (não @neondatabase/serverless): o driver Neon serverless
 * quebra em multi-statement scripts no novo host format .c-N. (gotcha conhecido).
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Coloque em .env.local e rode com `npm run db:migrate`.");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
console.log(`Encontradas ${files.length} migrations:`);
for (const f of files) console.log(`  - ${f}`);
console.log();

for (const f of files) {
  process.stdout.write(`▶ ${f} ... `);
  const sqlText = readFileSync(join(MIGRATIONS_DIR, f), "utf-8");
  try {
    await sql.unsafe(sqlText);
    console.log("ok");
  } catch (e) {
    console.error("FALHOU");
    console.error(e);
    await sql.end();
    process.exit(1);
  }
}

await sql.end();
console.log("\nMigrations concluídas.");
