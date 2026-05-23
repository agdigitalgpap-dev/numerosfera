/**
 * Gerador de Carrossel — Numerosfera
 *
 * Uso:
 *   node gerar-carrossel.js "Tema do carrossel aqui"
 *
 * Exemplo:
 *   node gerar-carrossel.js "O que seu número de destino revela sobre 2025"
 *
 * Output: pasta carrosseis/YYYY-MM-DD_tema/slide-01.png ... slide-0N.png
 */

require('dotenv').config();
const puppeteer  = require('puppeteer');
const Anthropic  = require('@anthropic-ai/sdk');
const fs         = require('fs');
const path       = require('path');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEMA = process.argv[2] || 'Numerologia e autoconhecimento';

function lerBriefDia() {
  const p = path.join(__dirname, 'brief-do-dia.json');
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(_) {} }
  return {};
}
const _brief  = lerBriefDia();
const TEM_CTA = (_brief.cta_formato === 'carrossel') || !_brief.cta_formato;
const ENCERRM = _brief.encerramento || 'Salve este post para não esquecer.';

async function gerarTextoSlides(tema) {
  const prompt = `Você é copywriter da Numerosfera — marca de astrologia hermética e numerologia.
Público: mulheres brasileiras, 25-50 anos, espiritualidade e autoconhecimento.
Tom: místico, elegante, sofisticado. Nunca piegas.

Crie um carrossel de Instagram de 6 slides sobre: "${tema}"

Regras:
- Slide 1 (CAPA): título impactante que para o scroll. Máx 8 palavras. Sem corpo.
- Slides 2-5 (CORPO): cada um com um insight/ensinamento curto e poderoso. Máx 35 palavras cada.
- Slide 6 (ENCERRAMENTO): ${TEM_CTA
  ? 'eyebrow "Teste Gratuito", titulo "Comente MAPA aqui embaixo", corpo "Vou te enviar seu teste de numerologia gratuito no direct"'
  : 'reflexão final poderosa. Corpo final obrigatório: ' + ENCERRM}

Retorne SOMENTE JSON nesse formato exato:
{
  "slides": [
    { "tipo": "capa",  "eyebrow": "...", "titulo": "...", "corpo": "" },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "corpo", "eyebrow": "...", "titulo": "...", "corpo": "..." },
    { "tipo": "${TEM_CTA ? 'cta' : 'corpo'}", "eyebrow": "...", "titulo": "...", "corpo": "..." }
  ],
  "legenda_instagram": "legenda envolvente de até 120 palavras + 15 hashtags. ${TEM_CTA ? 'Termina com: Comente MAPA e te envio seu teste grátis no direct.' : 'Termina com: ' + ENCERRM}"
}`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = msg.content[0].text;
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude não retornou JSON válido');
  return JSON.parse(match[0]);
}

async function renderizarSlide(browser, slide, index, total, outputPath) {
  const templatePath = path.join(__dirname, 'carrosseis', 'template.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf-8');

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 2 });
  await page.setContent(templateHtml, { waitUntil: 'networkidle0' });

  // Injeta o conteúdo do slide
  await page.evaluate((s, idx, tot) => {
    document.getElementById('slideNum').textContent =
      `${String(idx).padStart(2,'0')} / ${String(tot).padStart(2,'0')}`;

    const html = `
      ${s.eyebrow ? `<p class="eyebrow">${s.eyebrow}</p>` : ''}
      <div class="divider"></div>
      ${s.titulo ? `<h2 class="titulo">${s.titulo}</h2>` : ''}
      ${s.corpo   ? `<p class="corpo">${s.corpo}</p>` : ''}
      ${s.tipo === 'cta' ? `<div class="cta-box">Fazer minha leitura gratuita</div>` : ''}
    `;
    document.getElementById('conteudo').innerHTML = html;
  }, slide, index, total);

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();
  console.log(`  ✓ Slide ${index}/${total} → ${path.basename(outputPath)}`);
}

async function main() {
  console.log(`\n[Carrossel] Gerando: "${TEMA}"\n`);

  // 1. Gera textos via Claude
  console.log('Gerando textos com Claude...');
  const dados = await gerarTextoSlides(TEMA);

  // 2. Cria pasta de output
  const data      = new Date().toISOString().slice(0, 10);
  const slug      = TEMA.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const outputDir = path.join(__dirname, 'carrosseis', `${data}_${slug}`);
  fs.mkdirSync(outputDir, { recursive: true });

  // 3. Salva legenda
  fs.writeFileSync(
    path.join(outputDir, 'legenda.txt'),
    dados.legenda_instagram
  );

  // 4. Renderiza slides com Puppeteer
  console.log('Renderizando slides...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (let i = 0; i < dados.slides.length; i++) {
    const outputPath = path.join(outputDir, `slide-${String(i+1).padStart(2,'0')}.png`);
    await renderizarSlide(browser, dados.slides[i], i + 1, dados.slides.length, outputPath);
  }

  await browser.close();

  console.log(`\n✓ Carrossel pronto em:\n  ${outputDir}\n`);
  console.log('Legenda salva em: legenda.txt\n');
}

main().catch(err => {
  console.error('[Erro]', err.message);
  process.exit(1);
});
