import { timeEntries, holidays } from "../../src/db/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Corresponde a um GET /api/entries
export async function onRequestGet(context: any) {
  // A ligação ao Neon é feita aqui, garantindo que corre na Edge do Cloudflare
  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);
  
  const url = new URL(context.request.url);
  const matricula = url.searchParams.get('matricula') || 'default';

  try {
    const entriesList = await db.select().from(timeEntries)
      .where(eq(timeEntries.matricula, matricula))
      .orderBy(desc(timeEntries.date));
    const holidaysList = await db.select().from(holidays);
    return Response.json({ entries: entriesList, holidays: holidaysList });
  } catch (error: any) {
    return Response.json({ error: "Erro ao buscar marcações", details: error.message }, { status: 500 });
  }
}

// Corresponde a um POST /api/entries
export async function onRequestPost(context: any) {
  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    const data = await context.request.json();
    const matricula = data.matricula || 'default';
    
    // Garantir que a tabela e a chave primária existem no banco de produção
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS time_entries (
          matricula TEXT DEFAULT 'default',
          date TEXT,
          entry_1 TEXT, exit_1 TEXT,
          entry_2 TEXT, exit_2 TEXT,
          entry_3 TEXT, exit_3 TEXT,
          entry_4 TEXT, exit_4 TEXT,
          entry_5 TEXT, exit_5 TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (matricula, date)
        )
      `);
      
      // Se a tabela já existia com a PK antiga, precisamos alterá-la
      await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS matricula TEXT DEFAULT 'default'`);
      await db.execute(sql`ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_pkey CASCADE`);
      await db.execute(sql`ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_date_unique CASCADE`);
      await db.execute(sql`ALTER TABLE time_entries ADD PRIMARY KEY (matricula, date)`);
    } catch (e: any) {}

    // Garantir que as colunas são do tipo TEXT
    const columns = ['entry_1', 'exit_1', 'entry_2', 'exit_2', 'entry_3', 'exit_3', 'entry_4', 'exit_4', 'entry_5', 'exit_5'];
    for (const col of columns) {
      try {
        await db.execute(sql.raw(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ${col} TEXT`));
        await db.execute(sql.raw(`ALTER TABLE time_entries ALTER COLUMN ${col} TYPE TEXT USING ${col}::TEXT`));
      } catch (e) {}
    }

    // Limpeza de campos vazios
    const timeFields = ['entry_1', 'exit_1', 'entry_2', 'exit_2', 'entry_3', 'exit_3', 'entry_4', 'exit_4', 'entry_5', 'exit_5'];
    const cleanedData: any = { matricula, date: data.date };
    timeFields.forEach(field => {
      cleanedData[field] = (data[field] === '' || data[field] === undefined) ? null : data[field];
    });

    const { matricula: m, date, ...updateData } = cleanedData;

    await db.insert(timeEntries)
      .values(cleanedData)
      .onConflictDoUpdate({ 
        target: [timeEntries.matricula, timeEntries.date], 
        set: updateData 
      });

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: "Erro ao guardar marcação", details: error.message }, { status: 500 });
  }
}
