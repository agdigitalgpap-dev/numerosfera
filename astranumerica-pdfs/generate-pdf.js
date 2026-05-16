/**
 * ASTRA NUMERICA — Gerador de PDFs Personalizados
 *
 * Uso:
 *   node generate-pdf.js --nome "Maria" --signo "Escorpião" --sexo "feminino" --dor "financas"
 *
 * Parâmetros:
 *   --nome    Nome do lead
 *   --signo   Signo do lead (ex: "Escorpião")
 *   --sexo    "feminino" ou "masculino"
 *   --dor     "financas", "amor" ou "saude"
 *   --produto "mapa" | "bonus1" | "bonus2" | "bonus3" | "todos" (default: todos)
 *   --out     Pasta de saída (default: ./outputs/gerados)
 */

const puppeteer  = require('puppeteer');
const fs         = require('fs');
const path       = require('path');
const { marked } = require('marked');

const BASE_DIR = __dirname;

// ── Imagem → base64 data URI ─────────────────────────────────
function imgB64(rel) {
  const full = path.join(BASE_DIR, rel);
  try {
    const data = fs.readFileSync(full);
    const ext  = path.extname(full).toLowerCase().replace('.', '');
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
               : ext === 'webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${data.toString('base64')}`;
  } catch { return ''; }
}

// ── Argumentos CLI ───────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const r = { produto: 'todos', out: path.join(BASE_DIR, 'outputs/gerados') };
  for (let i = 0; i < args.length; i += 2) r[args[i].replace('--', '')] = args[i + 1];
  if (!r.nome || !r.signo || !r.sexo || !r.dor) {
    console.error('Uso: node generate-pdf.js --nome "X" --signo "Y" --sexo "feminino|masculino" --dor "financas|amor|saude"');
    process.exit(1);
  }
  r.sexo = r.sexo.toLowerCase();
  r.dor  = r.dor.toLowerCase();
  return r;
}

