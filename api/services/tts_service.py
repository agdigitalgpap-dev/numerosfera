"""
TTS Service — abstração sobre provedores de Text-to-Speech.

Provedor principal : ElevenLabs  (qualidade máxima, Português nativo)
Provedor fallback  : OpenAI TTS  (custo menor, qualidade muito boa)

Chunking automático para ElevenLabs:
  Textos longos causam "voice drift" no eleven_multilingual_v2 — a voz
  suaviza progressivamente porque o modelo acumula contexto emocional.
  A solução é dividir o texto em segmentos de ≤900 chars em limites de
  parágrafo/sentença e gerar cada um independentemente. Cada chamada
  começa com o estado de voz zerado. Os bytes MP3 são concatenados,
  removendo os cabeçalhos ID3 dos chunks intermediários para que o
  player receba um stream contíguo e válido.
"""

import asyncio
import logging
import re
import shutil
import subprocess
from typing import Literal

from api.config import settings

logger = logging.getLogger(__name__)

Provider = Literal["elevenlabs", "openai"]

# Tamanho máximo de cada chunk (chars). Abaixo de 1000 evita voice drift
# sem fragmentar demais o áudio (pausas naturais entre blocos).
_CHUNK_MAX = 450


# ── Utilitários de texto ──────────────────────────────────────────────────────

def _split_text(texto: str, max_chars: int = _CHUNK_MAX) -> list[str]:
    """
    Divide o roteiro em segmentos ≤ max_chars respeitando parágrafos e frases.
    Cada segmento será gerado numa chamada TTS independente.
    """
    # Divide nos blocos delimitados por linha em branco
    paragrafos = [p.strip() for p in re.split(r'\n\s*\n', texto) if p.strip()]

    chunks: list[str] = []
    atual: str = ""

    for para in paragrafos:
        if len(para) > max_chars:
            # Parágrafo longo → dividir em frases
            frases = re.split(r'(?<=[.!?…])\s+', para)
            for frase in frases:
                candidato = (atual + "\n\n" + frase).strip() if atual else frase
                if len(candidato) > max_chars and atual:
                    chunks.append(atual)
                    atual = frase
                else:
                    atual = candidato
        else:
            candidato = (atual + "\n\n" + para).strip() if atual else para
            if len(candidato) > max_chars and atual:
                chunks.append(atual)
                atual = para
            else:
                atual = candidato

    if atual:
        chunks.append(atual)

    return chunks if chunks else [texto]


def _strip_id3v2(data: bytes) -> bytes:
    """Remove cabeçalho ID3v2 do início dos bytes MP3."""
    if len(data) >= 10 and data[:3] == b"ID3":
        # Tamanho em integers sincsafe (7 bits por byte)
        sz = (
            (data[6] & 0x7F) << 21
            | (data[7] & 0x7F) << 14
            | (data[8] & 0x7F) << 7
            | (data[9] & 0x7F)
        )
        return data[10 + sz :]
    return data


def _strip_id3v1(data: bytes) -> bytes:
    """Remove tag ID3v1 (128 bytes) do final dos bytes MP3."""
    if len(data) >= 128 and data[-128:-125] == b"TAG":
        return data[:-128]
    return data


def _concat_mp3_chunks(parts: list[bytes]) -> bytes:
    """
    Concatena chunks MP3 de forma limpa:
    - Mantém ID3 do primeiro chunk (contém metadados do arquivo)
    - Remove ID3v2/v1 dos demais para evitar cabeçalhos duplicados no stream
    """
    if not parts:
        return b""
    if len(parts) == 1:
        return parts[0]

    result = parts[0]  # primeiro chunk: ID3 intacto
    for part in parts[1:]:
        result += _strip_id3v1(_strip_id3v2(part))
    return result


# ── Pós-processamento: loudnorm via ffmpeg ────────────────────────────────────

def _loudnorm(audio_bytes: bytes) -> bytes:
    """Normaliza volume via ffmpeg loudnorm usando pipes. Passthrough silencioso se indisponível."""
    if not shutil.which("ffmpeg"):
        return audio_bytes
    try:
        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", "pipe:0",
                "-af", "loudnorm=I=-14:LRA=3:TP=-2",
                "-ar", "44100", "-ac", "1",
                "-f", "mp3", "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
            timeout=60,
        )
        if result.returncode != 0 or not result.stdout:
            logger.warning("loudnorm retornou código %d — retornando áudio original", result.returncode)
            return audio_bytes
        return result.stdout
    except Exception as exc:
        logger.warning("loudnorm falhou (%s) — retornando áudio original", exc)
        return audio_bytes


# ── ElevenLabs ────────────────────────────────────────────────────────────────

