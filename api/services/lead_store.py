"""
Armazenamento de dados do lead (quiz) em memória + arquivo JSON.

Fluxo:
  1. Quiz completo → POST /api/leads/register → save(email, dados)
  2. Compra confirmada → GET /api/webhooks/kiwify → get(email) → gera PDFs

Os dados ficam em /tmp/numerosfera_leads.json.
Em Railway, o filesystem é efêmero, mas a janela quiz→compra é de minutos/horas,
então é suficiente. Para persistência entre deploys, usar um Redis ou banco externo.
"""
import json
import logging
import os
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

_STORE_PATH = Path("/tmp/numerosfera_leads.json")
_store: dict[str, dict] = {}
_lock = threading.Lock()


def _load() -> None:
    global _store
    try:
        _store = json.loads(_STORE_PATH.read_text())
        logger.info("Lead store carregado: %d leads", len(_store))
    except (FileNotFoundError, json.JSONDecodeError):
        _store = {}


def _flush() -> None:
    try:
        _STORE_PATH.write_text(json.dumps(_store))
    except Exception as exc:
        logger.warning("Falha ao persistir lead store: %s", exc)


_load()


def save(email: str, data: dict) -> None:
    """Salva ou atualiza dados do lead."""
    with _lock:
        _store[email.lower().strip()] = data
        _flush()
    logger.info("Lead salvo: %s", email)


def get(email: str) -> dict | None:
    """Retorna dados do lead pelo email, ou None se não encontrado."""
    with _lock:
        return _store.get(email.lower().strip())


def delete(email: str) -> None:
    """Remove lead do store."""
    with _lock:
        _store.pop(email.lower().strip(), None)
        _flush()