// ── Markdown helpers ─────────────────────────────────────────
function readMd(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

function mdToHtml(md) {
  const clean = md.split('\n').filter(l => !l.startsWith('> ')).join('\n');
  return marked.parse(clean);
}

function fillVars(html, { nome, signo, dor }) {
  return html
    .replace(/\{nome\}/g, nome)
    .replace(/\{signo\}/g, signo)
    .replace(/\{dor\}/g, dor);
}

function css() { return fs.readFileSync(path.join(BASE_DIR, 'templates/base.css'), 'utf8'); }

// ── Componentes ──────────────────────────────────────────────
function frame() {
  return `<div class="frame">
    <div class="frame-b"></div><div class="frame-r"></div>
    <div class="corner tl"></div><div class="corner tr"></div>
    <div class="corner bl"></div><div class="corner br"></div>
  </div>`;
}

function pageDiv(content, footerHtml = '') {
  return `<div class="page">${frame()}<div class="page-inner">
    ${content}
    ${footerHtml ? `<div class="page-footer">${footerHtml}</div>` : ''}
  </div></div>`;
}

function divider() {
  return `<div class="divider"><span class="divider-sym">✦ ✦ ✦</span></div>`;
}

function secHeader(label, title, sub = '') {
  return `<div class="sec-hero">
    <div class="sec-label">${label}</div>
    <div class="sec-title">${title}</div>
    ${sub ? `<div class="sec-sub">${sub}</div>` : ''}
  </div>`;
}

// Rodapé sem marca — nome do produto será definido pelo usuário
function ft(pg, signo, dor) {
  const dl = { financas: 'Prosperidade', amor: 'Amor', saude: 'Saúde' }[dor] || '';
  return `<span>Mapa Hermético · ${signo}${dl ? ' · ' + dl : ''}</span><span>${pg}</span>`;
}

// ── Divisor de seção FULL-PAGE ────────────────────────────────
function sectionOpener(num, roman, title, sub, bg = '') {
  const bgLayer = bg
    ? `<div style="position:absolute;inset:0;background:url('${bg}') center/cover;opacity:0.12;z-index:0;"></div>`
    : '';
  return `<div class="page" style="background:var(--navy);">
    ${frame()}
    ${bgLayer}
    <div class="page-inner" style="justify-content:center;align-items:center;text-align:center;position:relative;z-index:1;">
      <div class="sec-label" style="letter-spacing:0.4em;margin-bottom:14px;">Parte ${roman}</div>
      <div style="font-family:var(--f-title);font-size:9pt;color:var(--gold-dim);letter-spacing:0.25em;margin-bottom:28px;text-transform:uppercase;">— Seção ${num} —</div>
      <div style="font-family:var(--f-display);font-size:28pt;color:var(--gold-hi);line-height:1.2;text-shadow:0 0 60px rgba(212,168,75,0.35);margin-bottom:18px;max-width:500px;">${title}</div>
      ${sub ? `<div style="font-family:var(--f-label);font-size:10pt;color:var(--cream-dim);letter-spacing:0.08em;max-width:360px;line-height:1.6;">${sub}</div>` : ''}
      <div style="margin-top:56px;color:var(--gold-dim);letter-spacing:8px;font-size:11pt;">✦ ✦ ✦</div>
    </div>
  </div>`;
}

// ── Página de imagem full ─────────────────────────────────────
function imgPage(src, caption = '') {
  if (!src) return '';
  return `<div class="page" style="background:var(--ink);">
    ${frame()}
    <img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;position:absolute;inset:0;opacity:0.9;">
    ${caption ? `<div style="position:absolute;bottom:32px;left:0;right:0;text-align:center;font-family:var(--f-label);font-size:8pt;letter-spacing:0.2em;color:var(--gold-dim);text-transform:uppercase;z-index:2;">${caption}</div>` : ''}
  </div>`;
}

// ── Divide HTML em N páginas forçadas ─────────────────────────
// Cada div.page = exatamente 1 página PDF
function splitPages(html, n, footerFn, startPg) {
  const sep = '|||BREAK|||';
  const tagged = html
    .replace(/<\/p>/gi,   '</p>'  + sep)
    .replace(/<\/h[1-6]>/gi, m => m + sep)
    .replace(/<\/ul>/gi,  '</ul>' + sep)
    .replace(/<\/ol>/gi,  '</ol>' + sep)
    .replace(/<\/blockquote>/gi, '</blockquote>' + sep);

  const blocks = tagged.split(sep).map(b => b.trim()).filter(Boolean);

  const pages  = [];
  const total  = blocks.length;
  const target = Math.max(n, 1);

  for (let i = 0; i < target; i++) {
    const s = Math.floor(i * total / target);
    const e = Math.floor((i + 1) * total / target);
    const chunk = blocks.slice(s, e).join('\n') || '<p style="opacity:0">​</p>';
    pages.push(pageDiv(chunk, footerFn(startPg + i)));
  }

  return pages.join('\n');
}

// ── Página de índice ──────────────────────────────────────────
function indexPage(signo, dor) {
  const dl = { financas: 'Prosperidade', amor: 'Amor', saude: 'Saúde' }[dor] || dor;
  const items = [
    ['I',    '04', 'Carta para você'],
    ['II',   '06', `Seu Signo Hermético: ${signo}`],
    ['III',  '13', 'O Bloqueio que Foi Removido'],
    ['IV',   '21', 'Seus 5 Talentos Ocultos'],
    ['V',    '31', 'A Técnica dos 7 Minutos'],
    ['VI',   '35', 'O Código da Prosperidade'],
    ['VII',  '46', 'Traços e Relacionamentos'],
    ['VIII', '55', 'Datas de Poder Pessoais'],
    ['IX',   '61', 'Seu Escudo Natural'],
    ['X',    '67', 'Sua Visão de Futuro'],
    ['XI',   '73', 'Ritual de Manutenção e Fechamento'],
  ];
  const rows = items.map(([r, pg, t]) => `
    <div style="display:flex;align-items:baseline;gap:14px;padding:10px 0;border-bottom:1px solid rgba(184,146,42,0.12);">
      <span style="font-family:var(--f-title);font-size:9pt;color:var(--gold-dim);width:32px;flex-shrink:0;">${r}</span>
      <span style="font-family:var(--f-body);font-size:13pt;color:var(--cream);flex:1;">${t}</span>
      <span style="font-family:var(--f-label);font-size:8pt;color:var(--gold);letter-spacing:0.1em;">${pg}</span>
    </div>`).join('');

  return pageDiv(`
    <div class="sec-hero">
      <div class="sec-label">Sumário</div>
      <div class="sec-title">Índice do Mapa</div>
      <div class="sec-sub">${signo} · ${dl}</div>
    </div>
    <div style="margin-top:8px;">${rows}</div>
    <p style="margin-top:24px;font-size:11pt;color:var(--cream-dim);font-style:italic;">
      Este mapa foi criado especificamente para você. Cada seção tem origem na análise hermética do seu campo — não é um documento genérico.
    </p>
  `, `<span>Índice</span><span>03</span>`);
}

// ══════════════════════════════════════════════════════════════
// MAPA HERMÉTICO — 78 PÁGINAS
//
// Estrutura de páginas:
//   01 — Capa
//   02 — Folha de rosto
//   03 — Índice
//   04–05 — Abertura (carta)
//   06 — Divisor Seção I
//   07–12 — Seção 1: Signo Hermético       (6 pgs)
//   13 — Divisor Seção II
//   14–20 — Seção 2: Bloqueio              (7 pgs)
//   21 — Divisor Seção III
//   22–30 — Seção 3: Talentos              (9 pgs)
//   31 — Divisor Seção IV
//   32–34 — Seção 4: Técnica 7 Minutos     (3 pgs)
//   35 — Divisor Seção V ← CÓDIGO DA PROSPERIDADE (página 35!)
//   36–44 — Seção 5: Código da Prosperidade (9 pgs)
//   45 — Imagem
//   46 — Divisor Seção VI
//   47–54 — Seção 6: Traços e Relações     (8 pgs)
//   55 — Divisor Seção VII
//   56–60 — Seção 7: Datas de Poder        (5 pgs)
//   61 — Divisor Seção VIII
//   62–66 — Seção 8: Escudo Natural        (5 pgs)
//   67 — Divisor Seção IX
//   68–72 — Seção 9: Visão de Futuro       (5 pgs)
//   73 — Divisor Seção X
//   74–77 — Seção 10: Ritual de Manutenção (4 pgs)
//   78 — Contra-capa
// ══════════════════════════════════════════════════════════════
async function buildMapaHermetico(args) {
  const { nome, signo, sexo, dor } = args;
  const COPY = path.join(BASE_DIR, '01_produto-principal/copy/mapa-hermetico');

  // Leitura do conteúdo
  const s = (file) => fillVars(mdToHtml(readMd(path.join(COPY, file))), { nome, signo, dor });

  const abHtml = s(`abertura/${sexo}.md`);
  const s1     = s('secoes-fixas/01-signo-hermetico.md');
  const s2     = s(`secoes-dor/02-bloqueio-${dor}.md`);
  const s3     = s('secoes-fixas/03-talentos-ocultos.md');
  const s4     = s('secoes-fixas/04-tecnica-7-minutos.md');
  const s5     = s('secoes-fixas/05-codigo-prosperidade.md');
  const s6     = s('secoes-fixas/06-tracos-relacionamentos.md');
  const s7     = s('secoes-fixas/07-datas-poder.md');
  const s8     = s('secoes-fixas/08-escudo-natural.md');
  const s9     = s(`secoes-dor/09-visualizacao-${dor}.md`);
  const s10    = s('secoes-fixas/10-ritual-manutencao-fechamento.md');

  // Imagens
  const iCapa     = imgB64('01_produto-principal/imagens/capa/capa-mapa-hermetico.png');
  const iContra   = imgB64('01_produto-principal/imagens/capa/contra-capa.png');
  const iAbert    = imgB64('01_produto-principal/imagens/abertura/abertura-elemento-decorativo.png');
  const iSep      = imgB64('01_produto-principal/imagens/elementos/separador-alternativo.png');
  const iTextura  = imgB64('01_produto-principal/imagens/elementos/textura-fundo-paginas-internas.png');
  const iCanal    = imgB64(`01_produto-principal/imagens/secoes-dor/canal-${dor === 'financas' ? 'abundancia' : dor === 'amor' ? 'coracao' : 'vital'}-obstruido-e-limpo.png`);
  const iFuturo   = imgB64(`01_produto-principal/imagens/secoes-dor/futuro-${dor === 'financas' ? 'financeiro' : dor === 'amor' ? 'amoroso' : 'saude-vitalidade'}.png`);
  const iInflu    = imgB64('01_produto-principal/imagens/secoes-fixas/influencia-natural-ressonancia-de-campo.png');
  const iResil    = imgB64('01_produto-principal/imagens/secoes-fixas/resiliencia-energetica.png');
  const iConex    = imgB64('01_produto-principal/imagens/secoes-fixas/conexao-profunda-entre-dois-campos.png');

  const f = (pg) => ft(String(pg).padStart(2, '0'), signo, dor);

  // ── Abertura com imagem embutida ──
  const abWithImg = `
    ${iAbert ? `<div style="text-align:center;margin-bottom:20px;"><img src="${iAbert}" style="max-height:65px;object-fit:contain;opacity:0.55;"></div>` : ''}
    <div class="letter-header">
      <span class="letter-name">${nome}</span>
      <span class="letter-sub">Seu Mapa Hermético Personalizado</span>
    </div>
    ${abHtml}`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<style>${css()}</style></head><body>

<!-- P.01 — CAPA -->
<div class="page cover-page"><img class="cover-img" src="${iCapa}" alt="Mapa Hermético"></div>

<!-- P.02 — FOLHA DE ROSTO -->
${pageDiv(`
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
    <div class="sec-label" style="margin-bottom:16px;letter-spacing:0.3em;">Documento Confidencial e Personalizado</div>
    <h1 style="font-size:28pt;margin-bottom:8px;line-height:1.2;">MAPA<br>HERMÉTICO</h1>
    <div style="font-family:var(--f-label);color:var(--cream-dim);letter-spacing:0.14em;font-size:8.5pt;margin-bottom:40px;text-transform:uppercase;">Relatório Pessoal · Astrologia Hermética</div>
    <div class="title-page-box" style="margin-bottom:28px;min-width:300px;">
      <div class="sec-label" style="margin-bottom:8px;letter-spacing:0.2em;">Preparado exclusivamente para</div>
      <div class="letter-name" style="font-size:24pt;">${nome}</div>
      <div style="font-family:var(--f-label);color:var(--gold-dim);margin-top:8px;font-size:8pt;letter-spacing:0.2em;text-transform:uppercase;">${signo}</div>
    </div>
    ${iSep ? `<img src="${iSep}" style="max-width:320px;max-height:40px;object-fit:contain;opacity:0.5;margin-bottom:20px;">` : ''}
    <p style="font-size:11pt;color:var(--cream-dim);max-width:380px;text-align:center;font-style:italic;">
      "O campo não mente. O que estava bloqueado, agora está aberto.<br>O que era seu, começa a chegar."
    </p>
  </div>
`, '')}

<!-- P.03 — ÍNDICE -->
${indexPage(signo, dor)}

<!-- P.04–05 — ABERTURA (2 páginas) -->
${splitPages(abWithImg, 2, f, 4)}

<!-- P.06 — DIVISOR I -->
${sectionOpener(1, 'I', `Seu Signo Hermético`, `A frequência que o cosmos imprimiu em ${nome}`, iTextura)}

<!-- P.07–12 — SEÇÃO 1: SIGNO (6 páginas) -->
${splitPages(secHeader('Seção 1 · Seu Signo Hermético', `${signo} — A Frequência que Define Tudo`, 'O que a astrologia comum nunca te contou') + s1, 6, f, 7)}

<!-- P.13 — DIVISOR II -->
${sectionOpener(2, 'II', 'O Bloqueio que Foi Removido', 'A origem, o mecanismo e o que mudou no seu campo', iCanal)}

<!-- P.14–20 — SEÇÃO 2: BLOQUEIO (7 páginas) -->
${splitPages(secHeader('Seção 2 · O Bloqueio', `${nome}, isso explica tudo`, 'A raiz de tudo que não funcionava') + s2, 7, f, 14)}

<!-- P.21 — DIVISOR III -->
${sectionOpener(3, 'III', 'Seus 5 Talentos Ocultos', 'Capacidades genuínas que estavam suprimidas pelo bloqueio', iInflu)}

<!-- P.22–30 — SEÇÃO 3: TALENTOS (9 páginas) -->
${splitPages(secHeader('Seção 3 · Talentos Ocultos', `${nome}, você tem talentos que nunca soube usar`, 'Não porque eles não existam — porque estavam bloqueados') + s3, 9, f, 22)}

<!-- P.31 — DIVISOR IV -->
${sectionOpener(4, 'IV', 'A Técnica dos 7 Minutos', 'O protocolo hermético de manutenção do campo', iResil)}

<!-- P.32–34 — SEÇÃO 4: TÉCNICA (3 páginas) -->
${splitPages(secHeader('Seção 4 · A Técnica dos 7 Minutos', 'Você não precisa de horas de meditação', 'A eficiência do ritual está na sua precisão, não na duração') + s4, 3, f, 32)}

<!-- P.35 — DIVISOR V ← PÁGINA 35: O CÓDIGO DA PROSPERIDADE -->
${sectionOpener(5, 'V', 'O Código da Prosperidade', 'Isso não estava previsto no mapa original', iTextura)}

<!-- P.36–44 — SEÇÃO 5: CÓDIGO (9 páginas) -->
${splitPages(secHeader('Seção 5 · O Código da Prosperidade', 'Algo que não esperava encontrar', 'Gravado na sua assinatura energética — e estava completamente suprimido') + s5, 9, f, 36)}

<!-- P.45 — IMAGEM: CANAL -->
${imgPage(iCanal, 'Seu campo energético · Antes e depois')}

<!-- P.46 — DIVISOR VI -->
${sectionOpener(6, 'VI', 'Traços e Relacionamentos', `Como ${signo} se conecta — a visão hermética`, iConex)}

<!-- P.47–54 — SEÇÃO 6: TRAÇOS (8 páginas) -->
${splitPages(secHeader('Seção 6 · Traços e Relacionamentos', 'Relacionamentos são campos energéticos', 'O que define como você atrai, conecta e sustenta vínculos') + s6, 8, f, 47)}

<!-- P.55 — DIVISOR VII -->
${sectionOpener(7, 'VII', 'Datas de Poder Pessoais', 'O tempo também é um campo', iTextura)}

<!-- P.56–60 — SEÇÃO 7: DATAS (5 páginas) -->
${splitPages(secHeader('Seção 7 · Datas de Poder', 'Suas janelas de maior potência', 'Quando a frequência cósmica favorece sua ação') + s7, 5, f, 56)}

<!-- P.61 — DIVISOR VIII -->
${sectionOpener(8, 'VIII', 'Seu Escudo Natural', 'Nem toda energia que chega até você é sua', iResil)}

<!-- P.62–66 — SEÇÃO 8: ESCUDO (5 páginas) -->
${splitPages(secHeader('Seção 8 · Seu Escudo Natural', 'Proteção e discernimento energético', 'Como manter o campo limpo em ambientes densos') + s8, 5, f, 62)}

<!-- P.67 — DIVISOR IX -->
${sectionOpener(9, 'IX', 'Sua Visão de Futuro', 'O que está à frente com o campo limpo', iFuturo)}

<!-- P.68–72 — SEÇÃO 9: VISUALIZAÇÃO (5 páginas) -->
${splitPages(secHeader('Seção 9 · Sua Visão de Futuro', `${nome}, vou te mostrar o que está à frente`, 'Projeção energética com base na limpeza realizada') + s9, 5, f, 68)}

<!-- P.73 — DIVISOR X -->
${sectionOpener(10, 'X', 'Ritual de Manutenção e Fechamento', 'A seção mais importante deste mapa', iTextura)}

<!-- P.74–77 — SEÇÃO 10: RITUAL (4 páginas) -->
${splitPages(secHeader('Seção 10 · Ritual de Manutenção', 'O que acontece se você não mantiver o campo', 'O protocolo completo para que o campo permaneça em fluxo') + s10, 4, f, 74)}

<!-- P.78 — CONTRA-CAPA -->
<div class="page cover-page"><img class="cover-img" src="${iContra}" alt="Contra-capa"></div>

</body></html>`;
}

// ── BÔNUS 1 ──────────────────────────────────────────────────
async function buildBonus1(args) {
  const { nome, signo, dor } = args;
  const content  = fillVars(mdToHtml(readMd(path.join(BASE_DIR, '02_bonus1-vidas-passadas/copy/bonus1-vidas-passadas.md'))), { nome, signo, dor });
  const iCapa    = imgB64('02_bonus1-vidas-passadas/imagens/capa-leitura-vidas-passadas.png');
  const iInterno = imgB64('02_bonus1-vidas-passadas/imagens/bonus1-registros-akasicos-interno.png');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>${css()}</style></head><body>

<!-- Capa com overlay de texto -->
<div class="page" style="background:var(--ink);position:relative;">
  ${iCapa ? `<img src="${iCapa}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">` : ''}
  <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(6,6,15,0.92) 40%, transparent 80%);z-index:1;"></div>
  <div style="position:absolute;bottom:60px;left:0;right:0;text-align:center;padding:0 60px;z-index:2;">
    <div class="bonus-badge" style="margin-bottom:12px;">Bônus 1</div>
    <div style="font-family:var(--f-label);font-size:9pt;color:var(--cream-dim);letter-spacing:0.1em;">Preparado para ${nome}</div>
  </div>
</div>

${pageDiv(`
  <div class="bonus-badge">Bônus 1 — Leitura de Vidas Passadas</div>
  <div class="bonus-value" style="margin-bottom:20px;">Valor real: <span>R$ 597,00</span> — Incluso no seu pacote hermético</div>
  ${iInterno ? `<div class="img-block" style="margin-bottom:20px;"><img src="${iInterno}" style="max-height:200px;object-fit:cover;width:100%;"></div>` : ''}
  <div class="sec-label" style="margin-bottom:8px;">Relatório da influência de vidas anteriores no seu comportamento</div>
  <p>${nome}, este relatório revela os padrões que atravessaram ciclos de existência e estão ativos na sua vida hoje — sua origem, sua influência e como transformá-los.</p>
  ${divider()}
  <p style="font-size:11pt;color:var(--cream-dim);font-style:italic;">
    "Alguns padrões não têm origem nesta vida. Eles chegaram com você — gravados na memória da alma desde experiências anteriores. Entender a origem é o que torna possível mudá-los."
  </p>
`, `<span>Bônus 1 · Leitura de Vidas Passadas</span><span>01</span>`)}

${splitPages(content, 6, (p) => `<span>Bônus 1 · Leitura de Vidas Passadas</span><span>${String(p).padStart(2,'0')}</span>`, 2)}

</body></html>`;
}

// ── BÔNUS 2 ──────────────────────────────────────────────────
async function buildBonus2(args) {
  const { nome, signo, dor } = args;
  const content  = fillVars(mdToHtml(readMd(path.join(BASE_DIR, '03_bonus2-biblioteca-emergencias/copy/bonus2-biblioteca.md'))), { nome, signo, dor });
  const iCapa    = imgB64('03_bonus2-biblioteca-emergencias/imagens/capa-biblioteca-secreta-emergencias.png');
  const iInterno = imgB64('03_bonus2-biblioteca-emergencias/imagens/bonus2-ritual-emergencia-interno.png');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>${css()}</style></head><body>

<div class="page" style="background:var(--ink);position:relative;">
  ${iCapa ? `<img src="${iCapa}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">` : ''}
  <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(6,6,15,0.92) 40%, transparent 80%);z-index:1;"></div>
  <div style="position:absolute;bottom:60px;left:0;right:0;text-align:center;padding:0 60px;z-index:2;">
    <div class="bonus-badge" style="margin-bottom:12px;">Bônus 2</div>
    <div style="font-family:var(--f-label);font-size:9pt;color:var(--cream-dim);letter-spacing:0.1em;">3 rituais de emergência · Para uso imediato</div>
  </div>
</div>

${pageDiv(`
  <div class="bonus-badge">Bônus 2 — Biblioteca Secreta de Emergências</div>
  <div class="bonus-value" style="margin-bottom:20px;">Valor real: <span>R$ 397,00</span> — Incluso no seu pacote hermético</div>
  ${iInterno ? `<div class="img-block" style="margin-bottom:20px;"><img src="${iInterno}" style="max-height:180px;object-fit:cover;width:100%;"></div>` : ''}
  <div class="sec-label" style="margin-bottom:8px;">3 rituais para situações urgentes — técnicas guardadas a sete chaves</div>
  <div style="display:flex;gap:12px;margin-top:16px;">
    ${[['1','Desbloqueio Rápido','Resultado em 24 horas'],['2','Proteção contra Inveja','Escudo imediato'],['3','Atrair Dinheiro Urgente','Para necessidade real']].map(([n,t,s]) => `
    <div class="pillar" style="flex:1;">
      <div class="pillar-title"><div class="pillar-num">${n}</div>${t}</div>
      <p>${s}</p>
    </div>`).join('')}
  </div>
`, `<span>Bônus 2 · Biblioteca de Emergências</span><span>01</span>`)}

${splitPages(content, 8, (p) => `<span>Bônus 2 · Biblioteca de Emergências</span><span>${String(p).padStart(2,'0')}</span>`, 2)}

</body></html>`;
}

// ── BÔNUS 3 ──────────────────────────────────────────────────
async function buildBonus3(args) {
  const { nome, signo, dor } = args;
  const content = fillVars(mdToHtml(readMd(path.join(BASE_DIR, '04_bonus3-audio-potencializacao/copy/bonus3-audio.md'))), { nome, signo, dor });

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>${css()}</style></head><body>

${pageDiv(`
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;">
    <div class="bonus-badge" style="margin-bottom:16px;">Bônus 3</div>
    <div style="font-size:72pt;margin-bottom:16px;line-height:1;">🎵</div>
    <h1 style="font-size:20pt;margin-bottom:8px;line-height:1.2;">Áudio de Potencialização<br>Hermética</h1>
    <div class="bonus-value" style="margin-bottom:32px;">Valor real: <span>R$ 297,00</span> — Incluso no seu pacote hermético</div>
    <div class="title-page-box" style="max-width:380px;">
      <div class="sec-label" style="margin-bottom:10px;">Instrução principal</div>
      <div style="font-family:var(--f-display);font-size:15pt;color:var(--gold-hi);line-height:1.4;">
        Ouça por 7 minutos<br>antes de dormir
      </div>
      <p style="margin-top:14px;font-size:11pt;color:var(--cream-dim);margin-bottom:0;">
        Use fones de ouvido. Olhos fechados.<br>Volume médio a baixo.
      </p>
    </div>
  </div>
`, `<span>Bônus 3 · Áudio de Potencialização Hermética</span><span>01</span>`)}

${splitPages(content, 4, (p) => `<span>Bônus 3 · Áudio de Potencialização</span><span>${String(p).padStart(2,'0')}</span>`, 2)}

</body></html>`;
}

