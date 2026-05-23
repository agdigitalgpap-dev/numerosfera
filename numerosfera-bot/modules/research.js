const axios = require('axios');

// Busca assuntos trending no Brasil via Serper
async function buscarTrending() {
  try {
    const res = await axios.post('https://google.serper.dev/search', {
      q: 'numerologia espiritualidade astrologia trending Brasil',
      gl: 'br',
      hl: 'pt-br',
      num: 10,
    }, {
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const resultados = res.data.organic || [];
    const contexto = resultados
      .slice(0, 5)
      .map(r => r.title)
      .join(' | ');

    console.log('[Research] Trending encontrado:', contexto);
    return contexto;
  } catch (err) {
    console.warn('[Research] Falha ao buscar trending:', err.message);
    return '';
  }
}

// Busca posts virais do nicho no Instagram via Serper
async function buscarViraisNicho() {
  try {
    const res = await axios.post('https://google.serper.dev/search', {
      q: 'site:instagram.com numerologia espiritualidade viral',
      gl: 'br',
      hl: 'pt-br',
      num: 5,
    }, {
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const titulos = (res.data.organic || [])
      .slice(0, 3)
      .map(r => r.title)
      .join(' | ');

    return titulos;
  } catch (err) {
    console.warn('[Research] Falha ao buscar virais:', err.message);
    return '';
  }
}

module.exports = { buscarTrending, buscarViraisNicho };
