import { timeEntries } from "../../src/db/schema";
import { sql } from "drizzle-orm";
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as cheerio from 'cheerio';

export async function onRequestPost(context: any) {
  const matricula = context.request.headers.get('x-matricula');
  if (!matricula) return Response.json({ error: "Matrícula não informada" }, { status: 400 });

  const sqlClient = neon(context.env.DATABASE_URL);
  const db = drizzle(sqlClient);

  try {
    const url = 'https://webapp.confianca.com.br/consultaponto/ponto.aspx';

    // 1. GET Inicial e Captura de Cookies da Sessão
    const initialResponse = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    if (!initialResponse.ok) throw new Error("Falha no acesso inicial ao site da empresa.");

    let rawCookies: string[] = [];
    if (typeof initialResponse.headers.getSetCookie === 'function') {
      rawCookies = initialResponse.headers.getSetCookie();
    } else {
      const cookieHeader = initialResponse.headers.get('set-cookie');
      if (cookieHeader) {
        // Fallback for environments without getSetCookie
        // Note: This might break if cookies have commas in their Expires dates,
        // but it's better than nothing.
        rawCookies = cookieHeader.split(',').filter(c => !c.trim().startsWith('expires=') && !c.trim().startsWith('Expires='));
      }
    }
    const sessionCookie = rawCookies.map(c => c.split(';')[0]).join('; ');

    const initialHtml = await initialResponse.text();
    const $initial = cheerio.load(initialHtml);

    const viewState = $initial('input[name="__VIEWSTATE"]').val() as string;
    const viewStateGenerator = $initial('input[name="__VIEWSTATEGENERATOR"]').val() as string;
    const eventValidation = $initial('input[name="__EVENTVALIDATION"]').val() as string;

    if (!viewState) return Response.json({ error: "ViewState não encontrado." }, { status: 500 });

    // 2. POST com Form Data simulado
    const formData = new URLSearchParams();
    formData.append('__EVENTTARGET', 'btnConsultar');
    formData.append('__EVENTARGUMENT', '');
    formData.append('__VIEWSTATE', viewState);
    if (viewStateGenerator) formData.append('__VIEWSTATEGENERATOR', viewStateGenerator);
    if (eventValidation) formData.append('__EVENTVALIDATION', eventValidation);
    formData.append('txtMatricula', matricula);

    // Tentar enviar o período do mês atual
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDateBr = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    
    formData.append('txtDataInicial', formatDateBr(firstDay));
    formData.append('txtDataFinal', formatDateBr(today));
    formData.append('txtDataInicio', formatDateBr(firstDay)); // Tentativa com outro nome comum
    formData.append('txtDataFim', formatDateBr(today));

    const postResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cookie': sessionCookie
      },
      body: formData.toString()
    });

    const finalHtml = await postResponse.text();
    const $ = cheerio.load(finalHtml);
    const mapaMarcacoes: Map<string, any> = new Map();

    // 3. Extração de dados da Tabela
    const dataAtual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    $('#Grid tr, table tr').each((index, element) => {
      const textoLinha = $(element).text().replace(/\s+/g, ' ').trim();
      
      // Procurar por uma data no formato DD/MM/YYYY
      const matchData = textoLinha.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      let rowDate = dataAtual;
      if (matchData) {
        rowDate = `${matchData[3]}-${matchData[2]}-${matchData[1]}`; // YYYY-MM-DD
      }

      const matchesHorario = textoLinha.match(/([0-2]?\d:[0-5]\d)/g);
      
      if (matchesHorario) {
        const punchesDoDia: string[] = [];
        matchesHorario.forEach(h => {
          let [hora, min] = h.split(':');
          const hFormatada = `${hora.padStart(2, '0')}:${min}`;
          if (!punchesDoDia.includes(hFormatada)) punchesDoDia.push(hFormatada);
        });
        
        if (punchesDoDia.length > 0) {
          mapaMarcacoes.set(rowDate, punchesDoDia);
        }
      }
    });

    // 4. Transformar e Guardar no Neon DB
    
    // Garantir que a tabela e a chave primária existem no banco de produção
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS time_entries (
          matricula TEXT NOT NULL DEFAULT '000000',
          date TEXT NOT NULL,
          entry_1 TEXT, exit_1 TEXT,
          entry_2 TEXT, exit_2 TEXT,
          entry_3 TEXT, exit_3 TEXT,
          entry_4 TEXT, exit_4 TEXT,
          entry_5 TEXT, exit_5 TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          PRIMARY KEY (matricula, date)
        )
      `);
      
      // Add matricula column if it doesn't exist
      await db.execute(sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS matricula TEXT NOT NULL DEFAULT '000000'`);
      
      // Drop old primary key and add new composite primary key
      try {
        await db.execute(sql`ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_pkey`);
        await db.execute(sql`ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_date_unique`);
        await db.execute(sql`ALTER TABLE time_entries ADD PRIMARY KEY (matricula, date)`);
      } catch (e) {}
    } catch (e: any) {
      console.error("Erro ao configurar tabela:", e);
    }

    // Garantir que as colunas são do tipo TEXT
    const columns = ['entry_1', 'exit_1', 'entry_2', 'exit_2', 'entry_3', 'exit_3', 'entry_4', 'exit_4', 'entry_5', 'exit_5'];
    for (const col of columns) {
      try {
        await db.execute(sql.raw(`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS ${col} TEXT`));
        await db.execute(sql.raw(`ALTER TABLE time_entries ALTER COLUMN ${col} TYPE TEXT USING ${col}::TEXT`));
      } catch (e) {}
    }

    let savedCount = 0;
    const dbErrors: string[] = [];
    for (const [date, punches] of Array.from(mapaMarcacoes.entries())) {
      punches.sort();
      const marcacao: any = {
        matricula: matricula,
        date: date,
        entry_1: punches[0] || null, exit_1: punches[1] || null,
        entry_2: punches[2] || null, exit_2: punches[3] || null,
        entry_3: punches[4] || null, exit_3: punches[5] || null,
        entry_4: punches[6] || null, exit_4: punches[7] || null,
        entry_5: punches[8] || null, exit_5: punches[9] || null,
      };

      try {
        const entriesArr = [
          marcacao.entry_1, marcacao.exit_1,
          marcacao.entry_2, marcacao.exit_2,
          marcacao.entry_3, marcacao.exit_3,
          marcacao.entry_4, marcacao.exit_4,
          marcacao.entry_5, marcacao.exit_5
        ];
        
        await db.execute(sql`
          INSERT INTO time_entries (
            matricula, date, 
            entry_1, exit_1, entry_2, exit_2, entry_3, exit_3, entry_4, exit_4, entry_5, exit_5
          ) VALUES (
            ${matricula}, ${marcacao.date},
            ${entriesArr[0]}, ${entriesArr[1]}, ${entriesArr[2]}, ${entriesArr[3]}, ${entriesArr[4]}, ${entriesArr[5]}, ${entriesArr[6]}, ${entriesArr[7]}, ${entriesArr[8]}, ${entriesArr[9]}
          )
          ON CONFLICT (matricula, date) DO UPDATE SET
            entry_1 = EXCLUDED.entry_1, exit_1 = EXCLUDED.exit_1,
            entry_2 = EXCLUDED.entry_2, exit_2 = EXCLUDED.exit_2,
            entry_3 = EXCLUDED.entry_3, exit_3 = EXCLUDED.exit_3,
            entry_4 = EXCLUDED.entry_4, exit_4 = EXCLUDED.exit_4,
            entry_5 = EXCLUDED.entry_5, exit_5 = EXCLUDED.exit_5
        `);
        savedCount++;
      } catch (e: any) {
        console.error("Erro ao guardar no DB:", e);
        dbErrors.push(e.message);
      }
    }

    if (savedCount === 0) {
      return Response.json({ 
        success: true, 
        count: savedCount, 
        debugHtml: finalHtml.substring(0, 1000),
        dbErrors: dbErrors.slice(0, 5) // Return first 5 errors to avoid huge payloads
      });
    }

    return Response.json({ success: true, count: savedCount, dbErrors: dbErrors.length > 0 ? dbErrors.slice(0, 5) : undefined });
  } catch (error: any) {
    return Response.json({ error: "Erro no processamento do scraping", details: error.message }, { status: 500 });
  }
}
