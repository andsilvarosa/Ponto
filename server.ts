import express from "express";
import { createServer as createViteServer } from "vite";
import { calculateDay } from "./src/utils/timeCalculations.ts";
import { db } from "./src/db/index.ts";
import { holidays, timeEntries, settings } from "./src/db/schema.ts";
import { eq, desc } from "drizzle-orm";
import dotenv from "dotenv";
import * as cheerio from 'cheerio';

import { sql } from "drizzle-orm";

dotenv.config();

async function startServer() {
  console.log("Iniciando startServer...");
  console.log("DATABASE_URL presente:", !!process.env.DATABASE_URL);
  
  const app = express();
  const PORT = 3000;

  // Request logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Middleware para garantir que o banco está pronto e as tabelas existem
  const initDb = async () => {
    if (!process.env.DATABASE_URL) return;
    try {
      console.log("Verificando/Criando tabelas no banco...");
      
      // Criar tabela de feriados
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS holidays (
          date TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'national'
        )
      `);

      // Criar tabela de marcações (com todas as colunas)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS time_entries (
          date TEXT PRIMARY KEY,
          entry_1 TEXT, exit_1 TEXT,
          entry_2 TEXT, exit_2 TEXT,
          entry_3 TEXT, exit_3 TEXT,
          entry_4 TEXT, exit_4 TEXT,
          entry_5 TEXT, exit_5 TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Garantir que as colunas novas existam (caso a tabela já existisse sem elas)
      const columns = ['entry_3', 'exit_3', 'entry_4', 'exit_4', 'entry_5', 'exit_5'];
      for (const col of columns) {
        try {
          await db.execute(sql.raw(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ${col} TEXT`));
        } catch (e) { /* Coluna já existe */ }
      }

      // Criar tabela de configurações
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      console.log("Banco de dados inicializado com sucesso.");
    } catch (error) {
      console.error("Erro ao inicializar banco de dados:", error);
    }
  };

  await initDb();

  app.use(express.json());

  // Middleware para verificar se o banco está configurado
  const checkDb = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!process.env.DATABASE_URL) {
      console.error("ERRO: DATABASE_URL não está definida nas variáveis de ambiente.");
      return res.status(500).json({ 
        error: "DATABASE_URL não configurada. Por favor, configure a variável de ambiente no Neon." 
      });
    }
    next();
  };

  // API: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      database: !!process.env.DATABASE_URL,
      node_env: process.env.NODE_ENV,
      time: new Date().toISOString()
    });
  });

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
      console.error("Erro ao buscar configurações:", error);
      res.status(500).json({ 
        error: "Erro ao buscar configurações",
        details: error instanceof Error ? error.message : String(error)
      });
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
      console.log("Buscando marcações e feriados...");
      const entriesList = await db.select().from(timeEntries).orderBy(desc(timeEntries.date));
      const holidaysList = await db.select().from(holidays);
      console.log(`Encontradas ${entriesList.length} marcações e ${holidaysList.length} feriados.`);
      res.json({ entries: entriesList, holidays: holidaysList });
    } catch (error) {
      console.error("Erro detalhado ao buscar marcações:", error);
      res.status(500).json({ 
        error: "Erro ao buscar marcações", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // API: Salvar Marcação
  app.post("/api/entries", checkDb, async (req, res) => {
    try {
      const data = req.body;
      console.log("Recebendo nova marcação para salvar:", data.date);
      await db.insert(timeEntries)
        .values(data)
        .onConflictDoUpdate({
          target: timeEntries.date,
          set: data
        });
      console.log("Marcação salva com sucesso:", data.date);
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao salvar marcação no banco:", error);
      res.status(500).json({ error: "Erro ao salvar marcação no banco de dados. Verifique se o banco está configurado corretamente." });
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
  app.get("/api/sync-ponto-empresa", (req, res) => {
    console.log("GET /api/sync-ponto-empresa chamado");
    res.json({ message: "O endpoint de sincronização está ativo. Use POST para iniciar a sincronização." });
  });

  app.post("/api/sync-ponto-empresa", async (req, res) => {
    console.log("POST /api/sync-ponto-empresa chamado");
    try {
      // Verifica banco manualmente dentro da rota para isolar o problema
      if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL ausente no POST sync");
        return res.status(500).json({ error: "DATABASE_URL não configurada." });
      }
      
      const matricula = '109194'; // Sua matrícula fixa
      const url = 'https://webapp.confianca.com.br/consultaponto/ponto.aspx';

      console.log("Iniciando sincronização com a empresa...");

      // 1. GET: Pegar os tokens de segurança do ASP.NET
      console.log(`Fazendo GET em ${url}...`);
      const initialResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(10000) // 10s timeout
      });
      
      if (!initialResponse.ok) {
        throw new Error(`O site da empresa retornou status ${initialResponse.status} no GET inicial.`);
      }

      const initialHtml = await initialResponse.text();
      const $initial = cheerio.load(initialHtml);

      const viewState = $initial('input[name="__VIEWSTATE"]').val() as string;
      const viewStateGenerator = $initial('input[name="__VIEWSTATEGENERATOR"]').val() as string;
      const eventValidation = $initial('input[name="__EVENTVALIDATION"]').val() as string;

      console.log("Tokens capturados:", { viewState: !!viewState, viewStateGenerator: !!viewStateGenerator, eventValidation: !!eventValidation });

      if (!viewState) {
        console.log("HTML inicial recebido (primeiros 500 chars):", initialHtml.substring(0, 500));
        return res.status(500).json({ error: "Falha ao capturar o ViewState do site da empresa. O site pode estar fora do ar ou bloqueando o acesso." });
      }

      // 2. POST: Simular o preenchimento e clique no botão
      const formData = new URLSearchParams();
      formData.append('__VIEWSTATE', viewState);
      if (viewStateGenerator) formData.append('__VIEWSTATEGENERATOR', viewStateGenerator);
      if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
      
      formData.append('txtMatricula', matricula);
      formData.append('btnConsultar', 'Consultar');

      console.log(`Fazendo POST em ${url} para matrícula ${matricula}...`);
      const postResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(15000) // 15s timeout
      });

      if (!postResponse.ok) {
        throw new Error(`O site da empresa retornou status ${postResponse.status} no POST de consulta.`);
      }

      const finalHtml = await postResponse.text();
      const $ = cheerio.load(finalHtml);
      
      const marcacoesSalvas: any[] = [];

      console.log("HTML final recebido, iniciando extração...");
      
      let dataAtual: string | null = null;
      let punchesDoDia: string[] = [];
      const mapaMarcacoes: Map<string, any> = new Map();

      // 3. Extrair os dados (Lógica flexível para layouts verticais ou horizontais)
      console.log("Iniciando varredura de linhas para extração...");
      
      const hoje = new Date();
      const hojeIso = hoje.toISOString().split('T')[0];
      let dataPadrao = hojeIso;

      $('tr').each((index, element) => {
        const textoLinha = $(element).text().replace(/\s+/g, ' ').trim();
        if (index < 30) console.log(`Linha ${index} texto bruto: "${textoLinha}"`);
        
        // 1. Tenta encontrar uma data no formato DD/MM/YYYY
        const matchData = textoLinha.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (matchData) {
          if (dataAtual && punchesDoDia.length > 0) {
            console.log(`Salvando dia anterior: ${dataAtual} com ${punchesDoDia.length} batidas.`);
            mapaMarcacoes.set(dataAtual, [...punchesDoDia]);
          }
          const [dia, mes, ano] = matchData[1].split('/');
          dataAtual = `${ano}-${mes}-${dia}`;
          punchesDoDia = [];
          console.log(`Nova data detectada: ${matchData[1]} -> ${dataAtual}`);
        }

        // 2. Tenta encontrar horários (HH:MM)
        // Regex mais flexível: permite espaços ou caracteres ao redor
        const matchesHorario = textoLinha.match(/([0-2]?\d:[0-5]\d)/g);
        if (matchesHorario) {
          if (!dataAtual) {
            dataAtual = dataPadrao;
            console.log(`Horário encontrado sem data prévia. Usando hoje: ${dataAtual}`);
          }

          matchesHorario.forEach(h => {
            // Normaliza o horário para HH:MM (ex: 8:09 -> 08:09)
            let [hora, min] = h.split(':');
            const hFormatada = `${hora.padStart(2, '0')}:${min}`;
            
            if (!punchesDoDia.includes(hFormatada)) {
              punchesDoDia.push(hFormatada);
              console.log(`[${dataAtual}] Batida adicionada: ${hFormatada}`);
            }
          });
        }
      });

      // Salva o último dia processado
      if (dataAtual && punchesDoDia.length > 0) {
        console.log(`Salvando último dia processado: ${dataAtual} com ${punchesDoDia.length} batidas.`);
        mapaMarcacoes.set(dataAtual, [...punchesDoDia]);
      }

      console.log(`Total de dias no mapa: ${mapaMarcacoes.size}`);

      // Converte o mapa para o formato do banco
      mapaMarcacoes.forEach((punches, date) => {
        // Ordenar as batidas do dia para garantir a ordem cronológica
        punches.sort();
        
        const marcacao = {
          date: date,
          entry_1: punches[0] || '',
          exit_1: punches[1] || '',
          entry_2: punches[2] || '',
          exit_2: punches[3] || '',
          entry_3: punches[4] || '',
          exit_3: punches[5] || '',
          entry_4: punches[6] || '',
          exit_4: punches[7] || '',
          entry_5: punches[8] || '',
          exit_5: punches[9] || '',
        };
        console.log(`Preparando para salvar no banco: ${date} ->`, punches);
        marcacoesSalvas.push(marcacao);
      });

      console.log(`Extração finalizada. Enviando ${marcacoesSalvas.length} registros para o banco.`);

      // 4. Inserir ou atualizar no banco de dados (Neon DB)
      for (const marcacao of marcacoesSalvas) {
        try {
          await db.insert(timeEntries)
            .values(marcacao)
            .onConflictDoUpdate({
              target: timeEntries.date,
              set: marcacao
            });
        } catch (dbErr) {
          console.error(`Erro ao salvar marcação de ${marcacao.date}:`, dbErr);
        }
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

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Erro global no servidor:", err);
    res.status(500).json({ error: "Erro interno no servidor", details: err.message });
  });
}

startServer();
