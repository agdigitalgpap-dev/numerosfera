const Anthropic = require('@anthropic-ai/sdk');
const { buildPrompt } = require('../prompts/spirituality');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function gerarCopy(tipo, contexto = '') {
  const prompt = buildPrompt(tipo, contexto);

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const texto = msg.content[0].text;

  // Extrai JSON da resposta
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude não retornou JSON válido');

  const copy = JSON.parse(match[0]);
  console.log(`[Copywriter] Copy gerada para tipo: ${tipo}`);
  return copy;
}

module.exports = { gerarCopy };
