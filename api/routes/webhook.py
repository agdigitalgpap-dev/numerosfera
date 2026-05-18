"""
Rotas de webhook e registro de leads.

POST /api/webhooks/kiwify  — recebe confirmação de compra e envia PDFs
POST /api/leads/register   — armazena dados do quiz antes da compra
"""
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, EmailStr

from api.services import email_service, lead_store, pdf_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


# ── Schemas ───────────────────────────────────────────────────────────────────

class LeadData(BaseModel):
    email: str
    nome:  str
    signo: str
    sexo:  str = "feminino"
    dor:   str = "financas"


# ── Leads ─────────────────────────────────────────────────────────────────────

@router.post("/leads/register", status_code=201)
async def register_lead(data: LeadData):
    """Salva dados do quiz para uso posterior no webhook de compra."""
    lead_store.save(data.email, data.model_dump())
    logger.info("[Lead] Registrado: %s", data.email)
    return {"ok": True}


# ── Kiwify webhook ────────────────────────────────────────────────────────────

@router.post("/webhooks/kiwify")
async def kiwify_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Recebe evento de compra da Kiwify.
    Processa em background para responder em < 5 s e evitar timeout da Kiwify.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    logger.info("[Kiwify] Payload recebido: event=%s", body.get("event") or body.get("status"))

    # Kiwify envia event=PURCHASE_APPROVED ou order.status=paid
    event  = (body.get("event") or "").upper()
    status = (body.get("order", {}) or {}).get("status", "")

    if event not in ("PURCHASE_APPROVED", "PURCHASE_COMPLETE") and status != "paid":
        logger.info("[Kiwify] Evento ignorado: event=%s status=%s", event, status)
        return {"ok": True, "ignored": True}

    # Extrai dados do cliente
    customer = body.get("customer") or body.get("Customer") or {}
    email = (customer.get("email") or "").strip().lower()
    nome  = (customer.get("name")  or customer.get("full_name") or "Cliente").strip()

    if not email:
        logger.warning("[Kiwify] Email ausente no payload")
        raise HTTPException(status_code=422, detail="Email do cliente não encontrado no payload")

    # Recupera dados do quiz (signo, sexo, dor)
    lead = lead_store.get(email)
    if lead is None:
        logger.warning("[Kiwify] Lead não encontrado para %s — usando defaults", email)
        lead = {"email": email, "nome": nome, "signo": "Virgem", "sexo": "feminino", "dor": "financas"}
    else:
        # Garante que o nome da Kiwify tem prioridade (mais confiável)
        lead = {**lead, "nome": nome or lead.get("nome", "Cliente")}

    logger.info("[Kiwify] Compra aprovada → processando para %s (%s)", email, nome)
    background_tasks.add_task(_processar_compra, email, lead)
    return {"ok": True}


# ── Processamento em background ───────────────────────────────────────────────

async def _processar_compra(email: str, lead: dict) -> None:
    """Gera PDFs e envia por email. Executado em background task."""
    nome = lead.get("nome", "Cliente")
    pdf_paths = []
    try:
        logger.info("[Compra] Iniciando geração de PDFs para %s", email)
        pdf_paths = await pdf_service.gerar_todos(lead)

        logger.info("[Compra] Enviando %d PDFs para %s", len(pdf_paths), email)
        await email_service.enviar_pdfs(email, nome, pdf_paths)

        logger.info("[Compra] Concluído com sucesso para %s", email)
        lead_store.delete(email)

    except Exception as exc:
        logger.error("[Compra] ERRO para %s: %s", email, exc, exc_info=True)
    finally:
        pdf_service.limpar(pdf_paths)
