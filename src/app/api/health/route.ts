import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const env = {
    has_DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_URL_prefix: process.env.DATABASE_URL?.slice(0, 35) ?? null,
    DATABASE_URL_suffix: process.env.DATABASE_URL?.slice(-30) ?? null,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH ?? null,
    NODE_ENV: process.env.NODE_ENV,
  };

  try {
    const start = Date.now();
    const rows = (await sql`SELECT COUNT(*)::int AS n FROM municipios`) as Array<{ n: number }>;
    return NextResponse.json({
      ok: true,
      municipios: rows[0]?.n ?? 0,
      query_ms: Date.now() - start,
      env,
    });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({
      ok: false,
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 5),
      env,
    }, { status: 500 });
  }
}
