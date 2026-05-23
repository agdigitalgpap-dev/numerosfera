require('dotenv').config();
const express    = require('express');
const scheduler  = require('./scheduler');
const webhook    = require('./modules/commentReply');
const health     = require('./modules/healthMonitor');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ── Webhook Meta (comentários em tempo real) ──────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[Webhook] Verificado com sucesso');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  res.sendStatus(200); // responde imediatamente para Meta não reenviar
  webhook.processar(req.body).catch(err =>
    console.error('[Webhook] Erro ao processar:', err.message)
  );
});

// ── Health check ─────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Inicia servidor e agendador ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Numerosfera Bot] Servidor rodando na porta ${PORT}`);
  scheduler.iniciar();
  health.iniciar();
});
