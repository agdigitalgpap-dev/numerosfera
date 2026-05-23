/**
 * Gerador de Reel Animado — Numerosfera
 * Leonardo AI (backgrounds) + Puppeteer (texto) + ffmpeg (animação Ken Burns + áudio)
 *
 * Uso:
 *   node gerar-reel-animado.js financas
 *   node gerar-reel-animado.js familia
 *   node gerar-reel-animado.js saude
 *   node gerar-reel-animado.js vida-amorosa
 *
 * Output: reels/YYYY-MM-DD_slug/reel-animado.mp4
 */

require('dotenv').config();
const { execSync } = require('child_process');
const puppeteer    = require('puppeteer');
const Anthropic    = require('@anthropic-ai/sdk');
const axios        = require('axios');
const fs           = require('fs');
const path         = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ARG    = (process.argv[2] || 'financas').toLowerCase().trim();

const LEONARDO_KEY   = process.env.LEONARDO_API_KEY;
const LEONARDO_MODEL = 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3'; // Phoenix 1.0

const DURACAO_POR_TIPO = { hook: 5, revelacao: 9, cta: 7 };
const FPS = 30;

const PRODUTO_CONTEXTO = `
Produto: Numerosfera — leitura de mapa numerológico personalizada (gratuita via quiz)
Premissa: a pessoa nasceu com potencial mas existe um BLOQUEIO ENERGÉTICO no mapa dela.
Dores do quiz: finanças, família, saúde, vida amorosa.
Sintomas:
- FINANÇAS: dinheiro some, dívidas, planos que não saem do papel
- FAMÍLIA: brigas sem fim, filhos afastados, amor que não consegue ser dito
- SAÚDE: cansaço constante, sintomas sem explicação, tratamentos que não resolvem
- VIDA AMOROSA: sempre as pessoas erradas, solidão, o eterno "quase"
Tom: místico, elegante, sofisticado. Público: mulheres brasileiras 25-50 anos.
`;

const DORES_MAP = {
  'financas':     'finanças — dinheiro que some, dívidas e bloqueio de prosperidade',
  'familia':      'família — brigas, filhos afastados, harmonia que não chega',
  'saude':        'saúde — cansaço constante, sintomas sem explicação e bloqueio energético',
  'vida-amorosa': 'vida amorosa — pessoas erradas, relacionamentos que não evoluem, solidão',
};

// ── Gera cenas + prompts de imagem via Claude
async function gerarCenas(dor) {
  const temaDesc = DORES_MAP[dor] || dor;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: `${PRODUTO_CONTEXTO}

Crie um Reel de Instagram de 5 cenas sobre: "${temaDesc}"

Regras de texto:
- Cena 1 (HOOK): título de 4-6 palavras, impacto máximo. Sem corpo.
- Cenas 2-4 (REVELAÇÃO): título curto + corpo até 18 palavras tocando a dor real.
- Cena 5 (CTA): fixo como abaixo.

Para cada cena, crie também um "image_prompt" em inglês para o Leonardo AI gerar um background místico/hermético.
O background deve ser dark, com paleta dourada/púrpura, atmosférico. Estilo: cinematic, ethereal, sacred geometry, dark mystical.
Nunca inclua rostos ou pessoas. Foque em: nebulosas, geometria sagrada, cristais, luz dourada, mandalas, cosmos.

Retorne SOMENTE este JSON:
{
  "cenas": [
    { "tipo": "hook",      "eyebrow": "Numerosfera revela", "titulo": "...", "corpo": "", "image_prompt": "dark mystical background, golden light rays, sacred geometry, deep space nebula, cinematic, no people" },
    { "tipo": "revelacao", "eyebrow": "...", "titulo": "...", "corpo": "...", "image_prompt": "..." },
    { "tipo": "revelacao", "eyebrow": "...", "titulo": "...", "corpo": "...", "image_prompt": "..." },
    { "tipo": "revelacao", "eyebrow": "...", "titulo": "...", "corpo": "...", "image_prompt": "..." },
    { "tipo": "cta",       "eyebrow": "Teste Gratuito", "titulo": "Comente MAPA aqui embaixo", "corpo": "Vou te enviar seu teste de numerologia gratuito no direct 🔮", "image_prompt": "golden mandala, sacred geometry, dark background, mystical portal, divine light, no people" }
  ],
  "tema_final": "tema em até 5 palavras"
}`,
    }],
  });

  const match = msg.content[0].text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude não retornou JSON válido');
  return JSON.parse(match[0]);
}

