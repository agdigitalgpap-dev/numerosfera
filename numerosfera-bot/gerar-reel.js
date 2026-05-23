/**
 * Gerador de Reel — Numerosfera
 *
 * Uso:
 *   node gerar-reel.js "financas"       ← dor específica
 *   node gerar-reel.js "familia"
 *   node gerar-reel.js "saude"
 *   node gerar-reel.js "vida-amorosa"
 *   node gerar-reel.js                  ← tema livre / viral
 *
 * Output: reels/YYYY-MM-DD_slug/reel.mp4
 */

require('dotenv').config();
const { execSync, spawnSync } = require('child_process');
const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const ARG    = (process.argv[2] || '').toLowerCase().trim();

// ── Contexto real do produto (conecta posts às dores do quiz)
const PRODUTO_CONTEXTO = `
Produto: Numerosfera — leitura de mapa numerológico personalizada (gratuita via quiz)
Premissa central: a pessoa nasceu com potencial mas existe um BLOQUEIO ENERGÉTICO no mapa dela
que impede o dinheiro/amor/saúde/família de fluir como deveria.
O quiz identifica a dor principal e o áudio personalizado revela o bloqueio e como removê-lo.

Dores e sintomas do produto:

FINANÇAS: Conta no vermelho mesmo com renda, sensação de que o dinheiro some sem explicação,
planos financeiros que nunca saem do papel, dívida que quita e outra aparece, angústia ao olhar o saldo.

FAMÍLIA: Brigas que começam do nada e nunca têm fim, filhos que se afastam sem motivo aparente,
sensação de ser estranho dentro da própria casa, amor que existe mas não consegue ser dito,
família se desfazendo mesmo tentando segurar tudo.

SAÚDE: Cansaço constante, sintomas que vão e voltam, tratamentos que não resolvem,
dores sem explicação, sensação de nunca estar totalmente bem.

VIDA AMOROSA: Sempre as pessoas erradas, relacionamentos que não evoluem,
solidão mesmo cercado de gente, o eterno "quase", sensação de ser invisível romanticamente.

Linguagem da marca: místico, elegante, sofisticado. Nunca piegas. Usa metáfora do "vidro sujo"
(bloqueio que impede a luz de entrar). Fala diretamente com a pessoa (você).
Público: mulheres brasileiras, 25-50 anos, espiritualidade e autoconhecimento.
`;

const DORES_MAP = {
  'financas':     'finanças — dinheiro que some, dívidas e bloqueio de prosperidade',
  'familia':      'família — brigas, filhos afastados, harmonia que não chega',
  'saude':        'saúde — cansaço constante, sintomas sem explicação e bloqueio energético',
  'vida-amorosa': 'vida amorosa — pessoas erradas, relacionamentos que não evoluem, solidão',
};

// ── Gera cenas do Reel via Claude
async function gerarCenas(dor) {
  const temaDesc = DORES_MAP[dor] || dor || 'bloqueio energético que impede a vida de fluir';

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `${PRODUTO_CONTEXTO}

Crie um Reel de Instagram de 5 cenas sobre: "${temaDesc}"

Regras:
- Cena 1 (HOOK): frase de 4-6 palavras que paralisa o scroll. Impacto máximo. Sem corpo.
- Cenas 2-4 (REVELAÇÃO): cada uma com título curto + insight de até 18 palavras que toca a dor e apresenta o bloqueio. Conecta com os sintomas reais listados acima.
- Cena 5 (CTA): fixo como abaixo.

Retorne SOMENTE este JSON:
{
  "cenas": [
    { "tipo": "hook",      "eyebrow": "Numerosfera revela", "titulo": "...", "corpo": "" },
    { "tipo": "revelacao", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "revelacao", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "revelacao", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "cta",       "eyebrow": "Teste Gratuito", "titulo": "Comente MAPA aqui embaixo", "corpo": "Vou te enviar seu teste de numerologia gratuito no direct 🔮" }
  ],
  "tema_final": "tema resumido em até 5 palavras"
}`,
    }],
  });

  const match = msg.content[0].text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude não retornou JSON válido');
  return JSON.parse(match[0]);
}

// ── Renderiza frame vertical 1080×1920
async function renderizarFrame(browser, cena, index, total, outputPath) {
  const templatePath = path.join(__dirname, 'carrosseis', 'template-reel.html');
  const html = fs.readFileSync(templatePath, 'utf-8');

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });

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

    // Rodapé em todas as cenas exceto CTA
    const footer = document.getElementById('footerCta');
    if (!isCta) {
      footer.textContent = 'Comente MAPA para receber seu teste grátis';
    } else {
      footer.textContent = '';
    }
  }, cena, index, total);

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
  console.log(`  ✓ Frame ${index}/${total}`);
}

