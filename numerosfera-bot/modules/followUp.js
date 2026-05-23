const axios    = require('axios');
const database = require('../leads/database');

const IG_API = 'https://graph.facebook.com/v19.0';
const TOKEN  = () => process.env.META_ACCESS_TOKEN;
const QUIZ   = () => process.env.QUIZ_LINK || 'https://numerosfera.store';

// Mensagens por etapa (dias 1, 3, 5, 7)
const SEQUENCIA = {
  1: `Oi! 🌙\n\nVocê já fez o quiz numerológico? Muita gente está se surpreendendo com o que descobriu sobre si mesma...\n\n${QUIZ()}`,
  3: `✨ Queria compartilhar algo com você.\n\nUma das nossas clientes descobriu pelo quiz que havia um bloqueio energético impedindo ela de prosperar. Em 30 dias, tudo mudou.\n\nVocê ainda tem tempo de fazer o seu: ${QUIZ()}`,
  5: `🔮 Últimas horas...\n\nA leitura personalizada do seu mapa numerológico está disponível, mas não por muito tempo.\n\nClique aqui antes que feche: ${QUIZ()}`,
  7: `⭐ Última chamada.\n\nNão quero que você fique sem conhecer o que o seu mapa revela. Esse pode ser o momento que muda tudo.\n\n${QUIZ()}`,
};

// Delay entre DMs: mínimo 3 minutos
const DELAY_ENTRE_DMS = 3 * 60 * 1000;

async function processar() {
  const leads = database.getLeadsParaFollowUp();
  console.log(`[FollowUp] Processando ${leads.length} leads`);

  for (const lead of leads) {
    const diasPassados = Math.floor((Date.now() - lead.criadoEm) / (1000 * 60 * 60 * 24));
    const proximaEtapa = [1, 3, 5, 7].find(d => d <= diasPassados && d > lead.etapa);

    if (!proximaEtapa) continue;

    const mensagem = SEQUENCIA[proximaEtapa];
    if (!mensagem) continue;

    try {
      await enviarFollowUp(lead, mensagem);
      database.atualizarEtapa(lead.userId, proximaEtapa);
      console.log(`[FollowUp] Enviado para ${lead.username || lead.userId} — etapa ${proximaEtapa}`);
    } catch (err) {
      console.error(`[FollowUp] Erro para ${lead.userId}:`, err.message);
    }

    await sleep(DELAY_ENTRE_DMS);
  }
}

async function enviarFollowUp(lead, mensagem) {
  await axios.post(`${IG_API}/me/messages`, {
    recipient: { id: lead.userId },
    message: { text: mensagem },
    access_token: TOKEN(),
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { processar };
