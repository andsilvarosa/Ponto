import { sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { users } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function onRequestPost(context: any) {
  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    // Ensure table exists
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        matricula TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const { matricula, password } = await context.request.json();

    if (!matricula || !password) {
      return Response.json({ error: "Matrícula e senha são obrigatórios" }, { status: 400 });
    }

    const user = await db.select().from(users).where(eq(users.matricula, matricula)).limit(1);
    
    if (user.length === 0) {
      return Response.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const isPasswordValid = await bcrypt.compare(password, user[0].password);
    if (!isPasswordValid) {
      return Response.json({ error: "Senha incorreta" }, { status: 401 });
    }

    // In a real app we would return a JWT here. 
    // For this demo, we'll just return success and the user info.
    return Response.json({ 
      success: true, 
      user: { 
        matricula: user[0].matricula, 
        name: user[0].name 
      } 
    });
  } catch (error: any) {
    console.error("Erro no login:", error);
    return Response.json({ error: "Erro ao realizar login", details: error.message }, { status: 500 });
  }
}
