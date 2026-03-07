import { settings } from "../../src/db/schema";
import { eq, sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

export async function onRequestGet(context: any) {
  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);
  
  const url = new URL(context.request.url);
  const matricula = url.searchParams.get('matricula') || 'default';

  try {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS settings (
          matricula TEXT DEFAULT 'default',
          key TEXT,
          value TEXT NOT NULL,
          PRIMARY KEY (matricula, key)
        )
      `);
      await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS matricula TEXT DEFAULT 'default'`);
      await db.execute(sql`ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey CASCADE`);
      await db.execute(sql`ALTER TABLE settings ADD PRIMARY KEY (matricula, key)`);
    } catch (e) {}

    const allSettings = await db.select().from(settings).where(eq(settings.matricula, matricula));
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
          matricula TEXT DEFAULT 'default',
          key TEXT,
          value TEXT NOT NULL,
          PRIMARY KEY (matricula, key)
        )
      `);
      await db.execute(sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS matricula TEXT DEFAULT 'default'`);
      await db.execute(sql`ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey CASCADE`);
      await db.execute(sql`ALTER TABLE settings ADD PRIMARY KEY (matricula, key)`);
    } catch (e) {}

    const body = await context.request.json();
    const matricula = body.matricula || 'default';
    
    const keysToSave = ['previous_balance', 'workday_hours'];
    
    for (const key of keysToSave) {
      if (body[key] !== undefined) {
        await db.insert(settings)
          .values({ matricula, key, value: body[key].toString() })
          .onConflictDoUpdate({
            target: [settings.matricula, settings.key],
            set: { value: body[key].toString() }
          });
      }
    }
    
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: "Erro ao salvar configurações", details: error.message }, { status: 500 });
  }
}
