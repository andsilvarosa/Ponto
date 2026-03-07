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
    const { matricula, password } = body;
    
    if (!matricula || !password) {
      return Response.json({ error: "Matrícula e senha são obrigatórios" }, { status: 400 });
    }

    step = "fetch_user";
    const userResult = await db.execute(sql`SELECT matricula, password, name FROM users WHERE matricula = ${matricula} LIMIT 1`);
    
    if (userResult.rows.length === 0) {
      return Response.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const user = userResult.rows[0];

    step = "compare_password";
    // bcrypt.compare is also CPU intensive, but we have no choice here.
    // Ensure we are using the same library and it's as fast as possible.
    const isPasswordValid = await bcrypt.compare(password, user.password as string);
    if (!isPasswordValid) {
      return Response.json({ error: "Senha incorreta" }, { status: 401 });
    }

    return Response.json({ 
      success: true, 
      user: { 
        matricula: user.matricula, 
        name: user.name 
      } 
    });
  } catch (error: any) {
    console.error(`Erro no login (step: ${step}):`, error);
    return Response.json({ 
      error: "Erro ao realizar login", 
      step,
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
