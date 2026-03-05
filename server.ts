import express from "express";
import { createServer as createViteServer } from "vite";
import { calculateDay } from "./src/utils/timeCalculations.ts";
import { db } from "./src/db/index.ts";
import { holidays, timeEntries, settings } from "./src/db/schema.ts";
import { eq, desc } from "drizzle-orm";
import dotenv from "dotenv";
import * as cheerio from 'cheerio';

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

  // API: Sincronizar Ponto da Empresa (Scraping ASP.NET)
  app.post("/api/sync-ponto-empresa", checkDb, async (req, res) => {
    try {
      const matricula = '109194'; // Sua matrícula fixa
      const url = 'https://webapp.confianca.com.br/consultaponto/ponto.aspx';

      console.log("Iniciando sincronização com a empresa...");

      // 1. GET: Pegar os tokens de segurança do ASP.NET
      const initialResponse = await fetch(url);
      const initialHtml = await initialResponse.text();
      const $initial = cheerio.load(initialHtml);

      const viewState = $initial('input[name="__VIEWSTATE"]').val() as string;
      const viewStateGenerator = $initial('input[name="__VIEWSTATEGENERATOR"]').val() as string;
      const eventValidation = $initial('input[name="__EVENTVALIDATION"]').val() as string;

      if (!viewState) {
        return res.status(500).json({ error: "Falha ao capturar o ViewState do site da empresa." });
      }

      // 2. POST: Simular o preenchimento e clique no botão
      const formData = new URLSearchParams();
      formData.append('__VIEWSTATE', viewState);
      if (viewStateGenerator) formData.append('__VIEWSTATEGENERATOR', viewStateGenerator);
      if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
      
      formData.append('txtMatricula', matricula);
      formData.append('btnConsultar', 'Consultar');

      const postResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: formData.toString()
      });

      const finalHtml = await postResponse.text();
      const $ = cheerio.load(finalHtml);
      
      const marcacoesSalvas: any[] = [];

      // 3. Extrair os dados da tabela
      // Dica Sênior: Se o site quebrar, geralmente é porque o layout da tabela deles mudou.
      $('table tr').each((index, element) => {
        // Pula a primeira linha (cabeçalho da tabela)
        if (index === 0) return;

        const colunas = $(element).find('td');
        
        // Verifica se a linha tem colunas suficientes para ser uma linha de ponto
        if (colunas.length >= 3) { 
          const dataTexto = $(colunas[0]).text().trim(); // Esperado: "DD/MM/YYYY"
          
          // Validação se a primeira coluna é realmente uma data
          if (!dataTexto.match(/^\d{2}\/\d{2}\/\d{4}$/)) return; 
          
          // Converte de DD/MM/YYYY para YYYY-MM-DD para o nosso banco de dados
          const [dia, mes, ano] = dataTexto.split('/');
          const dateIso = `${ano}-${mes}-${dia}`;

          // Mapeia as colunas do site para o nosso formato
          // Atenção: Ajuste os índices (1, 2, 3...) de acordo com a ordem real da tabela deles
          const marcacao = {
            date: dateIso,
            entry_1: $(colunas[1]).text().trim() || '',
            exit_1: $(colunas[2]).text().trim() || '',
            entry_2: $(colunas[3]).text().trim() || '',
            exit_2: $(colunas[4]).text().trim() || '',
            entry_3: $(colunas[5]) ? $(colunas[5]).text().trim() : '',
            exit_3: $(colunas[6]) ? $(colunas[6]).text().trim() : '',
            entry_4: '', exit_4: '', entry_5: '', exit_5: ''
          };

          marcacoesSalvas.push(marcacao);
        }
      });

      // 4. Inserir ou atualizar no banco de dados (Neon DB)
      for (const marcacao of marcacoesSalvas) {
        await db.insert(timeEntries)
          .values(marcacao)
          .onConflictDoUpdate({
            target: timeEntries.date,
            set: marcacao
          });
      }

      res.json({ success: true, count: marcacoesSalvas.length });

    } catch (error) {
      console.error("Erro no scraping:", error);
      res.status(500).json({ error: "Erro interno ao sincronizar ponto da empresa." });
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
