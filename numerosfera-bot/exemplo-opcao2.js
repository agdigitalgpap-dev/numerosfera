/**
 * Exemplo Opção 2 — Geometria sagrada animada como background (via ffmpeg mandelbrot/plasma)
 * Background fractal colorido em tons dark/dourado + texto sobreposto
 */

require('dotenv').config();
const { execSync } = require('child_process');
const puppeteer    = require('puppeteer');
const Anthropic    = require('@anthropic-ai/sdk');
const fs           = require('fs');
const path         = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FPS    = 30;
const DURACAO_POR_TIPO = { hook: 5, revelacao: 9, cta: 7 };

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
const TEMA    = _brief?.[`reel2`]?.tema || DOR_MAP[dor] || dor;
const TEM_CTA = (_brief?.cta_formato === 'reel') || !_brief?.cta_formato;
const ENCERRM = _brief?.encerramento || 'Salve este post para não esquecer.';

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

// Gera vídeo de geometria sagrada animada com ffmpeg (mandelbrot zoom dourado)
function gerarBackgroundVideo(outputPath, duracaoTotal) {
  console.log('  Gerando geometria sagrada animada (mandelbrot)...');
  // Mandelbrot zoom com color grading dourado/escuro
  const cmd = [
    'ffmpeg -y',
    `-f lavfi -i "mandelbrot=s=1080x1920:r=${FPS}:maxiter=200"`,
    `-vf "hue=h=40:s=1.8,curves=r='0/0 0.5/0.6 1/0.85':g='0/0 0.5/0.35 1/0.55':b='0/0 0.5/0.05 1/0.15',vignette=angle=PI/4,scale=1080:1920"`,
    `-t ${duracaoTotal}`,
    `-c:v libx264 -pix_fmt yuv420p -preset fast`,
    `"${outputPath}"`,
  ].join(' ');
  execSync(cmd, { stdio: 'pipe' });
}

