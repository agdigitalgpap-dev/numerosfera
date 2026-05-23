/**
 * Gerador de Stories — Numerosfera
 * 5 stories 1080×1920 PNG em sequência narrativa
 * Sem CTA explícito, sem "arraste para ver", sem opções A/B
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DOR_MAP = {
  'financas':     'finanças — o dinheiro some e as dívidas ficam',
  'familia':      'família — brigas, filhos afastados, casa sem paz',
  'saude':        'saúde — cansaço constante e sintomas que não têm explicação',
  'vida-amorosa': 'vida amorosa — sempre as pessoas erradas, o eterno quase',
};

const dor = (process.argv[2] || 'financas').toLowerCase().trim();

function lerBrief() {
  const briefPath = path.join(__dirname, 'brief-do-dia.json');
  if (fs.existsSync(briefPath)) {
    try { return JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch(_) {}
  }
  return null;
}
const brief = lerBrief();
const TEMA    = brief?.stories?.tema || DOR_MAP[dor] || dor;
const ENCERRM = brief?.encerramento || 'Compartilhe com alguém que precisa ver isso.';

async function gerarSequencia() {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `Copywriter da Numerosfera (numerologia hermetica). Tom mistico, elegante. Publico: mulheres 25-50 BR.

Crie 5 stories narrativos sobre: "${TEMA}"

REGRAS ABSOLUTAS:
- Nunca use A) B) C) ou qualquer lista numerada ou com bullets
- Corpo: UMA frase corrida, max 20 palavras, nunca enumere opcoes
- Story 1 sem corpo (corpo vazio)
- Story 3 termina com uma pergunta curta e direta como "Voce ja sentiu isso?"
- Story 5 usa exatamente este corpo: "${ENCERRM}"
- Sem mencionar CTA, sem "Comente MAPA", sem "link na bio"

Estrutura:
- Story 1 (capa): titulo que para tudo, max 6 palavras, corpo vazio
- Story 2 (revelacao): aprofunda a dor. Titulo curto + corpo
- Story 3 (revelacao): apresenta o bloqueio energetico como causa. Titulo + corpo (termina com pergunta)
- Story 4 (virada): a solucao existe no mapa numerologico. Titulo + corpo esperancoso
- Story 5 (conclusao): titulo reflexivo curto + corpo: "${ENCERRM}"

Retorne SOMENTE JSON puro sem markdown:
{"slides":[
  {"tipo":"capa","eyebrow":"Numerosfera","titulo":"...","corpo":""},
  {"tipo":"revelacao","eyebrow":"...","titulo":"...","corpo":"..."},
  {"tipo":"revelacao","eyebrow":"...","titulo":"...","corpo":"..."},
  {"tipo":"virada","eyebrow":"...","titulo":"...","corpo":"..."},
  {"tipo":"conclusao","eyebrow":"Numerosfera","titulo":"...","corpo":"${ENCERRM}"}
]}`
    }],
  });
  const raw = msg.content[0].text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude nao retornou JSON');
  return JSON.parse(match[0].replace(/,(\s*[}\]])/g, '$1'));
}

function gerarHtml(slide, index, total) {
  const isCapa   = slide.tipo === 'capa';
  const isVirada = slide.tipo === 'virada';

  const bg = {
    capa:      'radial-gradient(ellipse at 50% 38%, #120e22 0%, #06040f 58%, #000008 100%)',
    revelacao: 'radial-gradient(ellipse at 50% 42%, #0d0b1c 0%, #050410 58%, #000008 100%)',
    virada:    'radial-gradient(ellipse at 50% 42%, #0e1218 0%, #040810 58%, #000008 100%)',
    conclusao: 'radial-gradient(ellipse at 50% 38%, #120e22 0%, #06040f 58%, #000008 100%)',
  }[slide.tipo] || 'radial-gradient(ellipse at 50% 40%, #0d0b1a 0%, #05050d 60%, #000008 100%)';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1080px; height:1920px; background:${bg};
    font-family:'Georgia',serif; color:#e8dfc8; overflow:hidden;
    display:flex; align-items:center; justify-content:center;
  }
  .slide { width:1080px; height:1920px; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:110px 90px; }

  .glow { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:900px; height:900px; background:radial-gradient(ellipse,rgba(184,146,42,0.07) 0%,transparent 65%); pointer-events:none; }

  .border-outer { position:absolute; inset:32px; border:1px solid rgba(196,164,72,0.38); }
  .border-inner  { position:absolute; inset:46px; border:1px solid rgba(196,164,72,0.10); }
  .corner { position:absolute; width:42px; height:42px; border-color:rgba(196,164,72,0.7); border-style:solid; }
  .corner-tl { top:32px;    left:32px;  border-width:2px 0 0 2px; }
  .corner-tr { top:32px;    right:32px; border-width:2px 2px 0 0; }
  .corner-bl { bottom:32px; left:32px;  border-width:0 0 2px 2px; }
  .corner-br { bottom:32px; right:32px; border-width:0 2px 2px 0; }

  .logo      { position:absolute; top:70px; left:80px; font-size:11px; letter-spacing:6px; color:rgba(196,164,72,0.55); text-transform:uppercase; }
  .progresso { position:absolute; top:70px; right:80px; display:flex; gap:10px; }
  .prog-dot  { width:28px; height:3px; background:rgba(196,164,72,0.22); border-radius:2px; }
  .prog-dot.ativo { background:rgba(196,164,72,0.75); }

  .content  { position:relative; z-index:1; text-align:center; max-width:880px; width:100%; }
  .eyebrow  { font-size:13px; letter-spacing:6px; text-transform:uppercase; color:rgba(196,164,72,0.65); margin-bottom:36px; }
  .divider  { width:140px; height:1px; background:linear-gradient(90deg,transparent,rgba(196,164,72,0.55),transparent); margin:0 auto 48px; }

  .titulo {
    font-size:${isCapa ? '86px' : '64px'}; font-weight:700; line-height:1.1;
    color:#D4A84B;
    filter:drop-shadow(0 2px 22px rgba(196,164,72,0.35));
    margin-bottom:${slide.corpo ? '40px' : '0'};
  }
  ${isVirada ? '.titulo { color:#FFE87C; filter:drop-shadow(0 2px 28px rgba(196,164,72,0.55)); }' : ''}

  .corpo { font-size:38px; line-height:1.65; color:rgba(232,223,200,0.88); }

  .linha { width:60px; height:1px; background:rgba(196,164,72,0.38); margin:32px auto; }
</style></head>
<body><div class="slide">
  <div class="glow"></div>
  <div class="border-outer"></div><div class="border-inner"></div>
  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div><div class="corner corner-br"></div>
  <div class="logo">Numerosfera</div>

  <div class="progresso">
    ${Array.from({length: total}, (_, i) =>
      `<div class="prog-dot ${i < index ? 'ativo' : ''}"></div>`
    ).join('')}
  </div>

  <div class="content">
    ${slide.eyebrow ? `<p class="eyebrow">${slide.eyebrow}</p>` : ''}
    <div class="divider"></div>
    ${slide.titulo ? `<h2 class="titulo">${slide.titulo}</h2>` : ''}
    ${slide.corpo  ? `<p class="corpo">${slide.corpo}</p>` : ''}
  </div>
</div></body></html>`;
}

async function main() {
  console.log(`\n[Stories] Tema: "${TEMA}"\n`);

  console.log('Gerando sequência com Claude...');
  const dados = await gerarSequencia();

  const data = new Date().toISOString().slice(0, 10);
  const dir  = path.join(__dirname, 'posts', data, 'stories');
  fs.mkdirSync(dir, { recursive: true });

  console.log('Renderizando 5 stories...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const paths   = [];

  for (let i = 0; i < dados.slides.length; i++) {
    const slide   = dados.slides[i];
    const html    = gerarHtml(slide, i + 1, dados.slides.length);
    const outPath = path.join(dir, `story-${String(i+1).padStart(2,'0')}-${slide.tipo}.png`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outPath, type: 'png' });
    await page.close();
    paths.push(outPath);
    console.log(`  ✓ Story ${i+1}/5 — ${slide.tipo}`);
  }

  await browser.close();
  console.log(`\n✓ 5 stories salvos em:\n  ${dir}\n`);
  return paths;
}

if (require.main === module) {
  main()
    .then(() => { try { require('child_process').execSync(`open "${path.join(__dirname,'posts',new Date().toISOString().slice(0,10),'stories')}"`); } catch(_){} })
    .catch(err => { console.error('[Erro]', err.message); process.exit(1); });
}

module.exports = { main };