// ── Renderiza PDF via Puppeteer ───────────────────────────────
async function renderPdf(html, outPath) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // Aguarda fontes do Google Fonts carregarem (até 60s)
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  await browser.close();
  console.log(`  ✓ ${path.basename(outPath)}`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  const { nome, signo, sexo, dor, produto, out } = args;
  const slug = `${nome.toLowerCase().replace(/\s+/g,'-')}-${signo.toLowerCase().replace(/\s+/g,'-')}-${dor}`;

  fs.mkdirSync(out, { recursive: true });
  console.log(`\n🔮 Gerando PDFs — ${nome} · ${signo} · ${sexo} · ${dor}\n`);

  if (produto === 'mapa'   || produto === 'todos') await renderPdf(await buildMapaHermetico(args), path.join(out, `mapa-hermetico-${slug}.pdf`));
  if (produto === 'bonus1' || produto === 'todos') await renderPdf(await buildBonus1(args),        path.join(out, `bonus1-vidas-passadas-${slug}.pdf`));
  if (produto === 'bonus2' || produto === 'todos') await renderPdf(await buildBonus2(args),        path.join(out, `bonus2-biblioteca-${slug}.pdf`));
  if (produto === 'bonus3' || produto === 'todos') await renderPdf(await buildBonus3(args),        path.join(out, `bonus3-audio-${slug}.pdf`));

  console.log(`\n✅ Concluído! PDFs em: ${out}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
