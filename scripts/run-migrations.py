#!/usr/bin/env python3
"""Roda migrations SQL em ordem usando psycopg2 (mais robusto que o driver
serverless do Neon para CREATE TABLE/INDEX em massa)."""
import os, sys, glob

try:
    import psycopg2
except ImportError:
    print("python3 -m pip install --user psycopg2-binary")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS = sorted(glob.glob(os.path.join(BASE, "..", "migrations", "*.sql")))

url = os.environ.get("DATABASE_URL")
if not url:
    envpath = os.path.join(BASE, "..", ".env.local")
    if os.path.exists(envpath):
        with open(envpath) as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
if not url:
    print("DATABASE_URL not set")
    sys.exit(1)

conn = psycopg2.connect(url)
conn.autocommit = True

for path in MIGRATIONS:
    name = os.path.basename(path)
    print(f"▶ {name} ... ", end="", flush=True)
    with open(path) as f:
        sql = f.read()
    with conn.cursor() as cur:
        try:
            cur.execute(sql)
            print("ok")
        except Exception as e:
            print(f"FALHOU: {e}")
            sys.exit(1)

conn.close()
print("\nMigrations concluídas.")
