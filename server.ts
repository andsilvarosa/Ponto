import express from "express";
import { createServer as createViteServer } from "vite";
import { calculateDay } from "./src/utils/timeCalculations.ts";
import { db } from "./src/db/index.ts";
import { holidays, timeEntries, settings } from "./src/db/schema.ts";
import { eq, desc } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Middleware para verificar se o banco está configurado
  const checkDb = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ 
        error: "DATABASE_URL não configurada. Por favor, configure a variável de ambiente no Neon." 
      });
    }
    next();
  };

  // API: Configurações
  app.get("/api/settings", checkDb, async (req, res) => {
    try {
      const allSettings = await db.select().from(settings);
      const settingsMap = allSettings.reduce((acc: any, curr: any) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
      res.json(settingsMap);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  app.post("/api/settings", checkDb, async (req, res) => {
    try {
      const { previous_balance } = req.body;
      if (previous_balance !== undefined) {
        await db.insert(settings)
          .values({ key: 'previous_balance', value: previous_balance.toString() })
          .onConflictDoUpdate({
            target: settings.key,
            set: { value: previous_balance.toString() }
          });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao salvar configurações" });
    }
  });

  // API: Calcular Ponto
  app.post("/api/calcular-ponto", (req, res) => {
    try {
      const { entries, exits, is_holiday } = req.body;
      const result = calculateDay(entries, exits, is_holiday);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Erro ao calcular ponto" });
    }
  });

  // API: Sincronizar Feriados (Brasil API)
  app.get("/api/sync-feriados", checkDb, async (req, res) => {
    try {
      const year = new Date().getFullYear();
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      const feriadosList = await response.json() as any[];

      for (const f of feriadosList) {
        await db.insert(holidays)
          .values({ date: f.date, name: f.name, type: f.type || 'national' })
          .onConflictDoUpdate({
            target: holidays.date,
            set: { name: f.name, type: f.type || 'national' }
          });
      }

      res.json({ message: `${feriadosList.length} feriados sincronizados com sucesso.`, feriados: feriadosList });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao sincronizar feriados" });
    }
  });

  // API: Listar Marcações
  app.get("/api/entries", checkDb, async (req, res) => {
    try {
      const entriesList = await db.select().from(timeEntries).orderBy(desc(timeEntries.date));
      const holidaysList = await db.select().from(holidays);
      res.json({ entries: entriesList, holidays: holidaysList });
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar marcações" });
    }
  });

  // API: Salvar Marcação
  app.post("/api/entries", checkDb, async (req, res) => {
    try {
      const data = req.body;
      await db.insert(timeEntries)
        .values(data)
        .onConflictDoUpdate({
          target: timeEntries.date,
          set: data
        });
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao salvar marcação" });
    }
  });

  app.delete("/api/entries/:date", checkDb, async (req, res) => {
    try {
      const { date } = req.params;
      await db.delete(timeEntries).where(eq(timeEntries.date, date));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao deletar marcação" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
