import { holidays } from "../../src/db/schema";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export async function onRequestGet(context: any) {
  const sql = neon(context.env.DATABASE_URL);
  const db = drizzle(sql);

  try {
    const year = new Date().getFullYear();
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
    const feriadosList = await response.json() as any[];

    for (const f of feriadosList) {
      await db.insert(holidays)
        .values({ date: f.date, name: f.name, type: f.type || 'national' })
        .onConflictDoUpdate({
          target: holidays.date,
          set: { name: f.name, type: f.type || 'national' }
        });
    }

    return Response.json({ message: `${feriadosList.length} feriados sincronizados com sucesso.`, feriados: feriadosList });
  } catch (error: any) {
    return Response.json({ error: "Erro ao sincronizar feriados", details: error.message }, { status: 500 });
  }
}
