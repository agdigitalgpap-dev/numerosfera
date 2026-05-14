"""
Rotas de áudio — /api/audio/

POST /api/audio/generate   → gera (ou serve do cache) o MP3 personalizado
GET  /api/audio/preview    → retorna o roteiro em texto (sem gerar áudio)
GET  /api/audio/status     → health check + stats do cache
GET  /api/audio/blocos     → debug: lista status de cada bloco
DELETE /api/audio/cache    → limpa o cache (autenticado por header)
"""

import logging
import time

from fastapi import APIRouter, HTTPException, Header, Query
from fastapi.responses import JSONResponse

from api.config import settings
from api.models.lead import AudioRequest, AudioResponse
from api.services import cache_service, script_engine, tts_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audio", tags=["audio"])


# ── POST /api/audio/generate ──────────────────────────────────────────────────

@router.post("/generate", response_model=AudioResponse, response_model_by_alias=True)
async def generate(req: AudioRequest):
    """
    Recebe os dados do lead, monta o roteiro e retorna a URL do MP3.

    • Se o áudio já existir no cache → retorna imediatamente (cached: true)
    • Se não existir → gera via TTS → salva no cache → retorna URL
    """
    try:
        # 1. Monta o roteiro
        roteiro = script_engine.montar_roteiro(req)
    except (ValueError, RuntimeError) as exc:
        logger.error("Erro no script engine: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc))

    # 2. Checa cache
    cache_key = cache_service.compute_key(roteiro)

    if cache_service.exists(req.tipo, cache_key):
        logger.info("Cache HIT: %s/%s", req.tipo, cache_key)
        return AudioResponse(
            success=True,
            audio_url=cache_service.public_url(req.tipo, cache_key),
            cached=True,
            generation_time=0.0,
            provider="cache",
            script_length=len(roteiro),
        )

    # 3. Gera via TTS
    logger.info("Cache MISS: gerando áudio para '%s' (%s)", req.nome_formatado, req.tipo)
    inicio = time.perf_counter()

    try:
        audio_bytes, provider = await tts_service.gerar(roteiro, sexo=req.sexo)
    except RuntimeError as exc:
        logger.error("TTS falhou: %s", exc)
        raise HTTPException(status_code=503, detail=f"Serviço de voz indisponível: {exc}")

    elapsed = round(time.perf_counter() - inicio, 2)

    # 4. Salva no cache
    cache_service.save(req.tipo, cache_key, audio_bytes)

    return AudioResponse(
        success=True,
        audio_url=cache_service.public_url(req.tipo, cache_key),
        cached=False,
        generation_time=elapsed,
        provider=provider,
        script_length=len(roteiro),
    )


# ── GET /api/audio/preview ────────────────────────────────────────────────────

@router.post("/preview")
async def preview(req: AudioRequest):
    """Retorna o roteiro montado em texto puro, sem gerar áudio. Útil para revisão."""
    try:
        roteiro = script_engine.montar_roteiro(req)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    cache_key = cache_service.compute_key(roteiro)
    return {
        "roteiro": roteiro,
        "cache_key": cache_key,
        "chars": len(roteiro),
        "cached": cache_service.exists(req.tipo, cache_key),
    }


# ── GET /api/audio/blocos ─────────────────────────────────────────────────────

@router.post("/blocos")
async def listar_blocos(req: AudioRequest):
    """Debug: mostra o status de cada bloco para os parâmetros fornecidos."""
    return {"blocos": script_engine.listar_blocos(req)}


# ── GET /api/audio/status ─────────────────────────────────────────────────────

@router.get("/status")
async def status():
    return {
        "ok": True,
        "provedores": tts_service.provedores_disponiveis(),
        "cache": cache_service.stats(),
    }


# ── DELETE /api/audio/cache ───────────────────────────────────────────────────

@router.delete("/cache")
async def limpar_cache(
    tipo: str | None = Query(None, description="'audio1' | 'audio2' | null (todos)"),
    x_admin_key: str = Header(..., alias="x-admin-key"),
):
    """Limpa o cache. Requer header x-admin-key."""
    if not settings.admin_key or x_admin_key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Não autorizado")

    removed = cache_service.clear(tipo)
    return {"removed": removed}
