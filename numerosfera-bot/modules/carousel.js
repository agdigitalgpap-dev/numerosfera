const axios    = require('axios');
const imageGen = require('./imageGen');
const fs       = require('fs');

const IG_API = 'https://graph.facebook.com/v19.0';
const TOKEN  = () => process.env.META_ACCESS_TOKEN;
const IG_ID  = () => process.env.INSTAGRAM_ACCOUNT_ID;

// Publica carrossel no Instagram (máx 10 slides)
async function publicarCarrossel(slides, legendaPrincipal) {
  if (!slides || slides.length < 2) {
    throw new Error('Carrossel precisa de pelo menos 2 slides');
  }

  console.log(`[Carousel] Criando carrossel com ${slides.length} slides`);

  // 1. Gera imagens para cada slide
  const imageUrls = [];
  for (let i = 0; i < slides.length; i++) {
    const nomeArquivo = `carousel_${Date.now()}_slide${i}`;
    const imagePath   = await imageGen.gerarImagem(slides[i].prompt_imagem, nomeArquivo);
    const url         = await uploadTemp(imagePath);
    imageUrls.push(url);
    try { fs.unlinkSync(imagePath); } catch (_) {}
    await sleep(1000);
  }

  // 2. Cria container para cada slide
  const itemIds = [];
  for (const url of imageUrls) {
    const res = await axios.post(`${IG_API}/${IG_ID()}/media`, {
      image_url: url,
      is_carousel_item: true,
      access_token: TOKEN(),
    });
    itemIds.push(res.data.id);
    await sleep(1000);
  }

  // 3. Cria container do carrossel
  const carouselRes = await axios.post(`${IG_API}/${IG_ID()}/media`, {
    media_type: 'CAROUSEL',
    children: itemIds.join(','),
    caption: legendaPrincipal,
    access_token: TOKEN(),
  });

  await sleep(5000);

  // 4. Publica
  await axios.post(`${IG_API}/${IG_ID()}/media_publish`, {
    creation_id: carouselRes.data.id,
    access_token: TOKEN(),
  });

  console.log('[Carousel] Carrossel publicado com sucesso');
}

// Gera estrutura de slides a partir da copy gerada pelo Claude
function parseSlidesFromCopy(copy) {
  if (!copy.slides || !Array.isArray(copy.slides)) return null;
  return copy.slides.map((slide, i) => ({
    texto: slide,
    prompt_imagem: `${copy.prompt_imagem}, slide ${i + 1} of ${copy.slides.length}, mystical dark gold numerology aesthetic`,
  }));
}

async function uploadTemp(localPath) {
  return `https://numerosfera.store/assets/temp/${require('path').basename(localPath)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { publicarCarrossel, parseSlidesFromCopy };
