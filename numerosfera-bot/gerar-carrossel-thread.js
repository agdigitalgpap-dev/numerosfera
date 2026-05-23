/**
 * Gerador de Carrossel Thread — Numerosfera
 * Formato viral: narrativa em parágrafos curtos, história que prende
 * Inspirado no estilo @danielrdriguess — adaptado para numerologia
 *
 * Uso:
 *   node gerar-carrossel-thread.js          ← usa tema viral do dia
 *   node gerar-carrossel-thread.js financas ← dor específica
 */

require('dotenv').config();
const puppeteer = require('puppeteer');
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs   = require('fs');
const path = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const LEONARDO_KEY   = process.env.LEONARDO_API_KEY;
const LEONARDO_MODEL = 'de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3';

const ARG = (process.argv[2] || '').toLowerCase().trim();

function lerBriefDia() {
  const p = path.join(__dirname, 'brief-do-dia.json');
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(_) {} }
  return {};
}
const BRIEF     = lerBriefDia();
const TEM_CTA   = (BRIEF.cta_formato === 'carrossel') || !BRIEF.cta_formato;
const ENCERRM   = BRIEF.encerramento || 'Salve este post para não esquecer.';

// ── Busca tema viral (igual ao auto-carrossel.js)
async function buscarTemaViral() {
  if (!process.env.SERPER_API_KEY) return null;
  try {
    const res = await axios.post('https://google.serper.dev/news', {
      q: 'mais buscado Brasil hoje', gl: 'br', hl: 'pt-br', num: 8,
    }, {
      headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    const noticias = (res.data.news || []).slice(0, 6).map(r => r.title).join(' | ');
    return noticias || null;
  } catch (_) { return null; }
}

// ── Gera o roteiro da thread via Claude
async function gerarThread(arg) {
  let contextoViral = '';
  let instrucao = '';

  if (!arg) {
    const viral = await buscarTemaViral();
    if (viral) {
      contextoViral = viral;
      instrucao = `Use um desses assuntos virais do Brasil HOJE como gancho da história: "${viral}"
Conecte o assunto ao tema de numerologia (bloqueio energético, mapa numerológico, destino).
Exemplos de como conectar: notícia de celebridade → número pessoal dela explica algo; fato viral → a numerologia por trás disso.`;
    } else {
      instrucao = `Crie uma história envolvente sobre como a numerologia explica padrões da vida (finanças, amor, família ou saúde).`;
    }
  } else {
    const dorDesc = {
      'financas':     'dinheiro que some, dívidas que voltam, prosperidade bloqueada',
      'familia':      'brigas sem fim, filhos afastados, casa sem harmonia',
      'saude':        'cansaço constante, sintomas sem explicação, vitalidade bloqueada',
      'vida-amorosa': 'sempre as pessoas erradas, solidão, o eterno quase',
    }[arg] || arg;
    instrucao = `Crie uma história envolvente sobre: "${dorDesc}"`;
  }

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: `Você é copywriter da Numerosfera (numerologia/astrologia hermética).
Público: mulheres brasileiras 25-50 anos. Tom: direto, revelador, como se fosse um segredo sendo exposto.

${instrucao}

Formato: CARROSSEL THREAD — parágrafos curtos e impactantes, como uma thread do Twitter/X que vai revelando aos poucos.
Cada slide tem 2-4 frases curtas. Linguagem acessível mas mística. Cria suspense entre slides.

Estrutura:
- Slide 1 (HOOK): afirmação provocadora que para o scroll. Máx 3 frases curtas. Termina com "..." ou gancho para continuar.
- Slides 2-4 (HISTÓRIA): desenvolve a revelação passo a passo. Cada slide avança. Cita o "bloqueio energético" e o "mapa numerológico" naturalmente.
- Slide 5 (VIRADA): a solução existe. O mapa revela e o ritual remove o bloqueio. Máx 3 frases.
- Slide 6 (ENCERRAMENTO): ${ TEM_CTA ? '2 frases + Comente MAPA e te envio seu mapa numerológico grátis no direct.' : 'conclusão reflexiva. Última frase: ' + ENCERRM }

Distribuição de imagens (padrão: slides ímpares têm imagem, pares são texto puro):
- Slide 1: texto + imagem → gere "image_prompt"
- Slide 2: só texto
- Slide 3: texto + imagem → gere "image_prompt"
- Slide 4: só texto
- Slide 5: texto + imagem → gere "image_prompt"
- Slide 6: texto + imagem → gere "image_prompt"

Os image_prompts devem ser variados mas com estética coerente: dark mystical, gold tones, sacred geometry, no people, no text.
Também gere uma legenda para o Instagram (até 120 palavras + hashtags).

Retorne SOMENTE JSON:
{
  "slides": [
    { "num": 1, "texto": "...", "image_prompt": "..." },
    { "num": 2, "texto": "..." },
    { "num": 3, "texto": "...", "image_prompt": "..." },
    { "num": 4, "texto": "..." },
    { "num": 5, "texto": "...", "image_prompt": "..." },
    { "num": 6, "texto": "...", "image_prompt": "..." }
  ],
  "legenda": "...",
  "tema_slug": "tema-em-ate-5-palavras-com-hifen"
}`,
    }],
  });

  const match = msg.content[0].text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude não retornou JSON válido');
  return JSON.parse(match[0]);
}