// ── Gera imagem via Leonardo AI e faz download
async function gerarImagemLeonardo(prompt, outputPath) {
  // 1. Dispara geração
  const genRes = await axios.post(
    'https://cloud.leonardo.ai/api/rest/v1/generations',
    {
      modelId: LEONARDO_MODEL,
      prompt: prompt + ', vertical portrait 9:16, no text, no watermark',
      negative_prompt: 'people, faces, hands, text, watermark, blur, low quality',
      width: 832,
      height: 1472,
      num_images: 1,
      guidance_scale: 7,
      photoReal: false,
      alchemy: true,
    },
    { headers: { Authorization: `Bearer ${LEONARDO_KEY}`, 'Content-Type': 'application/json' } }
  );

  const generationId = genRes.data?.sdGenerationJob?.generationId;
  if (!generationId) throw new Error('Leonardo não retornou generationId');

  // 2. Aguarda conclusão (polling a cada 3s)
  let imageUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await axios.get(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      { headers: { Authorization: `Bearer ${LEONARDO_KEY}` } }
    );
    const gen = pollRes.data?.generations_by_pk;
    if (gen?.status === 'COMPLETE' && gen.generated_images?.length > 0) {
      imageUrl = gen.generated_images[0].url;
      break;
    }
  }
  if (!imageUrl) throw new Error('Leonardo não completou a geração a tempo');

  // 3. Download da imagem
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(outputPath, Buffer.from(imgRes.data));
}

// ── Renderiza frame: Leonardo background + texto por cima
async function renderizarFrame(browser, cena, imagePath, index, total, outputPath) {
  const templatePath = path.join(__dirname, 'carrosseis', 'template-reel.html');
  let html = fs.readFileSync(templatePath, 'utf-8');

  // Injeta o background como base64 diretamente no HTML
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const bgStyle = `
    background-image: url(data:image/jpeg;base64,${imageBase64});
    background-size: cover;
    background-position: center;
  `;

  // Adiciona overlay escuro para legibilidade do texto
  html = html.replace(
    '.slide::before {',
    `.slide { ${bgStyle} }
    .slide-overlay {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(8,8,16,0.55) 0%, rgba(8,8,16,0.45) 50%, rgba(8,8,16,0.65) 100%);
      pointer-events: none; z-index: 0;
    }
    .slide::before {`
  );

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

  // Adiciona overlay div
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.className = 'slide-overlay';
    document.getElementById('slide').prepend(overlay);
  });

  await page.evaluate((c, idx, tot) => {
    document.getElementById('sceneNum').textContent =
      `${String(idx).padStart(2,'0')} / ${String(tot).padStart(2,'0')}`;

    const isCta  = c.tipo === 'cta';
    const isHook = c.tipo === 'hook';

    document.getElementById('conteudo').innerHTML = `
      ${c.eyebrow ? `<p class="eyebrow">${c.eyebrow}</p>` : ''}
      <div class="divider"></div>
      ${c.titulo ? `<h2 class="titulo ${isHook ? 'titulo-grande' : ''}">${c.titulo}</h2>` : ''}
      ${c.corpo   ? `<p class="corpo">${c.corpo}</p>` : ''}
      ${isCta     ? `<div class="line"></div><div class="cta-box">Comente MAPA aqui ↓</div>` : ''}
    `;

    const footer = document.getElementById('footerCta');
    if (!isCta) {
      footer.textContent = 'Comente MAPA para receber seu teste grátis';
    } else {
      footer.textContent = '';
    }
  }, cena, index, total);

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
}

