import { sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export async function onRequestGet(context: any) {
  try {
    if (!context.env.DATABASE_URL) {
      return Response.json({ error: "DATABASE_URL não configurada" }, { status: 500 });
    }

    const sqlClient = neon(context.env.DATABASE_URL);
    const db = drizzle(sqlClient);

    const result = await db.execute(sql`SELECT NOW() as now`);
    return Response.json({ 
      success: true, 
      message: "Conexão com o banco de dados OK",
      now: result.rows[0].now
    });
  } catch (error: any) {
    return Response.json({ 
      error: "Erro ao conectar ao banco de dados", 
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
