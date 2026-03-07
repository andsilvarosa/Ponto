import { settings } from "../../src/db/schema";
import { sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export async function onRequestGet(context: any) {
  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      await db.execute(sql`ALTER TABLE settings ADD PRIMARY KEY (key)`);
    } catch (e) {}

    const allSettings = await db.select().from(settings);
    const settingsMap = allSettings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    return Response.json(settingsMap);
  } catch (error: any) {
    return Response.json({ error: "Erro ao buscar configurações", details: error.message }, { status: 500 });
  }
}

export async function onRequestPost(context: any) {
  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      await db.execute(sql`ALTER TABLE settings ADD PRIMARY KEY (key)`);
    } catch (e) {}

    const { previous_balance } = await context.request.json();
    if (previous_balance !== undefined) {
      await db.insert(settings)
        .values({ key: 'previous_balance', value: previous_balance.toString() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: previous_balance.toString() }
        });
    }
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: "Erro ao salvar configurações", details: error.message }, { status: 500 });
  }
}
