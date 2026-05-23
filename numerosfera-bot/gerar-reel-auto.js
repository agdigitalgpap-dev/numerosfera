/**
 * Gerador de Reel com rotação automática de estilos — Numerosfera
 *
 * Uso:
 *   node gerar-reel-auto.js financas
 *   node gerar-reel-auto.js familia
 *   node gerar-reel-auto.js saude
 *   node gerar-reel-auto.js vida-amorosa
 *
 * Alterna automaticamente entre os 3 estilos a cada chamada:
 *   1 → Fundo escuro + partículas douradas
 *   2 → Geometria sagrada animada (Mandelbrot)
 *   3 → Leonardo AI split-frame (10 imagens)
 */

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'reels-config.json');

function lerConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function salvarConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function proximoEstilo(config) {
  const proximo = (config.ultimo_estilo % 3) + 1;
  config.ultimo_estilo = proximo;
  salvarConfig(config);
  return proximo;
}

async function main() {
  const dor = (process.argv[2] || 'financas').toLowerCase().trim();

  const config = lerConfig();
  const estilo = proximoEstilo(config);
  const info   = config.estilos.find(e => e.id === estilo);

  console.log(`\n[Reel Auto] Dor: "${dor}" | Estilo ${estilo}: ${info.nome}\n`);

  // Passa a dor como argumento para o script do estilo
  const script = path.join(__dirname, info.script);
  execSync(`node "${script}" "${dor}"`, { stdio: 'inherit' });
}

main().catch(err => {
  console.error('[Erro]', err.message);
  process.exit(1);
});
