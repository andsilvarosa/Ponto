import { sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { users } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function onRequestPost(context: any) {
  let step = "init";
  try {
    if (!context.env.DATABASE_URL) {
      return Response.json({ error: "DATABASE_URL não configurada" }, { status: 500 });
    }

    step = "connect_db";
    const sqlClient = neon(context.env.DATABASE_URL);
    const db = drizzle(sqlClient);

    step = "parse_body";
    let body;
    try {
      body = await context.request.json();
    } catch (e) {
      return Response.json({ error: "Corpo da requisição inválido" }, { status: 400 });
    }
    
    const { matricula, password, name } = body;
    
    if (!matricula || !password) {
      return Response.json({ error: "Matrícula e senha são obrigatórios" }, { status: 400 });
    }

    step = "ensure_table";
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        matricula TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    step = "check_user_exists";
    const existingUserResult = await db.execute(sql`SELECT matricula FROM users WHERE matricula = ${matricula} LIMIT 1`);
    if (existingUserResult.rows.length > 0) {
      return Response.json({ error: "Usuário já cadastrado" }, { status: 400 });
    }

    step = "hash_password";
    // Reduced rounds to 4 to fit Cloudflare Worker CPU limits (50ms)
    const hashedPassword = await bcrypt.hash(password, 4);

    step = "insert_user";
    
    // Use Drizzle ORM for insertion to avoid parameter parsing issues with bcrypt hash
    await db.insert(users).values({
      matricula: String(matricula).trim(),
      password: hashedPassword,
      name: name ? String(name) : null,
    });

    return Response.json({ success: true, message: "Usuário cadastrado com sucesso" });
  } catch (error: any) {
    console.error(`Erro no registro (step: ${step}):`, error);
    
    let errorMessage = error.message;
    if (errorMessage.includes("already exists") || errorMessage.includes("unique constraint")) {
      return Response.json({ error: "Esta matrícula já está cadastrada" }, { status: 400 });
    }

    return Response.json({ 
      error: "Erro ao cadastrar usuário", 
      step,
      details: errorMessage,
      stack: error.stack
    }, { status: 500 });
  }
}
