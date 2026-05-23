const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const LEONARDO_URL = 'https://cloud.leonardo.ai/api/rest/v1';

async function gerarImagem(promptTexto, nomeArquivo) {
  // 1. Inicia geração
  const geracaoRes = await axios.post(`${LEONARDO_URL}/generations`, {
    prompt: promptTexto,
    modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876', // Leonardo Diffusion XL
    width: 1080,
    height: 1080,
    num_images: 1,
    guidance_scale: 7,
    negative_prompt: 'blurry, low quality, watermark, text, ugly, deformed',
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.LEONARDO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const generationId = geracaoRes.data.sdGenerationJob.generationId;
  console.log(`[ImageGen] Geração iniciada: ${generationId}`);

  // 2. Aguarda conclusão (polling)
  let imageUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const statusRes = await axios.get(`${LEONARDO_URL}/generations/${generationId}`, {
      headers: { 'Authorization': `Bearer ${process.env.LEONARDO_API_KEY}` },
    });

    const gen = statusRes.data.generations_by_pk;
    if (gen?.status === 'COMPLETE' && gen.generated_images?.length > 0) {
      imageUrl = gen.generated_images[0].url;
      break;
    }
  }

  if (!imageUrl) throw new Error('Leonardo AI não retornou imagem no tempo esperado');

  // 3. Faz download da imagem
  const outputPath = path.join(__dirname, '..', 'criativos', `${nomeArquivo}.jpg`);
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  fs.writeFileSync(outputPath, imgRes.data);

  console.log(`[ImageGen] Imagem salva: ${outputPath}`);
  return outputPath;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { gerarImagem };
