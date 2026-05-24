#!/usr/bin/env node
/**
 * Roda todas as migrations em ordem. Idempotente (CREATE TABLE IF NOT EXISTS).
 * Uso: npm run db:migrate
 */
import { neon } from "@neondatabase/serverless";
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
const sql = neon(url);

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
console.log(`Encontradas ${files.length} migrations:`);
for (const f of files) console.log(`  - ${f}`);
console.log();

for (const f of files) {
  process.stdout.write(`▶ ${f} ... `);
  const sqlText = readFileSync(join(MIGRATIONS_DIR, f), "utf-8");
  // neon serverless aceita execução de múltiplos statements via .query (não tagged)
  try {
    await sql.query(sqlText);
    console.log("ok");
  } catch (e) {
    console.error("FALHOU");
    console.error(e);
    process.exit(1);
  }
}
console.log("\nMigrations concluídas.");
