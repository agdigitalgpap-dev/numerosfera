/**
 * Exemplo Opção 1 — Texto animado em fundo escuro
 * Fundo dark consistente + partículas douradas via ffmpeg + texto fade-in por cena
 */

require('dotenv').config();
const { execSync } = require('child_process');
const puppeteer    = require('puppeteer');
const Anthropic    = require('@anthropic-ai/sdk');
const fs           = require('fs');
const path         = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FPS    = 30;

const DOR_MAP = {
  'financas':     'finanças — por que o dinheiro não fica',
  'familia':      'família — brigas, filhos afastados, harmonia que não chega',
  'saude':        'saúde — cansaço constante, sintomas sem explicação',
  'vida-amorosa': 'vida amorosa — pessoas erradas, solidão, o eterno quase',
};
const dor = (process.argv[2] || 'financas').toLowerCase().trim();

function lerBriefReel(id) {
  const briefPath = path.join(__dirname, 'brief-do-dia.json');
  if (fs.existsSync(briefPath)) {
    try {
      const b = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
      return b?.[`reel${id}`]?.tema || null;
    } catch(_) {}
  }
  return null;
}
const _brief  = (() => { const p = require('path').join(__dirname, 'brief-do-dia.json'); try { return JSON.parse(require('fs').readFileSync(p, 'utf-8')); } catch(_) { return {}; } })();
const TEMA    = _brief?.[`reel1`]?.tema || DOR_MAP[dor] || dor;
const TEM_CTA = (_brief?.cta_formato === 'reel') || !_brief?.cta_formato;
const ENCERRM = _brief?.encerramento || 'Salve este post para não esquecer.';

const DURACAO_POR_TIPO = { hook: 5, revelacao: 9, cta: 7 };