// ── Duração por tipo de cena
const DURACAO_POR_TIPO = {
  hook:      5.0,   // só título grande — leitura rápida
  revelacao: 9.0,   // título + corpo longo — tempo para absorver
  cta:       7.0,   // CTA fixo
};

// ── Monta vídeo com ffmpeg (fade entre frames + áudio loop místico)
function montarVideo(frames, cenas, outputPath) {
  const n         = frames.length;
  const transicao = 1.0;

  // Duração por frame baseada no tipo de cena
  const duracoes = cenas.map(c => DURACAO_POR_TIPO[c.tipo] || 7.0);

  // Calcula offsets cumulativos para xfade
  const offsets = [];
  let acumulado = 0;
  for (let i = 0; i < n - 1; i++) {
    acumulado += duracoes[i] - transicao;
    offsets.push(acumulado.toFixed(2));
  }

  const duracaoTotal = duracoes.reduce((s, d) => s + d, 0) - (n - 1) * transicao;

  // Áudio: prioridade → musica-fundo.mp3 → audio-loop.mp3 do projeto
  const musicaCustom = path.join(__dirname, 'musica-fundo.mp3');
  const musicaLoop   = path.join(__dirname, '..', 'assets', 'audio-loop.mp3');
  let musicaPath;

  if (fs.existsSync(musicaCustom)) {
    musicaPath = musicaCustom;
    console.log('  Usando música: musica-fundo.mp3');
  } else if (fs.existsSync(musicaLoop)) {
    musicaPath = musicaLoop;
    console.log('  Usando música: audio-loop.mp3');
  } else {
    musicaPath = null;
    console.log('  Sem música de fundo (coloque musica-fundo.mp3 na pasta para adicionar)');
  }

  // filter_complex: escala cada frame na duração certa + xfade
  const scaleParts = frames.map((_, i) =>
    `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`
  );

  let xfadeParts = [];
  let prev = 'v0';
  for (let i = 1; i < n; i++) {
    const out = i < n - 1 ? `x${i}` : 'vout';
    xfadeParts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${transicao}:offset=${offsets[i-1]}[${out}]`);
    prev = out;
  }

  const filterComplex = [...scaleParts, ...xfadeParts].join(';');

  // Inputs de vídeo (cada um com sua duração)
  const videoInputs = frames.map((f, i) => `-loop 1 -t ${duracoes[i]} -i "${f}"`).join(' ');

  let cmd;
  if (musicaPath) {
    const fadeOut = Math.max(0, duracaoTotal - 2.5).toFixed(2);
    cmd = [
      'ffmpeg -y',
      videoInputs,
      `-i "${musicaPath}"`,
      `-filter_complex "${filterComplex};[${n}:a]volume=0.18,afade=t=in:st=0:d=2,afade=t=out:st=${fadeOut}:d=2.5[aout]"`,
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
      `-filter_complex "${filterComplex}"`,
      `-map "[vout]"`,
      `-c:v libx264 -pix_fmt yuv420p -preset fast`,
      `-t ${duracaoTotal.toFixed(2)}`,
      `"${outputPath}"`,
    ].join(' ');
  }

  console.log('  Montando vídeo...');
  execSync(cmd, { stdio: 'pipe' });
  console.log(`  Duração: ~${Math.round(duracaoTotal)}s`);
}

// ── Principal
async function main() {
  const dor = ARG || 'financas';

  console.log(`\n[Reel] Dor: "${dor}"\n`);

  // 1. Gera cenas via Claude
  console.log('Gerando cenas com Claude...');
  const dados = await gerarCenas(dor);

  // 2. Cria pasta
  const data = new Date().toISOString().slice(0, 10);
  const slug = dados.tema_final.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const dir  = path.join(__dirname, 'reels', `${data}_${slug}`);
  fs.mkdirSync(dir, { recursive: true });

  // 3. Renderiza frames
  console.log('Renderizando frames...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const frames = [];
  for (let i = 0; i < dados.cenas.length; i++) {
    const framePath = path.join(dir, `frame-${String(i+1).padStart(2,'0')}.png`);
    await renderizarFrame(browser, dados.cenas[i], i + 1, dados.cenas.length, framePath);
    frames.push(framePath);
  }

  await browser.close();

  // 4. Monta vídeo
  const videoPath = path.join(dir, 'reel.mp4');
  montarVideo(frames, dados.cenas, videoPath);

  console.log(`\n✓ Reel pronto:\n  ${videoPath}\n`);
  console.log('Dica: para música personalizada, coloque um arquivo "musica-fundo.mp3" na pasta numerosfera-bot/\n');

  try { execSync(`open "${dir}"`); } catch (_) {}
}

main().catch(err => {
  console.error('[Erro]', err.message);
  process.exit(1);
});
