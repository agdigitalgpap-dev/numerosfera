"""
ASTRANUMERICA — Audio Personalization API
FastAPI app principal.

Endpoints:
  POST /api/audio/generate   → gera MP3 personalizado
  POST /api/audio/preview    → retorna roteiro em texto
  POST /api/audio/blocos     → debug de blocos
  GET  /api/audio/status     → health check + stats
  DELETE /api/audio/cache    → limpa cache

Arquivos estáticos:
  /cache/audio1/{hash}.mp3   → MP3s gerados (servidos diretamente)
  /cache/audio2/{hash}.mp3
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.config import settings
from api.routes.audio import router as audio_router

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("astranumerica")


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.cache_dir.mkdir(parents=True, exist_ok=True)
    (settings.cache_dir / "audio1").mkdir(exist_ok=True)
    (settings.cache_dir / "audio2").mkdir(exist_ok=True)
    (settings.cache_dir / "audio_full").mkdir(exist_ok=True)
    logger.info("✓ Pastas de cache prontas : %s", settings.cache_dir)
    logger.info("✓ Blocos em              : %s", settings.blocks_dir)
    logger.info("✓ TTS provider           : %s", settings.tts_provider)
    logger.info("✓ ElevenLabs key         : %s…", settings.elevenlabs_api_key[:8] if settings.elevenlabs_api_key else "NÃO CONFIGURADA")
    logger.info("✓ ElevenLabs voice_id    : %s", settings.elevenlabs_voice_id)
    logger.info("✓ ElevenLabs model       : %s", settings.elevenlabs_model)
    logger.info("✓ ElevenLabs speed=%.2f  style=%.2f  stability=%.2f  similarity=%.2f",
                settings.elevenlabs_speed, settings.elevenlabs_style,
                settings.elevenlabs_stability, settings.elevenlabs_similarity_boost)
    logger.info("✓ Admin key              : %s", "configurada" if settings.admin_key else "NÃO CONFIGURADA ⚠")
    yield
    logger.info("Server encerrado.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ASTRANUMERICA Audio API",
    version="1.0.0",
    description="Geração dinâmica de áudios personalizados com cache inteligente.",
    lifespan=lifespan,
)

# CORS — permite chamadas do frontend local e de produção
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "null",                     # file:// (abrir HTML direto no browser)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas da API
app.include_router(audio_router)

# Serve os MP3s do cache como arquivos estáticos
app.mount(
    "/cache",
    StaticFiles(directory=str(settings.cache_dir)),
    name="cache",
)


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "app": "ASTRANUMERICA Audio API",
        "version": "1.0.0",
        "docs": "/docs",
        "status": "/api/audio/status",
    }