async function gerarCenas() {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Você é copywriter da Numerosfera (numerologia). Tom: místico, elegante.
Crie um Reel de 5 cenas sobre: "${TEMA}"
- Cena 1 (hook): título 4-6 palavras, impacto máximo, sem corpo
- Cenas 2-4 (revelacao): título curto + corpo até 18 palavras
- Cena 5 (encerramento): ${TEM_CTA ? 'eyebrow "Teste Gratuito", titulo "Comente MAPA aqui embaixo", corpo "Vou te enviar seu teste de numerologia gratuito no direct"' : 'titulo reflexivo curto, corpo: ' + JSON.stringify(ENCERRM)}
Retorne SOMENTE JSON: {"cenas":[{"tipo":"...","eyebrow":"...","titulo":"...","corpo":"..."}]}`
    }],
  });
  const match = msg.content[0].text.match(/\{[\s\S]*\}/);
  return JSON.parse(match[0]);
}

// Template HTML com partículas CSS animadas
function gerarHtmlFrame(cena, index, total) {
  const isHook = cena.tipo === 'hook';
  const isCta  = cena.tipo === 'cta';

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1080px; height:1920px;
    background: radial-gradient(ellipse at 50% 40%, #0d0b1a 0%, #05050d 60%, #000008 100%);
    font-family:'Georgia',serif; color:#e8dfc8; overflow:hidden;
    display:flex; align-items:center; justify-content:center;
  }

  /* Partículas douradas */
  .particles { position:absolute; inset:0; pointer-events:none; }
  .p {
    position:absolute; border-radius:50%;
    background:rgba(196,164,72,0.6);
    animation: float linear infinite;
  }
  @keyframes float {
    0%   { transform:translateY(0px) translateX(0px); opacity:0; }
    10%  { opacity:1; }
    90%  { opacity:0.6; }
    100% { transform:translateY(-600px) translateX(var(--dx)); opacity:0; }
  }

  /* Brilho central */
  .glow {
    position:absolute; top:50%; left:50%;
    transform:translate(-50%,-50%);
    width:700px; height:700px;
    background: radial-gradient(ellipse, rgba(184,146,42,0.06) 0%, transparent 70%);
    animation: pulse 4s ease-in-out infinite;
    pointer-events:none;
  }
  @keyframes pulse {
    0%,100% { transform:translate(-50%,-50%) scale(1); opacity:0.6; }
    50%      { transform:translate(-50%,-50%) scale(1.2); opacity:1; }
  }

  /* Bordas douradas */
  .slide { width:1080px; height:1920px; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 80px; }
  .border-outer { position:absolute; inset:32px; border:1px solid rgba(196,164,72,0.35); pointer-events:none; }
  .border-inner  { position:absolute; inset:46px; border:1px solid rgba(196,164,72,0.10); pointer-events:none; }
  .corner { position:absolute; width:42px; height:42px; border-color:rgba(196,164,72,0.7); border-style:solid; }
  .corner-tl { top:32px;    left:32px;  border-width:2px 0 0 2px; }
  .corner-tr { top:32px;    right:32px; border-width:2px 2px 0 0; }
  .corner-bl { bottom:32px; left:32px;  border-width:0 0 2px 2px; }
  .corner-br { bottom:32px; right:32px; border-width:0 2px 2px 0; }

  .logo      { position:absolute; top:70px; left:80px; font-size:12px; letter-spacing:6px; color:rgba(196,164,72,0.55); text-transform:uppercase; }
  .scene-num { position:absolute; top:70px; right:80px; font-size:11px; letter-spacing:4px; color:rgba(196,164,72,0.35); text-transform:uppercase; }

  /* Conteúdo */
  .content { position:relative; z-index:1; text-align:center; max-width:860px; width:100%; animation: appear 0.8s ease-out both; }
  @keyframes appear { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }

  .eyebrow { font-size:13px; letter-spacing:6px; text-transform:uppercase; color:rgba(196,164,72,0.65); margin-bottom:32px; }
  .divider  { width:140px; height:1px; background:linear-gradient(90deg,transparent,rgba(196,164,72,0.5),transparent); margin:0 auto 40px; }
  .titulo   { font-size:${isHook ? '88' : '62'}px; font-weight:700; line-height:1.1;
    background:linear-gradient(180deg,#FFF0A0 0%,#F0D870 30%,#D4A84B 65%,#B8922A 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
    margin-bottom:36px; filter:drop-shadow(0 2px 20px rgba(196,164,72,0.4)); }
  .corpo    { font-size:30px; line-height:1.7; color:rgba(232,223,200,0.85); }
  .line     { width:60px; height:1px; background:rgba(196,164,72,0.4); margin:28px auto; }
  .cta-box  { margin-top:40px; padding:24px 56px; border:1px solid rgba(196,164,72,0.45); background:rgba(196,164,72,0.07); font-size:20px; letter-spacing:4px; text-transform:uppercase; color:#D4A84B; }
  .footer-cta { position:absolute; bottom:90px; left:0; right:0; text-align:center; font-size:18px; letter-spacing:3px; color:rgba(196,164,72,0.5); text-transform:uppercase; }
</style></head>
<body><div class="slide">
  <div class="glow"></div>
  <div class="particles">
    ${Array.from({length:22}, (_,i) => {
      const size  = (Math.random()*3+1).toFixed(1);
      const left  = (Math.random()*100).toFixed(1);
      const delay = (Math.random()*8).toFixed(1);
      const dur   = (Math.random()*6+6).toFixed(1);
      const dx    = ((Math.random()-0.5)*120).toFixed(0);
      return `<div class="p" style="width:${size}px;height:${size}px;left:${left}%;bottom:-10px;animation-delay:${delay}s;animation-duration:${dur}s;--dx:${dx}px;"></div>`;
    }).join('')}
  </div>
  <div class="border-outer"></div><div class="border-inner"></div>
  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div><div class="corner corner-br"></div>
  <div class="logo">Numerosfera</div>
  <div class="scene-num">${String(index).padStart(2,'0')} / ${String(total).padStart(2,'0')}</div>
  <div class="content">
    ${cena.eyebrow ? `<p class="eyebrow">${cena.eyebrow}</p>` : ''}
    <div class="divider"></div>
    ${cena.titulo  ? `<h2 class="titulo">${cena.titulo}</h2>` : ''}
    ${cena.corpo   ? `<p class="corpo">${cena.corpo}</p>` : ''}
    ${isCta ? `<div class="line"></div><div class="cta-box">Comente MAPA aqui ↓</div>` : ''}
  </div>
  ${!isCta && TEM_CTA ? `<div class="footer-cta">Comente MAPA para receber seu teste grátis</div>` : ''}
</div></body></html>`;
}