// ── Monta vídeo animado com Ken Burns + xfade + áudio
function montarVideoAnimado(frames, cenas, outputPath) {
  const n         = frames.length;
  const transicao = 1.0;
  const duracoes  = cenas.map(c => DURACAO_POR_TIPO[c.tipo] || 7);

  // Calcula offsets xfade
  const offsets = [];
  let acum = 0;
  for (let i = 0; i < n - 1; i++) {
    acum += duracoes[i] - transicao;
    offsets.push(acum.toFixed(2));
  }

  const duracaoTotal = duracoes.reduce((s, d) => s + d, 0) - (n - 1) * transicao;

  // Áudio
  const musicaLoop = path.join(__dirname, '..', 'assets', 'audio-loop.mp3');
  const musicaCustom = path.join(__dirname, 'musica-fundo.mp3');
  const musicaPath = fs.existsSync(musicaCustom) ? musicaCustom
                   : fs.existsSync(musicaLoop)   ? musicaLoop
                   : null;

  // Ken Burns: 4 variações de movimento (zoom + pan direcional)
  const movimentos = [
    // zoom-in + pan direita
    (d) => `z='min(zoom+0.0022,1.5)':x='iw/2-(iw/zoom/2)+(on*0.4)':y='ih/2-(ih/zoom/2)'`,
    // zoom-out + pan esquerda
    (d) => `z='if(eq(on\\,1)\\,1.5\\,max(zoom-0.0022\\,1.0))':x='iw/2-(iw/zoom/2)-(on*0.4)':y='ih/2-(ih/zoom/2)'`,
    // zoom-in + pan cima
    (d) => `z='min(zoom+0.0022,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-(on*0.3)'`,
    // zoom-out + pan baixo
    (d) => `z='if(eq(on\\,1)\\,1.5\\,max(zoom-0.0022\\,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+(on*0.3)'`,
    // zoom-in puro (CTA — centralizado)
    (d) => `z='min(zoom+0.0018,1.35)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
  ];

  const zoomParts = frames.map((_, i) => {
    const d  = duracoes[i] * FPS;
    const mv = movimentos[i % movimentos.length](d);
    return `[${i}:v]zoompan=${mv}:d=${d}:s=1080x1920:fps=${FPS},setsar=1[v${i}]`;
  });

  // xfade chain
  let xfadeParts = [];
  let prev = 'v0';
  for (let i = 1; i < n; i++) {
    const out = i < n - 1 ? `x${i}` : 'vout';
    xfadeParts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${transicao}:offset=${offsets[i-1]}[${out}]`);
    prev = out;
  }

  const videoInputs = frames.map((f, i) => `-loop 1 -t ${duracoes[i]} -i "${f}"`).join(' ');
  const filterParts = [...zoomParts, ...xfadeParts];

  let cmd;
  if (musicaPath) {
    const fadeOut = Math.max(0, duracaoTotal - 2.5).toFixed(2);
    filterParts.push(`[${n}:a]volume=0.18,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=2.5[aout]`);
    cmd = [
      'ffmpeg -y',
      videoInputs,
      `-i "${musicaPath}"`,
      `-filter_complex "${filterParts.join(';')}"`,
      `-map "[vout]" -map "[aout]"`,
      `-c:v libx264 -pix_fmt yuv420p -preset fast`,
      `-c:a aac -b:a 128k`,
      `-t ${duracaoTotal.toFixed(2)}`,
      `"${outputPath}"`,
    ].join(' ');
  } else {
    cmd = [
      'ffmpeg -y',
      videoInputs,
      `-filter_complex "${filterParts.join(';')}"`,
      `-map "[vout]"`,
      `-c:v libx264 -pix_fmt yuv420p -preset fast`,
      `-t ${duracaoTotal.toFixed(2)}`,
      `"${outputPath}"`,
    ].join(' ');
  }

  console.log(`  Montando vídeo animado (~${Math.round(duracaoTotal)}s)...`);
  execSync(cmd, { stdio: 'pipe' });
}

// ── Principal
async function main() {
  const dor = ARG;
  console.log(`\n[Reel Animado] Dor: "${dor}"\n`);

  // 1. Gera textos e prompts de imagem via Claude
  console.log('1/4 Gerando cenas com Claude...');
  const dados = await gerarCenas(dor);

  // 2. Cria pasta
  const data = new Date().toISOString().slice(0, 10);
  const slug = dados.tema_final.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const dir  = path.join(__dirname, 'reels', `${data}_animado_${slug}`);
  fs.mkdirSync(dir, { recursive: true });

  // 3. Gera imagens com Leonardo AI
  console.log('2/4 Gerando backgrounds com Leonardo AI...');
  const imagePaths = [];
  for (let i = 0; i < dados.cenas.length; i++) {
    const imgPath = path.join(dir, `bg-${String(i+1).padStart(2,'0')}.jpg`);
    process.stdout.write(`  Imagem ${i+1}/${dados.cenas.length}... `);
    await gerarImagemLeonardo(dados.cenas[i].image_prompt, imgPath);
    imagePaths.push(imgPath);
    console.log('✓');
  }

  // 4. Renderiza frames com texto
  console.log('3/4 Renderizando frames com texto...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const frames = [];
  for (let i = 0; i < dados.cenas.length; i++) {
    const framePath = path.join(dir, `frame-${String(i+1).padStart(2,'0')}.png`);
    await renderizarFrame(browser, dados.cenas[i], imagePaths[i], i + 1, dados.cenas.length, framePath);
    frames.push(framePath);
    console.log(`  Frame ${i+1}/${dados.cenas.length} ✓`);
  }
  await browser.close();

  // 5. Monta vídeo animado
  console.log('4/4 Aplicando animação Ken Burns e montando vídeo...');
  const videoPath = path.join(dir, 'reel-animado.mp4');
  montarVideoAnimado(frames, dados.cenas, videoPath);

  console.log(`\n✓ Reel animado pronto:\n  ${videoPath}\n`);
  try { execSync(`open "${dir}"`); } catch (_) {}
}

main().catch(err => {
  console.error('[Erro]', err.message);
  process.exit(1);
});
