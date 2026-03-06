import { timeEntries, holidays } from "../../src/db/schema";
import { desc } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

// Corresponde a um GET /api/entries
export async function onRequestGet(context: any) {
  // A ligação ao Neon é feita aqui, garantindo que corre na Edge do Cloudflare
  const sql = neon(context.env.DATABASE_URL);
  const db = drizzle(sql);

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
  const sql = neon(context.env.DATABASE_URL);
  const db = drizzle(sql);

  try {
    const data = await context.request.json();
    
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