// Captura frames da animação HTML (0.2s de intervalo até completar a duração)
async function capturarFrames(browser, cena, index, total, dir, duracao) {
  const html   = gerarHtmlFrame(cena, index, total);
  const page   = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const frames = [];
  const intervalo = 1 / FPS * 1000; // ms por frame
  const totalFrames = duracao * FPS;

  // Captura apenas 8 frames por cena (0s, meio, fim) — ffmpeg extrapola
  const keyFrames = [0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.9, 1.0].map(f => Math.floor(f * (totalFrames - 1)));

  for (const fi of keyFrames) {
    const t = fi / FPS;
    await page.evaluate((ms) => { return new Promise(r => setTimeout(r, ms)); }, t * 1000 * 0.3); // simula avanço leve
    const fPath = path.join(dir, `c${index}_f${String(fi).padStart(4,'0')}.png`);
    await page.screenshot({ path: fPath, type: 'png' });
    frames.push({ path: fPath, frame: fi });
  }

  await page.close();
  return frames;
}

async function main() {
  console.log('\n[Opção 1] Texto animado em fundo escuro\n');

  console.log('Gerando cenas...');
  const dados = await gerarCenas();

  const dir = path.join(__dirname, 'reels', `exemplo-opcao1`);
  fs.mkdirSync(dir, { recursive: true });

  console.log('Renderizando frames...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  // Gera 1 PNG por cena (snapshot limpo + animação CSS aplicada)
  const frames = [];
  const duracoes = dados.cenas.map(c => DURACAO_POR_TIPO[c.tipo] || 7);

  for (let i = 0; i < dados.cenas.length; i++) {
    const html = gerarHtmlFrame(dados.cenas[i], i + 1, dados.cenas.length);
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 600)); // deixa animação CSS rodar um momento
    const fPath = path.join(dir, `frame-${String(i+1).padStart(2,'0')}.png`);
    await page.screenshot({ path: fPath, type: 'png' });
    await page.close();
    frames.push(fPath);
    console.log(`  Frame ${i+1}/5 ✓`);
  }
  await browser.close();

  // Monta vídeo — transição slideleft/fade alternada
  const transicao   = 0.8;
  const offsets     = [];
  let acum = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    acum += duracoes[i] - transicao;
    offsets.push(acum.toFixed(2));
  }
  const duracaoTotal = duracoes.reduce((s,d) => s+d, 0) - (frames.length-1)*transicao;

  const transitions = ['fade','slideleft','slideright','fadeblack','fade'];

  const scaleParts = frames.map((_, i) =>
    `[${i}:v]scale=1080:1920,fps=${FPS},setsar=1[v${i}]`
  );
  let xfadeParts = [], prev = 'v0';
  for (let i = 1; i < frames.length; i++) {
    const tr  = transitions[i - 1] || 'fade';
    const out = i < frames.length - 1 ? `x${i}` : 'vout';
    xfadeParts.push(`[${prev}][v${i}]xfade=transition=${tr}:duration=${transicao}:offset=${offsets[i-1]}[${out}]`);
    prev = out;
  }

  const musicaPath = path.join(__dirname, '..', 'assets', 'audio-loop.mp3');
  const videoInputs = frames.map((f, i) => `-loop 1 -t ${duracoes[i]} -i "${f}"`).join(' ');
  const fadeOut = Math.max(0, duracaoTotal - 2.5).toFixed(2);
  const filterAll = [
    ...scaleParts, ...xfadeParts,
    `[${frames.length}:a]volume=0.18,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=2.5[aout]`
  ].join(';');

  const out = path.join(dir, 'opcao1.mp4');
  const cmd = `ffmpeg -y ${videoInputs} -i "${musicaPath}" -filter_complex "${filterAll}" -map "[vout]" -map "[aout]" -c:v libx264 -pix_fmt yuv420p -preset fast -c:a aac -b:a 128k -t ${duracaoTotal.toFixed(2)} "${out}"`;

  console.log('Montando vídeo...');
  execSync(cmd, { stdio: 'pipe' });
  console.log(`\n✓ Opção 1 pronta: ${out}\n`);
  try { execSync(`open "${out}"`); } catch(_) {}
}

main().catch(err => { console.error('[Erro]', err.message); process.exit(1); });
