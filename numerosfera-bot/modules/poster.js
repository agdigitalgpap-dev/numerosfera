const axios      = require('axios');
const research   = require('./research');
const copywriter = require('./copywriter');
const imageGen   = require('./imageGen');
const fs         = require('fs');

const IG_API  = 'https://graph.facebook.com/v19.0';
const TOKEN   = () => process.env.META_ACCESS_TOKEN;
const IG_ID   = () => process.env.INSTAGRAM_ACCOUNT_ID;
const FB_ID   = () => process.env.FACEBOOK_PAGE_ID;

async function publicar(tipo) {
  console.log(`[Poster] Iniciando publicação: ${tipo}`);

  // 1. Pesquisa trending (só para posts virais)
  const contexto = tipo === 'viral' ? await research.buscarTrending() : '';

  // 2. Gera copy via Claude
  const copy = await copywriter.gerarCopy(tipo, contexto);

  // 3. Gera imagem via Leonardo AI
  const nomeArquivo = `${tipo}_${Date.now()}`;
  const imagePath   = await imageGen.gerarImagem(copy.prompt_imagem, nomeArquivo);

  // 4. Faz upload da imagem para servidor acessível (Hostinger)
  const imageUrl = await uploadImagem(imagePath);

  // 5. Publica no Instagram e Facebook em paralelo
  await Promise.allSettled([
    publicarInstagram(imageUrl, copy.legenda_instagram, copy.hashtags),
    publicarFacebook(imagePath, copy.legenda_facebook, copy.hashtags),
  ]);

  // 6. Remove arquivo local após publicação
  try { fs.unlinkSync(imagePath); } catch (_) {}

  console.log(`[Poster] Publicação concluída: ${tipo}`);
}

async function publicarInstagram(imageUrl, legenda, hashtags) {
  try {
    const caption = `${legenda}\n\n${hashtags.map(h => `#${h.replace('#', '')}`).join(' ')}`;

    // Cria container
    const containerRes = await axios.post(`${IG_API}/${IG_ID()}/media`, {
      image_url: imageUrl,
      caption,
      access_token: TOKEN(),
    });

    const containerId = containerRes.data.id;

    // Aguarda processamento
    await sleep(5000);

    // Publica
    await axios.post(`${IG_API}/${IG_ID()}/media_publish`, {
      creation_id: containerId,
      access_token: TOKEN(),
    });

    console.log('[Poster] Instagram: publicado com sucesso');
  } catch (err) {
    console.error('[Poster] Instagram: erro ao publicar:', err.response?.data || err.message);
  }
}

async function publicarFacebook(imagePath, legenda, hashtags) {
  try {
    const caption = `${legenda}\n\n${hashtags.map(h => `#${h.replace('#', '')}`).join(' ')}`;
    const FormData = require('form-data');
    const form = new FormData();
    form.append('source', fs.createReadStream(imagePath));
    form.append('message', caption);
    form.append('access_token', TOKEN());

    await axios.post(`${IG_API}/${FB_ID()}/photos`, form, {
      headers: form.getHeaders(),
      timeout: 30000,
    });

    console.log('[Poster] Facebook: publicado com sucesso');
  } catch (err) {
    console.error('[Poster] Facebook: erro ao publicar:', err.response?.data || err.message);
  }
}

// Upload simples para o Hostinger via SFTP ou URL pública
// Por ora usa link direto do Leonardo (já é URL pública por ~1h)
async function uploadImagem(localPath) {
  // A URL gerada pelo Leonardo é pública temporariamente
  // Para produção, substituir por upload ao Hostinger ou S3
  return `https://numerosfera.store/assets/temp/${require('path').basename(localPath)}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { publicar };
