const fs = require('fs');
const path = require('path');

const STATUS_PATH = path.join(__dirname, '..', 'leads', 'health.json');

let _status = { alertas: 0, pausado: false, ultimaVerificacao: null };

function _salvar() {
  fs.writeFileSync(STATUS_PATH, JSON.stringify(_status, null, 2));
}

function _carregar() {
  if (!fs.existsSync(STATUS_PATH)) return;
  try { _status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf-8')); }
  catch (_) {}
}

function registrarErro(tipo) {
  _status.alertas++;
  console.warn(`[Health] Alerta registrado (${tipo}) — total: ${_status.alertas}`);

  // Pausa automática se muitos erros seguidos
  if (_status.alertas >= 5) {
    _status.pausado = true;
    console.error('[Health] SISTEMA PAUSADO — muitos erros detectados. Verifique as APIs.');
  }

  _salvar();
}

function resetarAlertas() {
  _status.alertas = 0;
  _status.pausado = false;
  _salvar();
  console.log('[Health] Alertas resetados');
}

function isPausado() {
  return _status.pausado;
}

function iniciar() {
  _carregar();
  // Reset diário dos alertas às 4h
  const agora = new Date();
  const ms4h  = new Date(agora);
  ms4h.setHours(4, 0, 0, 0);
  if (ms4h < agora) ms4h.setDate(ms4h.getDate() + 1);

  setTimeout(() => {
    resetarAlertas();
    setInterval(resetarAlertas, 24 * 60 * 60 * 1000);
  }, ms4h - agora);

  console.log('[Health] Monitor iniciado');
}

module.exports = { registrarErro, resetarAlertas, isPausado, iniciar };