// ── Gera imagem Leonardo para o slide 1
async function gerarImagem(prompt, outputPath) {
  const genRes = await axios.post(
    'https://cloud.leonardo.ai/api/rest/v1/generations',
    {
      modelId: LEONARDO_MODEL,
      prompt: prompt + ', square 1:1, cinematic, no text, no watermark',
      negative_prompt: 'people, faces, hands, text, watermark, blur, low quality',
      width: 1024, height: 1024,
      num_images: 1,
      guidance_scale: 7,
      alchemy: false,
    },
    { headers: { Authorization: `Bearer ${LEONARDO_KEY}`, 'Content-Type': 'application/json' } }
  );
  const id = genRes.data?.sdGenerationJob?.generationId;
  if (!id) throw new Error('Leonardo: sem generationId');

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const poll = await axios.get(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${id}`,
      { headers: { Authorization: `Bearer ${LEONARDO_KEY}` } }
    );
    const gen = poll.data?.generations_by_pk;
    if (gen?.status === 'COMPLETE' && gen.generated_images?.length > 0) {
      const imgRes = await axios.get(gen.generated_images[0].url, { responseType: 'arraybuffer' });
      fs.writeFileSync(outputPath, Buffer.from(imgRes.data));
      return;
    }
  }
  throw new Error('Leonardo: timeout');
}

// ── Gera HTML do slide (estilo thread limpo)
function gerarHtmlSlide(slide, total, imagePath) {
  const isLast   = slide.num === total;
  const temImagem = imagePath && fs.existsSync(imagePath);

  const paragrafos = slide.texto
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p class="paragrafo">${p}</p>`)
    .join('');

  let imagemHtml = '';
  if (temImagem) {
    const b64 = fs.readFileSync(imagePath).toString('base64');
    imagemHtml = `<div class="img-wrap"><img src="data:image/jpeg;base64,${b64}" /></div>`;
  }

  // Tamanho do texto: menor quando tem imagem (menos espaço)
  const fontSize = temImagem ? '38px' : '46px';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:1080px; height:1080px; background:#09080f;
    font-family:'Georgia',serif; color:#ece6d8; overflow:hidden;
    display:flex; align-items:center; justify-content:center;
  }
  .slide {
    width:1080px; height:1080px; position:relative;
    display:flex; flex-direction:column;
    justify-content:${temImagem ? 'flex-start' : 'center'};
    padding:${temImagem ? '56px 72px 0' : '72px'};
  }
  .slide::before {
    content:''; position:absolute; inset:0;
    background:radial-gradient(ellipse at 50% 40%, rgba(184,146,42,0.05) 0%, transparent 65%);
    pointer-events:none;
  }

  /* Header */
  .header {
    display:flex; justify-content:space-between; align-items:center;
    margin-bottom:${temImagem ? '32px' : '0'};
    ${!temImagem ? 'position:absolute; top:52px; left:72px; right:72px;' : ''}
  }
  .logo    { font-size:11px; letter-spacing:5px; text-transform:uppercase; color:rgba(196,164,72,0.5); }
  .counter { font-size:11px; letter-spacing:3px; color:rgba(196,164,72,0.3); }

  /* Texto */
  .textos {
    position:relative; z-index:1; flex:1;
    display:flex; flex-direction:column; justify-content:center;
    overflow:hidden;
    ${!temImagem && !isLast ? 'border-left:2px solid rgba(196,164,72,0.2); padding-left:36px;' : ''}
  }
  .paragrafo {
    font-size:${fontSize}; line-height:1.5;
    color:rgba(232,220,195,0.9);
    margin-bottom:24px; letter-spacing:0.2px;
  }
  .paragrafo:last-child { margin-bottom:0; }
  ${isLast ? `.paragrafo:last-child { color:#D4A84B; font-style:italic; font-size:36px; margin-top:10px; }` : ''}

  /* Imagem */
  .img-wrap {
    width:100%; height:400px; overflow:hidden;
    border-radius:6px; border:1px solid rgba(196,164,72,0.12);
    flex-shrink:0; margin-top:auto;
    background:#09080f;
  }
  .img-wrap img { width:100%; height:100%; object-fit:contain; object-position:center; }

  /* Seta de arrastar — presente em TODOS os slides exceto o último */
  .swipe {
    position:absolute; bottom:44px; right:64px;
    display:flex; align-items:center; gap:10px;
    font-size:13px; letter-spacing:3px; text-transform:uppercase;
    color:rgba(196,164,72,0.80);
  }
  .swipe-arrow { font-size:26px; color:rgba(196,164,72,0.90); }

  /* CTA no último slide */
  .footer-cta {
    position:absolute; bottom:44px; left:72px; right:72px;
    display:flex; align-items:center; justify-content:space-between;
  }
  .cta-tag   { font-size:12px; letter-spacing:4px; text-transform:uppercase; color:rgba(196,164,72,0.55); }
  .cta-star  { font-size:20px; color:rgba(196,164,72,0.5); }
