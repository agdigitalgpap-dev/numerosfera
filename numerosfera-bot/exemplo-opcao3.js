/**
 * Exemplo Opção 3 — Leonardo AI no lado + texto ao lado
 * Frame dividido: imagem mística Leonardo na metade superior, texto na inferior
 * Resultado: visual rico + texto sempre legível
 */

require('dotenv').config();
const { execSync } = require('child_process');
const puppeteer    = require('puppeteer');
const Anthropic    = require('@anthropic-ai/sdk');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FPS    = 30;
const DURACAO_POR_TIPO = { hook: 5, revelacao: 9, cta: 7 };
const LEONARDO_KEY   = process.env.LEONARDO_API_KEY;
const LEONARDO_MODEL = 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3'; // Phoenix 1.0

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
const TEMA    = _brief?.[`reel3`]?.tema || DOR_MAP[dor] || dor;
const TEM_CTA = (_brief?.cta_formato === 'reel') || !_brief?.cta_formato;
const ENCERRM = _brief?.encerramento || 'Salve este post para não esquecer.';

async function gerarCenas() {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Você é copywriter da Numerosfera (numerologia). Tom: místico, elegante.
Crie um Reel de 5 cenas sobre: "${TEMA}"
- Cena 1 (hook): título 4-6 palavras, impacto máximo, sem corpo
- Cenas 2-4 (revelacao): título curto + corpo até 18 palavras
- Cena 5 (encerramento): ${TEM_CTA ? 'eyebrow "Teste Gratuito", titulo "Comente MAPA aqui embaixo", corpo "Vou te enviar seu teste de numerologia gratuito no direct"' : 'titulo reflexivo curto, corpo: ' + JSON.stringify(ENCERRM)}
Para cada cena inclua um "image_prompt" em inglês para Leonardo AI: imagem quadrada 1:1, estilo dark mystical hermetic, gold purple tones, sacred geometry, no people, no text.
Retorne SOMENTE JSON: {"cenas":[{"tipo":"...","eyebrow":"...","titulo":"...","corpo":"...","image_prompt":"..."}]}`
    }],
  });
  const match = msg.content[0].text.match(/\{[\s\S]*\}/);
  return JSON.parse(match[0]);
}

// Gera 2 imagens por cena em uma única call (economiza tokens e tempo)
async function gerarDuasImagensLeonardo(prompt, outputPathA, outputPathB) {
  const genRes = await axios.post(
    'https://cloud.leonardo.ai/api/rest/v1/generations',
    {
      modelId: LEONARDO_MODEL,
      prompt: prompt + ', square 1:1, no text, no watermark',
      negative_prompt: 'people, faces, hands, text, watermark, blur, low quality',
      width: 1024, height: 1024,
      num_images: 2,       // 2 variações em uma call
      guidance_scale: 7,
      alchemy: false,      // desligado para economizar tokens
    },
    { headers: { Authorization: `Bearer ${LEONARDO_KEY}`, 'Content-Type': 'application/json' } }
  );

  const generationId = genRes.data?.sdGenerationJob?.generationId;
  if (!generationId) throw new Error('Leonardo não retornou generationId');

  let images = [];
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await axios.get(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      { headers: { Authorization: `Bearer ${LEONARDO_KEY}` } }
    );
    const gen = pollRes.data?.generations_by_pk;
    if (gen?.status === 'COMPLETE' && gen.generated_images?.length >= 2) {
      images = gen.generated_images;
      break;
    }
  }
  if (images.length < 2) throw new Error('Leonardo não gerou 2 imagens');

  for (const [idx, outPath] of [[0, outputPathA], [1, outputPathB]]) {
    const imgRes = await axios.get(images[idx].url, { responseType: 'arraybuffer' });
    fs.writeFileSync(outPath, Buffer.from(imgRes.data));
  }
}

// Frame dividido: imagem Leonardo na metade superior, texto na inferior
async function renderizarFrameDividido(browser, cena, imagePath, index, total, outputPath) {
  const isHook = cena.tipo === 'hook';
  const isCta  = cena.tipo === 'cta';
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1080px; height:1920px; background:#05050f; font-family:'Georgia',serif; color:#e8dfc8; overflow:hidden; }

  /* Metade superior — imagem Leonardo com fade para baixo */
  .img-section {
    width:1080px; height:960px; position:relative; overflow:hidden;
  }
  .img-section img {
    width:100%; height:100%; object-fit:cover; object-position:center;
  }
  .img-fade {
    position:absolute; bottom:0; left:0; right:0; height:320px;
    background:linear-gradient(to bottom, transparent, #05050f);
  }

  /* Metade inferior — texto */
  .text-section {
    width:1080px; height:960px; position:relative;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:40px 80px 80px;
    background: radial-gradient(ellipse at 50% 0%, rgba(184,146,42,0.07) 0%, transparent 60%);
  }

  /* Divisor dourado */
  .gold-divider {
    width:240px; height:1px;
    background:linear-gradient(90deg,transparent,rgba(196,164,72,0.7),transparent);
    margin:0 auto 44px;
  }

  .eyebrow { font-size:12px; letter-spacing:6px; text-transform:uppercase; color:rgba(196,164,72,0.65); margin-bottom:28px; }
  .titulo  {
    font-size:${isHook ? '76' : '54'}px; font-weight:700; line-height:1.12; text-align:center;
    background:linear-gradient(180deg,#FFF8B0 0%,#F0D870 25%,#D4A84B 60%,#B8922A 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
    margin-bottom:28px; filter:drop-shadow(0 2px 20px rgba(196,164,72,0.4));
  }
  .corpo   { font-size:28px; line-height:1.7; color:rgba(232,223,200,0.85); text-align:center; }
  .line    { width:50px; height:1px; background:rgba(196,164,72,0.4); margin:20px auto; }
  .cta-box { margin-top:28px; padding:20px 48px; border:1px solid rgba(196,164,72,0.45); background:rgba(196,164,72,0.07); font-size:18px; letter-spacing:4px; text-transform:uppercase; color:#D4A84B; text-align:center; }

  /* Bordas nos cantos do frame inteiro */
  .corner { position:fixed; width:40px; height:40px; border-color:rgba(196,164,72,0.65); border-style:solid; z-index:10; }
  .corner-tl { top:24px; left:24px; border-width:2px 0 0 2px; }
  .corner-tr { top:24px; right:24px; border-width:2px 2px 0 0; }
  .corner-bl { bottom:24px; left:24px; border-width:0 0 2px 2px; }
  .corner-br { bottom:24px; right:24px; border-width:0 2px 2px 0; }

  .logo      { position:fixed; top:40px; left:60px; z-index:10; font-size:11px; letter-spacing:6px; color:rgba(196,164,72,0.6); text-transform:uppercase; }
  .scene-num { position:fixed; top:40px; right:60px; z-index:10; font-size:11px; letter-spacing:4px; color:rgba(196,164,72,0.35); }
  .footer-cta{ position:fixed; bottom:36px; left:0; right:0; z-index:10; text-align:center; font-size:16px; letter-spacing:3px; color:rgba(196,164,72,0.5); text-transform:uppercase; }
</style></head>
<body>
  <div class="corner corner-tl"></div><div class="corner corner-tr"></div>
  <div class="corner corner-bl"></div><div class="corner corner-br"></div>
  <div class="logo">Numerosfera</div>
  <div class="scene-num">${String(index).padStart(2,'0')} / ${String(total).padStart(2,'0')}</div>

  <div class="img-section">
    <img src="data:image/jpeg;base64,${imageBase64}" />
    <div class="img-fade"></div>
  </div>

  <div class="text-section">
    <div class="gold-divider"></div>
    ${cena.eyebrow ? `<p class="eyebrow">${cena.eyebrow}</p>` : ''}
    ${cena.titulo  ? `<h2 class="titulo">${cena.titulo}</h2>` : ''}
    ${cena.corpo   ? `<p class="corpo">${cena.corpo}</p>` : ''}
    ${isCta ? `<div class="line"></div><div class="cta-box">Comente MAPA aqui ↓</div>` : ''}
  </div>

  ${!isCta && TEM_CTA ? `<div class="footer-cta">Comente MAPA para receber seu teste grátis</div>` : ''}
</body></html>`;

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

async function main() {
  console.log('\n[Opção 3 — 10 imagens] Leonardo AI (2 por cena) + texto\n');

  console.log('Gerando cenas...');
  const dados = await gerarCenas();
  const nCenas = dados.cenas.length;

  const dir = path.join(__dirname, 'reels', 'exemplo-opcao3');
  fs.mkdirSync(dir, { recursive: true });

  // Gera 2 imagens por cena (1 call, num_images=2)
  console.log(`Gerando ${nCenas * 2} imagens com Leonardo AI (${nCenas} calls)...`);
  const imagePairs = []; // [[imgA, imgB], ...]
  for (let i = 0; i < nCenas; i++) {
    const pathA = path.join(dir, `img-${String(i+1).padStart(2,'0')}a.jpg`);
    const pathB = path.join(dir, `img-${String(i+1).padStart(2,'0')}b.jpg`);
    process.stdout.write(`  Cena ${i+1}/${nCenas} (2 imagens)... `);
    await gerarDuasImagensLeonardo(dados.cenas[i].image_prompt, pathA, pathB);
    imagePairs.push([pathA, pathB]);
    console.log('✓');
  }

  // Renderiza 2 frames por cena (mesma cena, imagem diferente)
  console.log('Renderizando frames...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const frames   = [];   // todos os frames em ordem
  const duracoes = [];   // duração de cada frame

  for (let i = 0; i < nCenas; i++) {
    const duracaoCena = DURACAO_POR_TIPO[dados.cenas[i].tipo] || 7;
    const metade      = duracaoCena / 2;

    for (const [j, imgPath] of imagePairs[i].entries()) {
      const fPath = path.join(dir, `frame-${String(i+1).padStart(2,'0')}${j === 0 ? 'a' : 'b'}.png`);
      await renderizarFrameDividido(browser, dados.cenas[i], imgPath, i + 1, nCenas, fPath);
      frames.push(fPath);
      duracoes.push(metade);
    }
    console.log(`  Cena ${i+1}/5 ✓`);
  }
  await browser.close();

  // Monta vídeo com 10 clips + xfade entre todos
  console.log('Montando vídeo com 10 imagens...');
  const transicao   = 0.6;
  const duracaoTotal = duracoes.reduce((s,d) => s+d, 0) - (frames.length - 1) * transicao;

  const offsets = [];
  let acum = 0;
  for (let i = 0; i < frames.length - 1; i++) {
    acum += duracoes[i] - transicao;
    offsets.push(acum.toFixed(2));
  }

  // Transição suave dentro da cena (fade), mais viva entre cenas (slideleft/slideright)
  const tipoTransicao = (i) => {
    const dentroMesmaCena = i % 2 === 0; // índices 0,2,4,6,8 = A→B da mesma cena
    return dentroMesmaCena ? 'fade' : 'slideleft';
  };

  const scaleParts = frames.map((_, i) => `[${i}:v]scale=1080:1920,fps=${FPS},setsar=1[v${i}]`);
  let xfadeParts = [], prev = 'v0';
  for (let i = 1; i < frames.length; i++) {
    const out = i < frames.length - 1 ? `x${i}` : 'vout';
    xfadeParts.push(`[${prev}][v${i}]xfade=transition=${tipoTransicao(i-1)}:duration=${transicao}:offset=${offsets[i-1]}[${out}]`);
    prev = out;
  }

  const musicaPath = path.join(__dirname, '..', 'assets', 'audio-loop.mp3');
  const fadeOut    = Math.max(0, duracaoTotal - 2.5).toFixed(2);
  const videoInputs = frames.map((f, i) => `-loop 1 -t ${duracoes[i]} -i "${f}"`).join(' ');
  const filterAll  = [
    ...scaleParts, ...xfadeParts,
    `[${frames.length}:a]volume=0.18,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=2.5[aout]`,
  ].join(';');

  const outPath = path.join(dir, 'opcao3-10imagens.mp4');
  const cmd = `ffmpeg -y ${videoInputs} -i "${musicaPath}" -filter_complex "${filterAll}" -map "[vout]" -map "[aout]" -c:v libx264 -pix_fmt yuv420p -preset fast -c:a aac -b:a 128k -t ${duracaoTotal.toFixed(2)} "${outPath}"`;
  execSync(cmd, { stdio: 'pipe' });

  console.log(`\n✓ Reel com 10 imagens pronto:\n  ${outPath}`);
  console.log(`  Duração: ~${Math.round(duracaoTotal)}s | Imagens: ${frames.length}\n`);
  try { execSync(`open "${outPath}"`); } catch(_) {}
}

main().catch(err => { console.error('[Erro]', err.message); process.exit(1); });