def _elevenlabs_sync(texto: str) -> bytes:
    """Gera um único segmento de áudio (síncrono — roda em thread pool)."""
    from elevenlabs.client import ElevenLabs
    from elevenlabs import VoiceSettings

    logger.info(
        "[TTS] ElevenLabs  voice=%s  model=%s  stability=%.2f  similarity=%.2f"
        "  style=%.2f  speed=%.2f  speaker_boost=%s  chars=%d",
        settings.elevenlabs_voice_id,
        settings.elevenlabs_model,
        settings.elevenlabs_stability,
        settings.elevenlabs_similarity_boost,
        settings.elevenlabs_style,
        settings.elevenlabs_speed,
        settings.elevenlabs_speaker_boost,
        len(texto),
    )

    voice_settings = VoiceSettings(
        stability=settings.elevenlabs_stability,
        similarity_boost=settings.elevenlabs_similarity_boost,
        style=settings.elevenlabs_style,
        use_speaker_boost=settings.elevenlabs_speaker_boost,
        speed=settings.elevenlabs_speed,
    )

    client = ElevenLabs(api_key=settings.elevenlabs_api_key)
    audio_iter = client.text_to_speech.convert(
        text=texto,
        voice_id=settings.elevenlabs_voice_id,
        model_id=settings.elevenlabs_model,
        output_format=settings.elevenlabs_output_format,
        voice_settings=voice_settings,
    )
    chunks = list(audio_iter) if not isinstance(audio_iter, bytes) else [audio_iter]
    return b"".join(chunks)


async def _gerar_elevenlabs(texto: str) -> bytes:
    """
    Gera áudio ElevenLabs com chunking automático para evitar voice drift.

    Textos > _CHUNK_MAX chars são divididos em segmentos independentes.
    Cada segmento começa com o estado de voz zerado no modelo — elimina
    o problema de volume/tom caindo progressivamente em audios longos.
    """
    segmentos = _split_text(texto)
    n = len(segmentos)
    logger.info("[TTS] %d segmento(s) para geração  (total %d chars)", n, len(texto))

    partes: list[bytes] = []
    for i, seg in enumerate(segmentos):
        logger.info("[TTS] Gerando segmento %d/%d (%d chars)", i + 1, n, len(seg))
        parte = await asyncio.to_thread(_elevenlabs_sync, seg)
        partes.append(parte)

    audio = _concat_mp3_chunks(partes)

    # Loudnorm opcional (passthrough se ffmpeg não disponível)
    audio = await asyncio.to_thread(_loudnorm, audio)
    return audio


# ── OpenAI TTS ────────────────────────────────────────────────────────────────

async def _gerar_openai(texto: str, sexo: str = "feminino") -> bytes:
    import openai

    voice = (
        settings.openai_voice_masculine
        if sexo == "masculino"
        else settings.openai_voice_feminine
    )

    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    response = await client.audio.speech.create(
        model=settings.openai_tts_model,
        voice=voice,
        input=texto,
        response_format="mp3",
        speed=settings.openai_tts_speed,
    )
    return response.content


# ── Interface pública ─────────────────────────────────────────────────────────

async def gerar(
    texto: str,
    sexo: str = "feminino",
    provider: Provider | None = None,
) -> tuple[bytes, Provider]:
    """
    Gera áudio a partir de texto.
    Retorna (audio_bytes, provider_usado).
    Tenta o provedor principal; em falha, usa o fallback automaticamente.
    """
    provedor = provider or settings.tts_provider

    try:
        if provedor == "elevenlabs":
            if not settings.elevenlabs_api_key:
                raise RuntimeError("ELEVENLABS_API_KEY não configurada")
            audio = await _gerar_elevenlabs(texto)
            return audio, "elevenlabs"

        if provedor == "openai":
            if not settings.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY não configurada")
            voice = settings.openai_voice_masculine if sexo == "masculino" else settings.openai_voice_feminine
            logger.info("[TTS] OpenAI  voice=%s  sexo=%s  chars=%d", voice, sexo, len(texto))
            audio = await _gerar_openai(texto, sexo)
            return audio, "openai"

        raise ValueError(f"Provedor desconhecido: '{provedor}'")

    except Exception as exc:
        fallback = "openai" if provedor == "elevenlabs" else "elevenlabs"
        logger.warning("[TTS] %s falhou: %s — tentando fallback %s", provedor, exc, fallback)

        if fallback == "openai" and settings.openai_api_key:
            audio = await _gerar_openai(texto, sexo)
            return audio, "openai"

        if fallback == "elevenlabs" and settings.elevenlabs_api_key:
            audio = await _gerar_elevenlabs(texto)
            return audio, "elevenlabs"

        raise RuntimeError(
            f"Todos os provedores TTS falharam. Último erro: {exc}"
        ) from exc


def provedores_disponiveis() -> list[Provider]:
    disponiveis: list[Provider] = []
    if settings.elevenlabs_api_key:
        disponiveis.append("elevenlabs")
    if settings.openai_api_key:
        disponiveis.append("openai")
    return disponiveis
