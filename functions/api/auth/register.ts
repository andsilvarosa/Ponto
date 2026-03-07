import { sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { users } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function onRequestPost(context: any) {
  if (!context.env.DATABASE_URL) {
    return Response.json({ error: "DATABASE_URL não configurada" }, { status: 500 });
  }

  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    const body = await context.request.json();
    const { matricula, password, name } = body;
    
    console.log("Tentativa de registro:", { matricula, name });

    if (!matricula || !password) {
      return Response.json({ error: "Matrícula e senha são obrigatórios" }, { status: 400 });
    }

    // Ensure table exists before any query
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        matricula TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.matricula, matricula)).limit(1);
    if (existingUser && existingUser.length > 0) {
      return Response.json({ error: "Usuário já cadastrado" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      matricula,
      password: hashedPassword,
      name: name || null,
    });

    return Response.json({ success: true, message: "Usuário cadastrado com sucesso" });
  } catch (error: any) {
    console.error("Erro detalhado no registro:", error);
    return Response.json({ 
      error: "Erro ao cadastrar usuário", 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    }, { status: 500 });
  }
}
