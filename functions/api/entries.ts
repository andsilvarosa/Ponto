import { timeEntries, holidays } from "../../src/db/schema";
import { desc, sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Corresponde a um GET /api/entries
export async function onRequestGet(context: any) {
  // A ligação ao Neon é feita aqui, garantindo que corre na Edge do Cloudflare
  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    const entriesList = await db.select().from(timeEntries).orderBy(desc(timeEntries.date));
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
    
    // Garantir que a tabela e a chave primária existem no banco de produção
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS time_entries (
          date TEXT PRIMARY KEY,
          entry_1 TEXT, exit_1 TEXT,
          entry_2 TEXT, exit_2 TEXT,
          entry_3 TEXT, exit_3 TEXT,
          entry_4 TEXT, exit_4 TEXT,
          entry_5 TEXT, exit_5 TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Limpar duplicatas e nulos para permitir a criação da constraint
      await db.execute(sql`DELETE FROM time_entries WHERE date IS NULL`);
      await db.execute(sql`
        DELETE FROM time_entries a USING time_entries b
        WHERE a.date = b.date AND a.ctid > b.ctid
      `);

      await db.execute(sql`ALTER TABLE time_entries ADD PRIMARY KEY (date)`);
    } catch (e: any) {
      // Se falhar (ex: já existe uma PK noutra coluna), tentamos adicionar UNIQUE
      try {
        await db.execute(sql`ALTER TABLE time_entries ADD CONSTRAINT time_entries_date_unique UNIQUE (date)`);
      } catch (e2) {
        // Se tudo falhar, e a tabela estiver vazia, recriamos do zero
        try {
          const result = await db.execute(sql`SELECT count(*) as total FROM time_entries`);
          if (Number(result.rows[0].total) === 0) {
            await db.execute(sql`DROP TABLE IF EXISTS time_entries`);
            await db.execute(sql`
              CREATE TABLE time_entries (
                date TEXT PRIMARY KEY,
                entry_1 TEXT, exit_1 TEXT,
                entry_2 TEXT, exit_2 TEXT,
                entry_3 TEXT, exit_3 TEXT,
                entry_4 TEXT, exit_4 TEXT,
                entry_5 TEXT, exit_5 TEXT,
                created_at TIMESTAMP DEFAULT NOW()
              )
            `);
          }
        } catch (e3) {}
      }
    }

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
    const cleanedData: any = { date: data.date };
    timeFields.forEach(field => {
      cleanedData[field] = (data[field] === '' || data[field] === undefined) ? null : data[field];
    });

    const { date, ...updateData } = cleanedData;

    await db.insert(timeEntries)
      .values(cleanedData)
      .onConflictDoUpdate({ target: timeEntries.date, set: updateData });

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: "Erro ao guardar marcação", details: error.message }, { status: 500 });
  }
}