// Renderiza frame com fundo transparente para composição
async function renderizarFrameTexto(browser, cena, index, total, outputPath) {
  const isHook = cena.tipo === 'hook';
  const isCta  = cena.tipo === 'cta';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; height:1920px; background:transparent; font-family:'Georgia',serif; color:#e8dfc8; overflow:hidden; display:flex; align-items:center; justify-content:center; }
  .slide { width:1080px; height:1920px; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:100px 80px; }
  .overlay { position:absolute; inset:0; background:linear-gradient(180deg,rgba(4,2,14,0.65) 0%,rgba(4,2,14,0.45) 50%,rgba(4,2,14,0.72) 100%); }
  .border-outer { position:absolute; inset:32px; border:1px solid rgba(196,164,72,0.45); pointer-events:none; }
  .border-inner  { position:absolute; inset:46px; border:1px solid rgba(196,164,72,0.12); pointer-events:none; }
  .corner { position:absolute; width:42px; height:42px; border-color:rgba(196,164,72,0.75); border-style:solid; }
  .corner-tl { top:32px; left:32px; border-width:2px 0 0 2px; }
  .corner-tr { top:32px; right:32px; border-width:2px 2px 0 0; }
  .corner-bl { bottom:32px; left:32px; border-width:0 0 2px 2px; }
  .corner-br { bottom:32px; right:32px; border-width:0 2px 2px 0; }
  .logo      { position:absolute; top:70px; left:80px; z-index:2; font-size:12px; letter-spacing:6px; color:rgba(196,164,72,0.7); text-transform:uppercase; }
  .scene-num { position:absolute; top:70px; right:80px; z-index:2; font-size:11px; letter-spacing:4px; color:rgba(196,164,72,0.4); }
  .content {
    position:relative; z-index:2; text-align:center; max-width:860px; width:100%;
    background:rgba(2,1,10,0.78); border:1px solid rgba(196,164,72,0.2);
    border-radius:4px; padding:56px 64px;
  }
  .eyebrow { font-size:13px; letter-spacing:6px; text-transform:uppercase; color:rgba(196,164,72,0.7); margin-bottom:32px; }
  .divider  { width:140px; height:1px; background:linear-gradient(90deg,transparent,rgba(196,164,72,0.55),transparent); margin:0 auto 40px; }
  .titulo   { font-size:${isHook ? '86' : '60'}px; font-weight:700; line-height:1.1;
    background:linear-gradient(180deg,#FFF8B0 0%,#F0D870 30%,#D4A84B 65%,#B8922A 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
    margin-bottom:32px; filter:drop-shadow(0 2px 24px rgba(196,164,72,0.5)); }
  .corpo    { font-size:30px; line-height:1.7; color:rgba(232,223,200,0.88); }
  .line     { width:60px; height:1px; background:rgba(196,164,72,0.4); margin:24px auto; }
  .cta-box  { margin-top:36px; padding:22px 52px; border:1px solid rgba(196,164,72,0.5); background:rgba(196,164,72,0.08); font-size:20px; letter-spacing:4px; text-transform:uppercase; color:#D4A84B; }
  .footer-cta { position:absolute; bottom:90px; left:0; right:0; z-index:2; text-align:center; font-size:18px; letter-spacing:3px; color:rgba(196,164,72,0.55); text-transform:uppercase; }
</style></head>
<body><div class="slide">
  <div class="overlay"></div>
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

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function main() {
  console.log('\n[Opção 2] Geometria sagrada animada + texto\n');

  console.log('Gerando cenas...');
  const dados = await gerarCenas();
  const duracoes = dados.cenas.map(c => DURACAO_POR_TIPO[c.tipo] || 7);
  const transicao = 0.8;
  const duracaoTotal = duracoes.reduce((s,d) => s+d, 0) - (dados.cenas.length-1)*transicao;

  const dir = path.join(__dirname, 'reels', 'exemplo-opcao2');
  fs.mkdirSync(dir, { recursive: true });

  // 1. Gera background animado
  const bgPath = path.join(dir, 'background.mp4');
  gerarBackgroundVideo(bgPath, Math.ceil(duracaoTotal) + 2);

  // 2. Renderiza frames de texto
  console.log('Renderizando texto...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const frames = [];
  for (let i = 0; i < dados.cenas.length; i++) {
    const fPath = path.join(dir, `frame-${String(i+1).padStart(2,'0')}.png`);
    await renderizarFrameTexto(browser, dados.cenas[i], i + 1, dados.cenas.length, fPath);
    frames.push(fPath);
    console.log(`  Frame ${i+1}/5 ✓`);
  }
  await browser.close();

  // 3. Compõe: background animado + texto overlay com xfade
  console.log('Montando vídeo com geometria sagrada...');

  const offsets = [];
  let acum = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    acum += duracoes[i] - transicao;
    offsets.push(acum.toFixed(2));
  }

  // Gera slideshow de texto com xfade
  const textInputs  = frames.map((f, i) => `-loop 1 -t ${duracoes[i]} -i "${f}"`).join(' ');
  const scaleParts  = frames.map((_, i) => `[${i}:v]scale=1080:1920,fps=${FPS},setsar=1[v${i}]`);
  let xfadeParts = [], prev = 'v0';
  for (let i = 1; i < frames.length; i++) {
    const out = i < frames.length - 1 ? `x${i}` : 'textout';
    xfadeParts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${transicao}:offset=${offsets[i-1]}[${out}]`);
    prev = out;
  }

  // Compõe background + texto overlay
  const n = frames.length;
  const musicaPath = path.join(__dirname, '..', 'assets', 'audio-loop.mp3');
  const fadeOut = Math.max(0, duracaoTotal - 2.5).toFixed(2);

  const filterComplex = [
    ...scaleParts, ...xfadeParts,
    `[${n}:v]scale=1080:1920,fps=${FPS},setsar=1,trim=duration=${duracaoTotal.toFixed(2)}[bg]`,
    `[bg][textout]overlay=0:0[vout]`,
    `[${n+1}:a]volume=0.18,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=2.5[aout]`,
  ].join(';');

  const outPath = path.join(dir, 'opcao2.mp4');
  const cmd = `ffmpeg -y ${textInputs} -i "${bgPath}" -i "${musicaPath}" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -pix_fmt yuv420p -preset fast -c:a aac -b:a 128k -t ${duracaoTotal.toFixed(2)} "${outPath}"`;
  execSync(cmd, { stdio: 'pipe' });

  console.log(`\n✓ Opção 2 pronta: ${outPath}\n`);
  try { execSync(`open "${outPath}"`); } catch(_) {}
}

main().catch(err => { console.error('[Erro]', err.message); process.exit(1); });
