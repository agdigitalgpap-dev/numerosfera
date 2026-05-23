const cron   = require('node-cron');
const poster  = require('./modules/poster');
const followUp = require('./modules/followUp');

// 6 horários diários com delay aleatório humanizado (0-8 min)
const AGENDA = [
  { hora: '0 6 * * *',  tipo: 'afirmacao'   },
  { hora: '0 9 * * *',  tipo: 'educativo'   },
  { hora: '0 12 * * *', tipo: 'viral'        },
  { hora: '0 14 * * *', tipo: 'prova_social' },
  { hora: '0 18 * * *', tipo: 'engajamento'  },
  { hora: '0 20 * * *', tipo: 'cta'          },
];

function delayAleatorio() {
  // Entre 0 e 8 minutos em ms
  return Math.floor(Math.random() * 8 * 60 * 1000);
}

function iniciar() {
  AGENDA.forEach(({ hora, tipo }) => {
    cron.schedule(hora, () => {
      const delay = delayAleatorio();
      console.log(`[Scheduler] ${tipo} agendado com delay de ${Math.round(delay/60000)}min`);
      setTimeout(() => {
        poster.publicar(tipo).catch(err =>
          console.error(`[Scheduler] Erro ao publicar ${tipo}:`, err.message)
        );
      }, delay);
    }, { timezone: 'America/Sao_Paulo' });
  });

  // Follow-up diário às 10h
  cron.schedule('0 10 * * *', () => {
    followUp.processar().catch(err =>
      console.error('[Scheduler] Erro no follow-up:', err.message)
    );
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[Scheduler] 6 posts diários + follow-up agendados (fuso: São Paulo)');
}

module.exports = { iniciar };
