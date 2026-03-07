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

    step = "check_user_exists";
    // We'll use a raw query to avoid any drizzle-related issues for now
    const existingUserResult = await db.execute(sql`SELECT matricula FROM users WHERE matricula = ${matricula} LIMIT 1`);
    if (existingUserResult.rows.length > 0) {
      return Response.json({ error: "Usuário já cadastrado" }, { status: 400 });
    }

    step = "hash_password";
    const hashedPassword = await bcrypt.hash(password, 10);

    step = "insert_user";
    await db.execute(sql`
      INSERT INTO users (matricula, password, name, created_at)
      VALUES (${matricula}, ${hashedPassword}, ${name || null}, NOW())
    `);

    return Response.json({ success: true, message: "Usuário cadastrado com sucesso" });
  } catch (error: any) {
    console.error(`Erro no registro (step: ${step}):`, error);
    return Response.json({ 
      error: "Erro ao cadastrar usuário", 
      step,
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
