import { timeEntries } from "../../../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

async function ensureTableExists(db: any) {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS time_entries (
        matricula TEXT NOT NULL DEFAULT '000000',
        date TEXT NOT NULL,
        entry_1 TEXT, exit_1 TEXT,
        entry_2 TEXT, exit_2 TEXT,
        entry_3 TEXT, exit_3 TEXT,
        entry_4 TEXT, exit_4 TEXT,
        entry_5 TEXT, exit_5 TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (matricula, date)
      )
    `);
    
    // Add matricula column if it doesn't exist
    await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS matricula TEXT NOT NULL DEFAULT '000000'`);
    
    // Drop old primary key and add new composite primary key
    try {
      await db.execute(sql`ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_pkey`);
      await db.execute(sql`ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_date_unique`);
      await db.execute(sql`ALTER TABLE time_entries ADD PRIMARY KEY (matricula, date)`);
    } catch (e) {}
  } catch (e: any) {
    console.error("Erro ao configurar tabela:", e);
  }

  // Garantir que as colunas são do tipo TEXT
  const columns = ['entry_1', 'exit_1', 'entry_2', 'exit_2', 'entry_3', 'exit_3', 'entry_4', 'exit_4', 'entry_5', 'exit_5'];
  for (const col of columns) {
    try {
      await db.execute(sql.raw(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ${col} TEXT`));
      await db.execute(sql.raw(`ALTER TABLE time_entries ALTER COLUMN ${col} TYPE TEXT USING ${col}::TEXT`));
    } catch (e) {}
  }
}

export async function onRequestDelete(context: any) {
  const matricula = context.request.headers.get('x-matricula');
  if (!matricula) return Response.json({ error: "Matrícula não informada" }, { status: 400 });

  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    await ensureTableExists(db);
    const date = context.params.date;
    await db.delete(timeEntries).where(and(eq(timeEntries.date, date), eq(timeEntries.matricula, matricula)));
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: "Erro ao deletar marcação", details: error.message }, { status: 500 });
  }
}
