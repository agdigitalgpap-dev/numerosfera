/**
 * Gerador de Post Estático — Numerosfera
 * 1080×1080 PNG — frase de impacto com identidade da marca
 *
 * Uso: node gerar-estatico.js financas
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DOR_MAP = {
  'financas':     'finanças — bloqueio de prosperidade',
  'familia':      'família — bloqueios nos laços afetivos',
  'saude':        'saúde — energia bloqueada no corpo',
  'vida-amorosa': 'vida amorosa — bloqueio no amor',
};

const dor = (process.argv[2] || 'financas').toLowerCase().trim();

// Lê brief do dia se disponível (gerado pelo gerar-dia.js)
function lerBrief() {
  const briefPath = path.join(__dirname, 'brief-do-dia.json');
  if (fs.existsSync(briefPath)) {
    try { return JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch(_) {}
  }
  return null;
}
const brief   = lerBrief();
const TEMA    = brief?.estatico?.tema || DOR_MAP[dor] || dor;
const TEM_CTA = (brief?.cta_formato === 'estatico') || !brief?.cta_formato;
const ENCERRM = brief?.encerramento || 'Você se identificou? Me conta nos comentários.';

async function gerarFrase() {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Você é copywriter da Numerosfera (numerologia/astrologia hermética).
Tom: místico, elegante, sofisticado. Público: mulheres brasileiras 25-50 anos.

Crie UMA frase de impacto para post estático do Instagram sobre: "${TEMA}"

Regras:
- Máx 12 palavras
- Deve provocar identificação imediata com a dor
- Pode ser revelação, pergunta retórica ou afirmação poderosa
- NÃO mencione numerologia explicitamente — deixe subentendido

Retorne SOMENTE JSON:
{"frase": "...", "eyebrow": "Numerosfera", "rodape": "' + (TEM_CTA ? 'Comente MAPA para receber seu mapa grátis 🔮' : ENCERRM) + '"}`
    }],
  });
  const match = msg.content[0].text.match(/\{[\s\S]*\}/);
  return JSON.parse(match[0]);
}

async function renderizar(dados, outputPath) {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1080px; height:1080px;
    background: radial-gradient(ellipse at 50% 45%, #100e1e 0%, #06050f 55%, #000008 100%);
    font-family:'Georgia',serif; color:#e8dfc8; overflow:hidden;
    display:flex; align-items:center; justify-content:center;
  }
  .slide { width:1080px; height:1080px; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px; }

  /* Brilho central pulsante */
  .glow { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:800px; height:800px; background:radial-gradient(ellipse,rgba(184,146,42,0.07) 0%,transparent 68%); pointer-events:none; }

  /* Bordas */
  .border-outer { position:absolute; inset:24px; border:1px solid rgba(196,164,72,0.38); }
  .border-inner  { position:absolute; inset:36px; border:1px solid rgba(196,164,72,0.10); }
  .corner { position:absolute; width:36px; height:36px; border-color:rgba(196,164,72,0.72); border-style:solid; }
  .corner-tl { top:24px;    left:24px;  border-width:2px 0 0 2px; }
  .corner-tr { top:24px;    right:24px; border-width:2px 2px 0 0; }
  .corner-bl { bottom:24px; left:24px;  border-width:0 0 2px 2px; }
  .corner-br { bottom:24px; right:24px; border-width:0 2px 2px 0; }

  .logo { position:absolute; top:48px; left:56px; font-size:11px; letter-spacing:6px; color:rgba(196,164,72,0.55); text-transform:uppercase; }

  /* Conteúdo */
  .content { position:relative; z-index:1; text-align:center; max-width:880px; }
  .eyebrow  { font-size:12px; letter-spacing:6px; text-transform:uppercase; color:rgba(196,164,72,0.6); margin-bottom:32px; }
  .divider  { width:160px; height:1px; background:linear-gradient(90deg,transparent,rgba(196,164,72,0.55),transparent); margin:0 auto 44px; }

  /* Frase principal — grande e impactante */
  .frase {
    font-size:58px; font-weight:700; line-height:1.18; letter-spacing:0.5px;
    background:linear-gradient(180deg,#FFF8B0 0%,#F0D870 25%,#D4A84B 60%,#B8922A 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
    filter:drop-shadow(0 2px 24px rgba(196,164,72,0.35));
    margin-bottom:48px;
  }

  .linha    { width:50px; height:1px; background:rgba(196,164,72,0.35); margin:0 auto 32px; }
  .rodape   { font-size:20px; letter-spacing:2px; color:rgba(196,164,72,0.55); font-style:italic; }
</style></head>
<body><div class="slide">
  <div class="glow"></div>
  <div class="border-outer"></div><div class="border-inner"></div>
  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div><div class="corner corner-br"></div>
  <div class="logo">Numerosfera</div>
  <div class="content">
    <p class="eyebrow">${dados.eyebrow}</p>
    <div class="divider"></div>
    <p class="frase">${dados.frase}</p>
    <div class="linha"></div>
    <p class="rodape">${dados.rodape}</p>
  </div>
</div></body></html>`;

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page    = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
}

async function main() {
  console.log(`\n[Estático] Tema: "${TEMA}"\n`);

  console.log('Gerando frase com Claude...');
  const dados = await gerarFrase();
  console.log(`  "${dados.frase}"`);

  const data = new Date().toISOString().slice(0, 10);
  const dir  = path.join(__dirname, 'posts', data);
  fs.mkdirSync(dir, { recursive: true });

  const outPath = path.join(dir, `estatico-${dor}.png`);
  await renderizar(dados, outPath);

  console.log(`\n✓ Post estático salvo:\n  ${outPath}\n`);
  return outPath;
}

if (require.main === module) {
  main().then(() => { try { require('child_process').execSync(`open "${path.join(__dirname,'posts',new Date().toISOString().slice(0,10))}"`); } catch(_){} })
        .catch(err => { console.error('[Erro]', err.message); process.exit(1); });
}

module.exports = { main };
