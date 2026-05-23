const fs           = require('fs');
const path         = require('path');
const axios        = require('axios');
const ffmpeg       = require('fluent-ffmpeg');
const AssemblyAI   = require('assemblyai');
const { ElevenLabsClient } = require('elevenlabs');

const IG_API = 'https://graph.facebook.com/v19.0';
const TOKEN  = () => process.env.META_ACCESS_TOKEN;
const IG_ID  = () => process.env.INSTAGRAM_ACCOUNT_ID;
const FB_ID  = () => process.env.FACEBOOK_PAGE_ID;

const assemblyClient   = new AssemblyAI.AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
const elevenLabsClient = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

const CTAS_ORGANICAS = [
  'Comenta aqui embaixo o que você sentiu.',
  'Salva esse vídeo para não esquecer.',
  'Compartilha com alguém que precisa ouvir isso.',
  'Me conta nos comentários qual número te identificou.',
  'Salva e revê isso amanhã de manhã.',
];

// Fluxo completo: criativo de ads → versão orgânica para Reels
async function processarCriativo(nomeArquivo) {
  const inputPath = path.join(__dirname, '..', 'criativos', nomeArquivo);
  if (!fs.existsSync(inputPath)) throw new Error(`Arquivo não encontrado: ${inputPath}`);

  console.log(`[VideoEditor] Processando: ${nomeArquivo}`);

  // 1. AssemblyAI detecta onde começa o CTA final
  const ponteDeCorte = await detectarPonteDeCorte(inputPath);
  console.log(`[VideoEditor] Ponto de corte detectado: ${ponteDeCorte}s`);

  // 2. FFmpeg corta o vídeo
  const videoCortadoPath = inputPath.replace('.mp4', '_cortado.mp4');
  await cortarVideo(inputPath, ponteDeCorte, videoCortadoPath);

  // 3. Gera novo CTA com ElevenLabs
  const ctaTexto  = CTAS_ORGANICAS[Math.floor(Math.random() * CTAS_ORGANICAS.length)];
  const ctaAudio  = inputPath.replace('.mp4', '_cta.mp3');
  await gerarAudioCTA(ctaTexto, ctaAudio);

  // 4. Gera legendas com Whisper (via AssemblyAI)
  const legendaPath = inputPath.replace('.mp4', '.srt');
  await gerarLegendas(videoCortadoPath, legendaPath);

  // 5. FFmpeg une tudo: vídeo + novo áudio + legendas queimadas
  const outputPath = inputPath.replace('.mp4', '_organico.mp4');
  await unirVideoAudioLegenda(videoCortadoPath, ctaAudio, legendaPath, outputPath);

  // 6. Publica no Instagram como Reel + Facebook como vídeo nativo
  await publicarReel(outputPath, ctaTexto);

  // 7. Limpa arquivos temporários
  [videoCortadoPath, ctaAudio, legendaPath].forEach(f => {
    try { fs.unlinkSync(f); } catch (_) {}
  });

  console.log(`[VideoEditor] Processamento concluído: ${outputPath}`);
  return outputPath;
}

// AssemblyAI analisa o áudio e detecta onde começa o CTA final
async function detectarPonteDeCorte(videoPath) {
  const transcript = await assemblyClient.transcripts.transcribe({
    audio: videoPath,
    language_code: 'pt',
  });

  const frasesCta = ['clique abaixo', 'saiba mais', 'acesse o link', 'clique no link', 'botão abaixo'];
  const duracao   = transcript.words?.at(-1)?.end / 1000 || 60;

  for (const palavra of (transcript.words || []).reverse()) {
    const texto = palavra.text.toLowerCase();
    if (frasesCta.some(f => texto.includes(f))) {
      return Math.max((palavra.start / 1000) - 0.5, 0);
    }
  }

  // Se não encontrar CTA explícito, corta nos últimos 8 segundos
  return Math.max(duracao - 8, 0);
}

function cortarVideo(input, duracao, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setDuration(duracao)
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function gerarAudioCTA(texto, outputPath) {
  const audio = await elevenLabsClient.generate({
    voice: process.env.ELEVENLABS_VOICE_ID,
    text: texto,
    model_id: 'eleven_flash_v2_5',
  });

  const chunks = [];
  for await (const chunk of audio) chunks.push(chunk);
  fs.writeFileSync(outputPath, Buffer.concat(chunks));
  console.log(`[VideoEditor] Áudio CTA gerado: ${texto}`);
}

async function gerarLegendas(videoPath, srtPath) {
  const transcript = await assemblyClient.transcripts.transcribe({
    audio: videoPath,
    language_code: 'pt',
  });

  // Converte para formato SRT
  let srt = '';
  (transcript.words || []).forEach((w, i) => {
    srt += `${i + 1}\n`;
    srt += `${formatarTempo(w.start)} --> ${formatarTempo(w.end)}\n`;
    srt += `${w.text}\n\n`;
  });

  fs.writeFileSync(srtPath, srt);
}

function formatarTempo(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  const ms2 = (ms % 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms2}`;
}

function unirVideoAudioLegenda(videoPath, audioPath, srtPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .input(audioPath)
      .complexFilter([
        '[0:a][1:a]amix=inputs=2:duration=longest[aout]',
        `subtitles=${srtPath}:force_style='FontSize=18,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2'`,
      ])
      .outputOptions(['-map 0:v', '-map [aout]', '-c:v libx264', '-c:a aac', '-shortest'])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function publicarReel(videoPath, legenda) {
  try {
    const videoUrl = `https://numerosfera.store/assets/temp/${path.basename(videoPath)}`;
    const hashtags = '#numerologia #espiritualidade #autoconhecimento #numerosfera #mapanumerologico';
    const caption  = `${legenda}\n\n${hashtags}`;

    // Instagram Reel
    const containerRes = await axios.post(`${IG_API}/${IG_ID()}/media`, {
      video_url: videoUrl,
      media_type: 'REELS',
      caption,
      access_token: TOKEN(),
    });

    await sleep(15000); // vídeos precisam de mais tempo para processar

    await axios.post(`${IG_API}/${IG_ID()}/media_publish`, {
      creation_id: containerRes.data.id,
      access_token: TOKEN(),
    });

    console.log('[VideoEditor] Reel publicado no Instagram');
  } catch (err) {
    console.error('[VideoEditor] Erro ao publicar Reel:', err.response?.data || err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { processarCriativo };
