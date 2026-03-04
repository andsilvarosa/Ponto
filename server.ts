import express from "express";
import { createServer as createViteServer } from "vite";
import { calculateDay } from "./src/utils/timeCalculations.ts";
import Database from "better-sqlite3";

// Inicialização do Banco de Dados Local (Simulando Neon DB para o preview)
const db = new Database("ponto.db");

// Criar tabelas se não existirem (SQLite compatível)
db.exec(`
  CREATE TABLE IF NOT EXISTS holidays (
    date TEXT PRIMARY KEY,
    name TEXT,
    type TEXT
  );
  CREATE TABLE IF NOT EXISTS time_entries (
    date TEXT PRIMARY KEY,
    entry_1 TEXT,
    exit_1 TEXT,
    entry_2 TEXT,
    exit_2 TEXT,
    entry_3 TEXT,
    exit_3 TEXT,
    entry_4 TEXT,
    exit_4 TEXT,
    entry_5 TEXT,
    exit_5 TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES ('previous_balance', '0');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API: Configurações
  app.get("/api/settings", (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsMap = settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsMap);
  });

  app.post("/api/settings", (req, res) => {
    const { previous_balance } = req.body;
    if (previous_balance !== undefined) {
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('previous_balance', previous_balance.toString());
    }
    res.json({ success: true });
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
  app.get("/api/sync-feriados", async (req, res) => {
    try {
      const year = new Date().getFullYear();
      const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      const feriados = await response.json() as any[];

      const insert = db.prepare("INSERT OR REPLACE INTO holidays (date, name, type) VALUES (?, ?, ?)");
      const transaction = db.transaction((list) => {
        for (const f of list) {
          insert.run(f.date, f.name, f.type || 'national');
        }
      });

      transaction(feriados);
      res.json({ message: `${feriados.length} feriados sincronizados com sucesso.`, feriados });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao sincronizar feriados" });
    }
  });

  // API: Listar Marcações
  app.get("/api/entries", (req, res) => {
    const entries = db.prepare("SELECT * FROM time_entries ORDER BY date DESC").all();
    const holidays = db.prepare("SELECT * FROM holidays").all();
    res.json({ entries, holidays });
  });

  // API: Salvar Marcação
  app.post("/api/entries", (req, res) => {
    const { date, entry_1, exit_1, entry_2, exit_2, entry_3, exit_3, entry_4, exit_4, entry_5, exit_5 } = req.body;
    const insert = db.prepare(`
      INSERT OR REPLACE INTO time_entries (date, entry_1, exit_1, entry_2, exit_2, entry_3, exit_3, entry_4, exit_4, entry_5, exit_5)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(date, entry_1, exit_1, entry_2, exit_2, entry_3, exit_3, entry_4, exit_4, entry_5, exit_5);
    res.json({ success: true });
  });

  app.delete("/api/entries/:date", (req, res) => {
    try {
      const { date } = req.params;
      db.prepare("DELETE FROM time_entries WHERE date = ?").run(date);
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
