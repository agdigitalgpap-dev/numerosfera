/**
 * Gerador Diário — Numerosfera
 * Gera TODO o conteúdo do dia de uma vez:
 *   ✓ 1x Carrossel
 *   ✓ 2x Reels (estilos rotativos)
 *   ✓ 1x Post estático
 *   ✓ 5x Stories
 *
 * Uso: node gerar-dia.js
 * Output: posts/YYYY-MM-DD/
 *
 * A dor do dia rotaciona automaticamente entre:
 *   financas → familia → saude → vida-amorosa → financas...
 */

require('dotenv').config();
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');

const client      = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const CONFIG_PATH = path.join(__dirname, 'posts-config.json');
const BRIEF_PATH  = path.join(__dirname, 'brief-do-dia.json');
const DORES       = ['financas', 'familia', 'saude', 'vida-amorosa'];

// Formatos que recebem o CTA rotacionam dia a dia
const FORMATOS_CTA = ['carrossel', 'estatico', 'reel', 'carrossel', 'estatico', 'reel', 'carrossel'];

const DOR_DESC = {
  'financas':     'finanças — dinheiro que some, dívidas que não acabam',
  'familia':      'família — brigas sem fim, filhos afastados, casa sem paz',
  'saude':        'saúde — cansaço constante, sintomas sem explicação',
  'vida-amorosa': 'vida amorosa — sempre as pessoas erradas, solidão, o eterno quase',
};

// Encerramentos sem CTA — engajamento orgânico
const ENCERRAMENTOS = [
  'Salve este post para não esquecer.',
  'Você se identificou? Me conta nos comentários.',
  'Compartilhe com alguém que precisa ver isso.',
  'Concorda? Deixa um ❤️ se faz sentido pra você.',
  'Qual dessas situações você já viveu?',
];

function lerConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const init = { ultima_dor_index: -1, ultimo_cta_formato_index: -1, formatos_cta: FORMATOS_CTA };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function proximaDor(config) {
  const idx = (config.ultima_dor_index + 1) % DORES.length;
  config.ultima_dor_index = idx;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return DORES[idx];
}

function proximoFormatoCta(config) {
  const formatos = config.formatos_cta || FORMATOS_CTA;
  const idx = (config.ultimo_cta_formato_index + 1) % formatos.length;
  config.ultimo_cta_formato_index = idx;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return formatos[idx];
}

function encerramento() {
  return ENCERRAMENTOS[Math.floor(Math.random() * ENCERRAMENTOS.length)];
}

// ── Gera o brief do dia: Claude planeja 5 ângulos diferentes para cada formato
async function gerarBriefDoDia(dor) {
  const dorDesc  = DOR_DESC[dor];
  const dorReel2 = DORES[(DORES.indexOf(dor) + 1) % DORES.length];
  const desc2    = DOR_DESC[dorReel2];

  console.log('Planejando conteúdo do dia com Claude...');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `Estrategista da Numerosfera (numerologia hermetica). Publico: mulheres brasileiras 25-50. Produto: quiz gratuito de bloqueio energetico.

5 formatos do dia — dor principal: ${dorDesc} | Reel2: ${desc2}

Cada formato angulo DIFERENTE. Instrucao: max 40 palavras, SEM aspas duplas no texto.

Retorne SOMENTE JSON puro (sem markdown):
{"carrossel":{"tema":"...","angulo":"educacional","instrucao":"..."},"reel1":{"tema":"...","angulo":"viral hook","instrucao":"...","dor":"${dor}"},"reel2":{"tema":"...","angulo":"emocional","instrucao":"...","dor":"${dorReel2}"},"estatico":{"tema":"...","angulo":"reflexivo","instrucao":"..."},"stories":{"tema":"...","angulo":"narrativo","instrucao":"..."}}`,
    }],
  });

  const raw = msg.content[0].text;
  const match = raw.match(/{[\s\S]*}/);
  if (!match) throw new Error('Claude nao retornou JSON no brief');
  const jsonStr = match[0].replace(/,(\s*[}\]])/g, '$1');
  const brief = JSON.parse(jsonStr);
  brief.dor_principal = dor;
  brief.data = new Date().toISOString().slice(0, 10);

  fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2));
  return brief;
}

function rodar(script, args = '') {
  execSync(`node "${path.join(__dirname, script)}" ${args}`, { stdio: 'inherit' });
}

// ── Principal
async function main() {
  const config = lerConfig();
  const dor    = proximaDor(config);
  const data   = new Date().toISOString().slice(0, 10);
  const hora   = new Date().toLocaleTimeString('pt-BR');

  console.log('\n' + '═'.repeat(54));
  console.log('  NUMEROSFERA — Conteúdo do Dia');
  console.log(`  ${data} às ${hora}  |  Dor: ${dor.toUpperCase()}`);
  console.log('═'.repeat(54) + '\n');

  const dir = path.join(__dirname, 'posts', data);
  fs.mkdirSync(dir, { recursive: true });

  // Define qual formato recebe o CTA hoje
  const formatoCta = proximoFormatoCta(config);
  const enc = encerramento();

  console.log(`  CTA hoje em: ${formatoCta.toUpperCase()}\n`);

  // Salva no brief para os geradores lerem
  const brief = await gerarBriefDoDia(dor);
  brief.cta_formato  = formatoCta;
  brief.encerramento = enc;
  fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief, null, 2));

  console.log('\n  Ângulos do dia:');
  console.log(`  • Carrossel : ${brief.carrossel.tema}`);
  console.log(`  • Reel 1    : ${brief.reel1.tema}`);
  console.log(`  • Reel 2    : ${brief.reel2.tema}`);
  console.log(`  • Estático  : ${brief.estatico.tema}`);
  console.log(`  • Stories   : ${brief.stories.tema}\n`);

  // Decide qual script de carrossel usar (alterna thread e normal)
  const usarThread = Math.random() > 0.5;
  const scriptCarrossel = usarThread ? 'gerar-carrossel-thread.js' : 'gerar-carrossel.js';

  // 1. Carrossel
  console.log(`━━━ [1/5] CARROSSEL ${usarThread ? '(thread)' : '(padrão)'} ━━━`);
  rodar(scriptCarrossel, `"${brief.carrossel.tema}"`);

  // 2. Reel #1
  console.log('\n━━━ [2/5] REEL 1 ━━━');
  rodar('gerar-reel-auto.js', `"${brief.reel1.dor}"`);

  // 3. Reel #2
  console.log('\n━━━ [3/5] REEL 2 ━━━');
  rodar('gerar-reel-auto.js', `"${brief.reel2.dor}"`);

  // 4. Post estático
  console.log('\n━━━ [4/5] POST ESTÁTICO ━━━');
  rodar('gerar-estatico.js', dor);

  // 5. Stories
  console.log('\n━━━ [5/5] STORIES ━━━');
  rodar('gerar-stories.js', dor);

  try { execSync(`open "${dir}"`); } catch (_) {}
  try { execSync(`osascript -e 'display notification "1 carrossel + 2 reels + 1 estático + 5 stories prontos" with title "✅ Numerosfera — Conteúdo do dia pronto!" sound name "Glass"'`); } catch (_) {}

  console.log('\n' + '═'.repeat(54));
  console.log('  ✅ Conteúdo do dia gerado!');
  console.log(`  📁 posts/${data}/`);
  console.log('═'.repeat(54) + '\n');
}

main().catch(err => { console.error('\n[Erro]', err.message); process.exit(1); });
