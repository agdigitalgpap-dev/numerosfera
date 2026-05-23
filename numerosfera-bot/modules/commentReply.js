const axios    = require('axios');
const database = require('../leads/database');

const IG_API = 'https://graph.facebook.com/v19.0';
const TOKEN  = () => process.env.META_ACCESS_TOKEN;
const QUIZ   = () => process.env.QUIZ_LINK || 'https://numerosfera.store';

// 8 variações de resposta pública — nunca repete a mesma sequencialmente
const RESPOSTAS_PUBLICAS = [
  'Oi! Te mandei algo especial no direct 🌟',
  'Olha sua caixa de mensagens ✨',
  'Já te enviei no direct, confere lá 💫',
  'Te mandei uma mensagem, vai lá ver 🔮',
  'Separei algo especial pra você no direct ⭐',
  'Corre lá no direct, te enviei algo importante 🌙',
  'Sua mensagem já está no direct, vai conferir ✨',
  'Te enviei algo no direct que vai te surpreender 💫',
];

let ultimaResposta = -1;

function sortearResposta() {
  let idx;
  do { idx = Math.floor(Math.random() * RESPOSTAS_PUBLICAS.length); }
  while (idx === ultimaResposta);
  ultimaResposta = idx;
  return RESPOSTAS_PUBLICAS[idx];
}

// Delay humanizado entre 45s e 4 minutos
function delayHumanizado() {
  const min = 45 * 1000;
  const max = 4 * 60 * 1000;
  return Math.floor(Math.random() * (max - min) + min);
}

async function processar(body) {
  const entry = body?.entry?.[0];
  if (!entry) return;

  // Instagram
  const igChanges = entry.changes || [];
  for (const change of igChanges) {
    if (change.field === 'comments') {
      const comentario = change.value;
      if (!comentario?.id || !comentario?.from?.id) continue;

      const delay = delayHumanizado();
      console.log(`[Comments] Comentário detectado — respondendo em ${Math.round(delay/1000)}s`);

      setTimeout(async () => {
        await responderComentarioIG(comentario);
        await enviarDMInstagram(comentario.from.id, comentario.from.username);
        database.salvarLead({
          plataforma: 'instagram',
          userId: comentario.from.id,
          username: comentario.from.username,
          etapa: 0,
        });
      }, delay);
    }
  }

  // Facebook Messenger
  const messaging = entry.messaging || [];
  for (const msg of messaging) {
    if (msg.message && !msg.message.is_echo) {
      await enviarDMMessenger(msg.sender.id);
    }
  }
}

async function responderComentarioIG(comentario) {
  try {
    await axios.post(`${IG_API}/${comentario.id}/replies`, {
      message: sortearResposta(),
      access_token: TOKEN(),
    });
    console.log('[Comments] Resposta pública enviada no Instagram');
  } catch (err) {
    console.error('[Comments] Erro ao responder comentário IG:', err.response?.data || err.message);
  }
}

async function enviarDMInstagram(userId, username = '') {
  try {
    const texto = `Oi${username ? ` ${username}` : ''}! 🌟\n\nPreparei algo especial para você — uma leitura numerológica personalizada com base no seu mapa astral.\n\nAcesse agora gratuitamente: ${QUIZ()}`;

    await axios.post(`${IG_API}/me/messages`, {
      recipient: { id: userId },
      message: { text: texto },
      access_token: TOKEN(),
    });
    console.log(`[DM] Instagram DM enviada para ${userId}`);
  } catch (err) {
    console.error('[DM] Erro ao enviar DM Instagram:', err.response?.data || err.message);
  }
}

async function enviarDMMessenger(senderId) {
  try {
    const texto = `Olá! 🌟\n\nPreparei uma leitura numerológica personalizada para você.\n\nAcesse gratuitamente: ${QUIZ()}`;

    await axios.post(`${IG_API}/me/messages`, {
      recipient: { id: senderId },
      message: { text: texto },
      access_token: TOKEN(),
    });
    console.log(`[DM] Messenger enviado para ${senderId}`);
  } catch (err) {
    console.error('[DM] Erro ao enviar Messenger:', err.response?.data || err.message);
  }
}

module.exports = { processar };
