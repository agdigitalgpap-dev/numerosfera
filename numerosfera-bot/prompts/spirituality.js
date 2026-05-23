const TIPOS = {
  afirmacao: {
    instrucao: 'Gere uma afirmação numerológica poderosa para começar o dia. Curta, impactante, que pare o scroll.',
    tom: 'inspirador e energético',
  },
  educativo: {
    instrucao: 'Crie conteúdo educativo sobre numerologia em formato de carrossel (5 slides). Primeiro slide deve parar o scroll.',
    tom: 'didático mas místico',
  },
  viral: {
    instrucao: 'Adapte o assunto trending do dia para numerologia/espiritualidade. Conecte com o número do destino ou mapa numerológico.',
    tom: 'atual, relevante, com gancho emocional',
  },
  prova_social: {
    instrucao: 'Crie um depoimento estilizado de uma cliente que transformou sua vida após descobrir seu mapa numerológico.',
    tom: 'emotivo e real',
  },
  engajamento: {
    instrucao: 'Crie uma pergunta de engajamento sobre numerologia que provoque respostas nos comentários.',
    tom: 'curioso e interativo',
  },
  cta: {
    instrucao: 'Crie um post CTA direto para o quiz de numerologia. Urgência e curiosidade. Sem ser agressivo.',
    tom: 'direto, misterioso, com senso de oportunidade',
  },
};

const BASE = `
Você é a copywriter da Numerosfera, marca de astrologia hermética e numerologia.
Público: mulheres brasileiras, 25-50 anos, interessadas em espiritualidade e autoconhecimento.
Estética da marca: místico, dourado, elegante, sofisticado. Nunca piegas ou genérico.
Quiz link: ${process.env.QUIZ_LINK || 'https://numerosfera.store'}
`;

function buildPrompt(tipo, contexto = '') {
  const cfg = TIPOS[tipo] || TIPOS.educativo;
  return `${BASE}
Tipo de post: ${tipo}
Tom: ${cfg.tom}
Instrução: ${cfg.instrucao}
${contexto ? `Contexto/trending do dia: ${contexto}` : ''}

Retorne JSON com:
{
  "legenda_instagram": "...",
  "legenda_facebook": "...",
  "hashtags": ["...", "..."],
  "prompt_imagem": "..."
}

Regras:
- legenda_instagram: mais emocional, máx 150 palavras, 3-5 emojis discretos
- legenda_facebook: mais textual e explicativo, máx 200 palavras
- hashtags: 10-15 relevantes em português
- prompt_imagem: em inglês, estilo mystical dark gold aesthetic, para Leonardo AI
`;
}

module.exports = { buildPrompt };
