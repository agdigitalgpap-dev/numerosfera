"""
Cache Service — gerencia armazenamento e reutilização de MP3s gerados.

Estratégia:
  • Chave = MD5 do roteiro final (após injeção de variáveis)
  • Se o bloco copy mudar, o hash muda e um novo áudio é gerado
  • Sem necessidade de limpar manualmente ao atualizar copys
"""

import hashlib
import logging
import os
import time
from pathlib import Path

from api.config import settings

logger = logging.getLogger(__name__)


def _cache_dir(audio_tipo: str) -> Path:
    folder = settings.cache_dir / audio_tipo
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def compute_key(script: str) -> str:
    """Gera hash MD5 de 16 chars a partir do roteiro final."""
    return hashlib.md5(script.encode("utf-8")).hexdigest()[:16]


def get_path(audio_tipo: str, key: str) -> Path:
    return _cache_dir(audio_tipo) / f"{key}.mp3"


def exists(audio_tipo: str, key: str) -> bool:
    if not settings.cache_enabled:
        return False
    path = get_path(audio_tipo, key)
    if not path.exists():
        return False
    # Verifica expiração
    age_days = (time.time() - path.stat().st_mtime) / 86400
    if age_days > settings.cache_max_age_days:
        logger.info("Cache expirado (%d dias): %s", int(age_days), path.name)
        path.unlink(missing_ok=True)
        return False
    return True


def save(audio_tipo: str, key: str, audio_bytes: bytes) -> Path:
    path = get_path(audio_tipo, key)
    with open(path, "wb") as fh:
        fh.write(audio_bytes)
        fh.flush()
        os.fsync(fh.fileno())
    size_kb = len(audio_bytes) / 1024
    logger.info("Cache salvo: %s (%.1f KB)", path.name, size_kb)
    return path


def public_url(audio_tipo: str, key: str) -> str:
    """URL pública servida pelo FastAPI."""
    return f"/cache/{audio_tipo}/{key}.mp3"


def stats() -> dict:
    """Retorna estatísticas do cache para monitoramento."""
    result = {}
    for tipo in ("audio1", "audio2", "audio_full"):
        folder = settings.cache_dir / tipo
        if not folder.exists():
            result[tipo] = {"files": 0, "size_mb": 0}
            continue
        files = list(folder.glob("*.mp3"))
        total_bytes = sum(f.stat().st_size for f in files)
        result[tipo] = {
            "files": len(files),
            "size_mb": round(total_bytes / (1024 * 1024), 2),
        }
    return result


def clear(audio_tipo: str | None = None) -> int:
    """Remove arquivos do cache. Retorna quantidade removida."""
    tipos = [audio_tipo] if audio_tipo else ["audio1", "audio2", "audio_full"]
    removed = 0
    for tipo in tipos:
        folder = settings.cache_dir / tipo
        for f in folder.glob("*.mp3"):
            f.unlink()
            removed += 1
    logger.info("Cache limpo: %d arquivos removidos", removed)
    return removed
