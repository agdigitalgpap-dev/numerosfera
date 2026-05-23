/**
 * Gerador Automático de Carrosséis — Numerosfera
 *
 * Roda todo dia às 7h e gera 3 carrosséis prontos para postar.
 * Envia notificação no Mac quando estiver pronto.
 *
 * Para ativar: node auto-carrossel.js
 * (deixe o terminal aberto — ele roda sozinho todo dia)
 */

require('dotenv').config();
const { execSync } = require('child_process');
const Anthropic    = require('@anthropic-ai/sdk');
const puppeteer    = require('puppeteer');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Temas fixos por dia da semana (fallback se Serper não estiver configurado)
const TEMAS_POR_DIA = {
  0: [ // Domingo
    'O que os números revelam sobre seu destino espiritual',
    'Por que domingo é o dia mais poderoso para sua numerologia',
    'Os 3 sinais do universo que você está ignorando',
  ],
  1: [ // Segunda
    'Como seu número pessoal define sua semana',
    'O que a numerologia diz sobre recomeços na segunda-feira',
    'Os números que atraem prosperidade nessa semana',
  ],
  2: [ // Terça
    'Seu mapa numerológico e os bloqueios invisíveis',
    'Por que algumas pessoas prosperam e outras não — a resposta está nos números',
    'Os 5 sinais de que seu campo energético está bloqueado',
  ],
  3: [ // Quarta
    'Quarta-feira e o portal energético do meio da semana',
    'O que seu signo revela sobre seus padrões emocionais',
    'Numerologia e relacionamentos — por que você atrai as pessoas erradas',
  ],
  4: [ // Quinta
    'Os números que mais aparecem na sua vida não são coincidência',
    'Como a numerologia explica as fases difíceis da sua vida',
    'O que seu número de nascimento diz sobre sua missão de vida',
  ],
  5: [ // Sexta
    'Sexta-feira e a energia de encerramento — o que os números dizem',
    'Como atrair o que você quer usando a força do seu mapa',
    'Os 3 bloqueios que impedem sua prosperidade segundo a numerologia',
  ],
  6: [ // Sábado
    'Sábado é dia de cuidar da sua energia — veja o que os números dizem',
    'O que sua data de nascimento revela sobre seu potencial oculto',
    'Numerologia e saúde — a conexão que ninguém te contou',
  ],
};

// ── Busca o que está viral no Brasil agora (qualquer assunto)
async function buscarTemasVirais() {
  if (!process.env.SERPER_API_KEY) {
    const dia = new Date().getDay();
    console.log('[Trends] Serper não configurado — usando temas do dia');
    return TEMAS_POR_DIA[dia];
  }

  try {
    // Busca o que está em alta no Brasil hoje — sem filtro de nicho
    const [trendingRes, noticiasRes] = await Promise.all([
      axios.post('https://google.serper.dev/search', {
        q: 'trending viral Brasil hoje',
        gl: 'br', hl: 'pt-br', num: 10,
        tbs: 'qdr:d', // apenas resultados das últimas 24h
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      }),
      axios.post('https://google.serper.dev/news', {
        q: 'mais buscado Brasil hoje',
        gl: 'br', hl: 'pt-br', num: 10,
      }, {
        headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      }),
    ]);

    const virais   = (trendingRes.data.organic || []).slice(0, 5).map(r => r.title);
    const noticias = (noticiasRes.data.news    || []).slice(0, 5).map(r => r.title);
    const tudo     = [...virais, ...noticias].join(' | ');

    console.log('[Trends] Assuntos virais do dia encontrados');

    // Claude pega o que está viral e cria ângulos de numerologia em cima
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Você é estrategista de conteúdo da Numerosfera (numerologia e astrologia hermética).

Esses são os assuntos mais virais do Brasil HOJE:
${tudo}

Crie 3 temas de carrossel para o Instagram da Numerosfera usando esses assuntos virais como gancho.
Estratégia: pegar o assunto trending e conectar com numerologia/espiritualidade.

Exemplos de como fazer:
- "Eclipse solar" → "O que o eclipse de hoje revela sobre o seu número de destino"
- "Mercúrio retrógrado" → "Por que Mercúrio retrógrado afeta mais quem tem esses números"
- "Copa do mundo" → "A numerologia dos maiores campeões — o número que define quem vence"
- "Eleições" → "O que a numerologia revela sobre os líderes que chegam ao poder"

Retorne SOMENTE este JSON:
{"temas": ["tema 1", "tema 2", "tema 3"]}`,
      }],
    });

    const match = msg.content[0].text.match(/\{[\s\S]*\}/);
    if (match) {
      const temas = JSON.parse(match[0]).temas;
      console.log('[Trends] Temas adaptados com sucesso');
      return temas;
    }
  } catch (err) {
    console.warn('[Trends] Falha ao buscar viral — usando temas do dia:', err.message);
  }

  return TEMAS_POR_DIA[new Date().getDay()];
}

// ── Gera textos dos slides via Claude
async function gerarTextoSlides(tema) {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Você é copywriter da Numerosfera — numerologia e astrologia hermética.
Público: mulheres brasileiras, 25-50 anos. Tom: místico, elegante, sofisticado.

Crie um carrossel de 6 slides sobre: "${tema}"

- Slide 1 (CAPA): título que para o scroll. Máx 8 palavras. Corpo vazio.
- Slides 2-5 (CORPO): insight poderoso. Máx 35 palavras cada.
- Slide 6 (CTA): fixo conforme abaixo.

Retorne SOMENTE este JSON:
{
  "slides": [
    { "tipo": "capa",  "eyebrow": "Numerosfera", "titulo": "...", "corpo": "" },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "cta", "eyebrow": "Teste Gratuito", "titulo": "Comente MAPA aqui embaixo", "corpo": "Vou te enviar seu teste de numerologia gratuito no direct 🔮" }
  ],
  "legenda_instagram": "legenda envolvente até 150 palavras + 15 hashtags. Última linha: Comente MAPA e te envio seu teste grátis no direct 🔮"
}`,
    }],
  });

  const match = msg.content[0].text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude não retornou JSON válido');
  return JSON.parse(match[0]);
}

