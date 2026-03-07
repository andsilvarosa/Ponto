import { timeEntries } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export async function onRequestDelete(context: any) {
  const sql = neon(context.env.DATABASE_URL);
  const db = drizzle(sql);

  try {
    const date = context.params.date;
    await db.delete(timeEntries).where(eq(timeEntries.date, date));
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: "Erro ao deletar marcação", details: error.message }, { status: 500 });
  }
}
