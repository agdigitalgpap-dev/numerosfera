"""
Rotas de analytics — /api/analytics/

POST /api/analytics/event   → registra um evento do funil
GET  /api/analytics/stats   → retorna métricas agregadas (requer admin key)
"""

import json
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from api.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])

_ANALYTICS_DIR  = settings.base_dir / "analytics"
_EVENTS_FILE    = _ANALYTICS_DIR / "events.jsonl"

_FUNNEL_STEPS = [
    "quiz_start",
    "quiz_complete",
    "palm_start",
    "palm_capture",
    "audio1_start",
    "audio1_complete",
    "email_shown",
    "email_captured",
    "audio2_start",
    "audio2_complete",
    "vsl_start",
    "vsl_cta_click",
    "purchase_complete",
]

_STEP_LABELS = {
    "quiz_start":       "Quiz aberto",
    "quiz_complete":    "Quiz completo",
    "palm_start":       "Palma aberta",
    "palm_capture":     "Palma capturada",
    "audio1_start":     "Áudio 1 iniciado",
    "audio1_complete":  "Áudio 1 completo",
    "email_shown":      "Overlay e-mail exibido",
    "email_captured":   "E-mail capturado",
    "audio2_start":     "Áudio 2 iniciado",
    "audio2_complete":  "Áudio 2 completo",
    "vsl_start":        "VSL aberta",
    "vsl_cta_click":    "VSL — clicou assistir",
    "purchase_complete": "Compra confirmada",
}


class EventPayload(BaseModel):
    event:      str
    session_id: str
    nome:       str | None = None
    tipo:       str | None = None   # área de vida: financas, amor, saude, familia
    page:       str | None = None


def _ensure_dir():
    _ANALYTICS_DIR.mkdir(parents=True, exist_ok=True)


def _append_event(ev: dict):
    _ensure_dir()
    with _EVENTS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")


def _read_events(days: int = 90) -> list[dict]:
    if not _EVENTS_FILE.exists():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    events = []
    with _EVENTS_FILE.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
                ts = datetime.fromisoformat(ev.get("ts", "1970-01-01T00:00:00+00:00"))
                if ts >= cutoff:
                    events.append(ev)
            except Exception:
                pass
    return events


# ── POST /api/analytics/event ─────────────────────────────────────────────────

@router.post("/event", status_code=204)
async def track_event(payload: EventPayload):
    ev = {
        "event":      payload.event,
        "session_id": payload.session_id,
        "ts":         datetime.now(timezone.utc).isoformat(),
        "nome":       payload.nome,
        "tipo":       payload.tipo,
        "page":       payload.page,
    }
    _append_event(ev)
    logger.debug("[ANALYTICS] %s  session=%s", payload.event, payload.session_id[:8])
    return


# ── GET /api/analytics/stats ──────────────────────────────────────────────────

@router.get("/stats")
async def stats(x_admin_key: str = Header(..., alias="x-admin-key")):
    if not settings.admin_key or x_admin_key != settings.admin_key:
        raise HTTPException(status_code=403, detail="Não autorizado")

    events_all  = _read_events(days=90)
    events_7d   = [e for e in events_all if
                   datetime.fromisoformat(e["ts"]) >=
                   datetime.now(timezone.utc) - timedelta(days=7)]

    # ── Funil (sessões únicas por etapa) ──────────────────────────────────────
    def _funnel(evs: list[dict]) -> list[dict]:
        sessions_per_step: dict[str, set] = defaultdict(set)
        for ev in evs:
            sessions_per_step[ev["event"]].add(ev["session_id"])
        result = []
        for step in _FUNNEL_STEPS:
            count = len(sessions_per_step.get(step, set()))
            result.append({"step": step, "label": _STEP_LABELS[step], "count": count})
        return result

    funnel_all = _funnel(events_all)
    funnel_7d  = _funnel(events_7d)

    # ── Conversão entre etapas ────────────────────────────────────────────────
    def _conversion(funnel: list[dict]) -> list[dict]:
        out = []
        for i in range(1, len(funnel)):
            prev = funnel[i - 1]["count"]
            cur  = funnel[i]["count"]
            pct  = round(cur / prev * 100, 1) if prev > 0 else 0.0
            out.append({
                "from":  funnel[i - 1]["step"],
                "to":    funnel[i]["step"],
                "pct":   pct,
            })
        return out

    # ── Leads recentes ────────────────────────────────────────────────────────
    seen_sessions: set = set()
    recent_leads  = []
    for ev in reversed(events_all):
        if ev.get("nome") and ev["session_id"] not in seen_sessions:
            seen_sessions.add(ev["session_id"])
            recent_leads.append({
                "nome":  ev["nome"],
                "tipo":  ev.get("tipo"),
                "event": ev["event"],
                "ts":    ev["ts"],
            })
            if len(recent_leads) >= 30:
                break

    # ── Por dia (últimos 14 dias) ─────────────────────────────────────────────
    daily: dict[str, int] = defaultdict(int)
    cutoff_14 = datetime.now(timezone.utc) - timedelta(days=14)
    for ev in events_all:
        if ev["event"] == "quiz_start":
            ts = datetime.fromisoformat(ev["ts"])
            if ts >= cutoff_14:
                day = ts.strftime("%d/%m")
                daily[day] += 1

    return {
        "funnel_all":    funnel_all,
        "funnel_7d":     funnel_7d,
        "conversion_7d": _conversion(funnel_7d),
        "recent_leads":  recent_leads,
        "daily_starts":  dict(daily),
        "total_events":  len(events_all),
    }
