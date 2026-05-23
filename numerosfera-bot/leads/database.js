const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'leads.json');

function _ler() {
  if (!fs.existsSync(DB_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch (_) { return []; }
}

function _salvar(dados) {
  fs.writeFileSync(DB_PATH, JSON.stringify(dados, null, 2));
}

function salvarLead({ plataforma, userId, username, etapa = 0 }) {
  const leads = _ler();
  const existe = leads.find(l => l.userId === userId);
  if (existe) return; // não duplica

  leads.push({
    plataforma,
    userId,
    username: username || '',
    etapa,
    criadoEm: Date.now(),
  });

  _salvar(leads);
  console.log(`[DB] Lead salvo: ${username || userId} (${plataforma})`);
}

function atualizarEtapa(userId, etapa) {
  const leads = _ler();
  const lead  = leads.find(l => l.userId === userId);
  if (lead) {
    lead.etapa = etapa;
    _salvar(leads);
  }
}

function getLeadsParaFollowUp() {
  return _ler().filter(l => l.etapa < 7);
}

function getTodos() {
  return _ler();
}

module.exports = { salvarLead, atualizarEtapa, getLeadsParaFollowUp, getTodos };