// ── Renderiza um slide como PNG
async function renderizarSlide(browser, slide, index, total, outputPath) {
  const templatePath = path.join(__dirname, 'carrosseis', 'template.html');
  const html = fs.readFileSync(templatePath, 'utf-8');

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.evaluate((s, idx, tot) => {
    document.getElementById('slideNum').textContent =
      `${String(idx).padStart(2,'0')} / ${String(tot).padStart(2,'0')}`;
    document.getElementById('conteudo').innerHTML = `
      ${s.eyebrow ? `<p class="eyebrow">${s.eyebrow}</p>` : ''}
      <div class="divider"></div>
      ${s.titulo ? `<h2 class="titulo">${s.titulo}</h2>` : ''}
      ${s.corpo   ? `<p class="corpo">${s.corpo}</p>` : ''}
      ${s.tipo === 'cta' ? `<div class="line"></div><div class="cta-box">Fazer meu teste gratuito</div>` : ''}
    `;
  }, slide, index, total);

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

// ── Gera um carrossel completo
async function gerarCarrossel(tema, browser) {
  console.log(`\n  Gerando: "${tema}"`);

  const dados   = await gerarTextoSlides(tema);
  const data    = new Date().toISOString().slice(0, 10);
  const slug    = tema.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const dir     = path.join(__dirname, 'carrosseis', `${data}_${slug}`);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'legenda.txt'), dados.legenda_instagram);

  for (let i = 0; i < dados.slides.length; i++) {
    const out = path.join(dir, `slide-${String(i+1).padStart(2,'0')}.png`);
    await renderizarSlide(browser, dados.slides[i], i + 1, dados.slides.length, out);
    process.stdout.write(`    slide ${i+1}/6... `);
  }

  console.log(`✓\n  Salvo em: ${dir}`);
  return dir;
}

// ── Notificação no Mac
function notificarMac(titulo, mensagem) {
  try {
    execSync(`osascript -e 'display notification "${mensagem}" with title "${titulo}" sound name "Glass"'`);
  } catch (_) {}
}

// ── Abre a pasta no Finder
function abrirPasta(pasta) {
  try { execSync(`open "${pasta}"`); } catch (_) {}
}

// ── Rotina principal
async function rodarAgora() {
  const hora = new Date().toLocaleTimeString('pt-BR');
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  NUMEROSFERA — Gerando carrosséis do dia`);
  console.log(`  ${hora}`);
  console.log(`${'═'.repeat(50)}`);

  const temas = await buscarTemasVirais();
  console.log(`\n[Trends] Temas do dia:\n${temas.map((t,i) => `  ${i+1}. ${t}`).join('\n')}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const pastas = [];
  for (const tema of temas) {
    const pasta = await gerarCarrossel(tema, browser);
    pastas.push(pasta);
  }

  await browser.close();

  // Abre a pasta dos carrosséis do dia
  const pastaBase = path.join(__dirname, 'carrosseis');
  abrirPasta(pastaBase);

  // Notificação Mac
  notificarMac(
    '✅ Numerosfera — Carrosséis prontos!',
    `${temas.length} carrosséis gerados e prontos para postar`
  );

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ✅ ${temas.length} carrosséis prontos!`);
  console.log(`  A pasta foi aberta no Finder.`);
  console.log(`${'═'.repeat(50)}\n`);
}

// ── Agendador interno (roda às 7h todo dia)
function agendarProxima7h() {
  const agora   = new Date();
  const proxima = new Date();
  proxima.setHours(7, 0, 0, 0);
  if (proxima <= agora) proxima.setDate(proxima.getDate() + 1);

  const ms = proxima - agora;
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);

  console.log(`[Scheduler] Próxima geração em ${h}h${m}m (às 7h00)`);

  setTimeout(async () => {
    await rodarAgora();
    agendarProxima7h(); // reagenda para o dia seguinte
  }, ms);
}

// ── Início
(async () => {
  const args = process.argv.slice(2);

  if (args[0] === '--agora') {
    // Roda imediatamente (para testar)
    await rodarAgora();
    process.exit(0);
  } else {
    // Modo agendado: roda às 7h todo dia
    console.log('\n[Numerosfera Bot] Modo automático ativado');
    console.log('[Numerosfera Bot] Carrosséis gerados todo dia às 7h00\n');
    agendarProxima7h();

    // Gera imediatamente hoje se já passaram das 7h
    const agora = new Date();
    if (agora.getHours() >= 7) {
      console.log('[Numerosfera Bot] Já passou das 7h — gerando carrosséis de hoje agora...');
      await rodarAgora();
    }
  }
})();
