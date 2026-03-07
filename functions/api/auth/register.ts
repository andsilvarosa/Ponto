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
    const { matricula, password, name } = await context.request.json();
    console.log("Tentativa de registro para matricula:", matricula);

    if (!matricula || !password) {
      return Response.json({ error: "Matrícula e senha são obrigatórios" }, { status: 400 });
    }

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.matricula, matricula)).limit(1);
    if (existingUser.length > 0) {
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
    console.error("Erro no registro:", error);
    return Response.json({ error: "Erro ao cadastrar usuário", details: error.message }, { status: 500 });
  }
}