</style></head>
<body><div class="slide">

  <div class="header">
    <span class="logo">Numerosfera</span>
    <span class="counter">${String(slide.num).padStart(2,'0')} / ${String(total).padStart(2,'0')}</span>
  </div>

  <div class="textos">${paragrafos}</div>

  ${imagemHtml}

  ${!isLast
    ? `<div class="swipe"><span>arraste</span><span class="swipe-arrow">›</span></div>`
    : TEM_CTA ? `<div class="footer-cta"><span class="cta-tag">Teste Gratuito</span><span class="cta-star">✦</span></div>` : `<div class="footer-cta"><span class="cta-tag">${ENCERRM.slice(0,40)}</span></div>`
  }

</div></body></html>`;
}

// ── Principal
async function main() {
  console.log('\n[Carrossel Thread] Gerando...\n');

  // 1. Gera conteúdo
  console.log('Gerando narrativa com Claude...');
  const dados = await gerarThread(ARG);
  console.log(`  Tema: ${dados.tema_slug}`);

  // 2. Pasta de output
  const data = new Date().toISOString().slice(0, 10);
  const dir  = path.join(__dirname, 'carrosseis', `${data}_thread_${dados.tema_slug}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'legenda.txt'), dados.legenda);

  // 3. Imagens Leonardo para slides com image_prompt (1, 3, 5, 6)
  const imagePaths = {};
  if (LEONARDO_KEY) {
    for (let idx = 0; idx < dados.slides.length; idx++) {
      const slide = dados.slides[idx];
      if (!slide?.image_prompt) continue;
      process.stdout.write(`Gerando imagem slide ${idx + 1}... `);
      const imgPath = path.join(dir, `img-slide${idx + 1}.jpg`);
      try {
        await gerarImagem(slide.image_prompt, imgPath);
        imagePaths[idx] = imgPath;
        console.log('✓');
      } catch (e) {
        console.log(`falhou: ${e.message}`);
      }
    }
  }

  // 4. Renderiza slides
  console.log('Renderizando slides...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  for (let i = 0; i < dados.slides.length; i++) {
    const slide  = dados.slides[i];
    const img    = imagePaths[i] || null;
    const html   = gerarHtmlSlide(slide, dados.slides.length, img);
    const outPath = path.join(dir, `slide-${String(i+1).padStart(2,'0')}.png`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outPath, type: 'png' });
    await page.close();
    console.log(`  ✓ Slide ${i+1}/${dados.slides.length}`);
  }

  await browser.close();

  console.log(`\n✓ Carrossel thread pronto:\n  ${dir}\n`);
  try { require('child_process').execSync(`open "${dir}"`); } catch(_) {}
}

main().catch(err => { console.error('[Erro]', err.message); process.exit(1); });
