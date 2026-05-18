"""
Envia os PDFs personalizados por email via Resend API.

Remetente: support@numerosfera.store
Requer: RESEND_API_KEY no ambiente
"""
import asyncio
import base64
import logging
import os
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

_RESEND_URL = "https://api.resend.com/emails"
_FROM       = "Astra Numériка <support@numerosfera.store>"

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seu Mapa Hermético chegou</title>
</head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:Georgia,serif;color:#e8dfc8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a1a;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Cabeçalho -->
          <tr>
            <td style="padding:0 0 32px 0;border-bottom:1px solid rgba(184,146,42,0.3);text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:4px;color:#b8922a;text-transform:uppercase;">
                Astrologia Hermética Personalizada
              </p>
            </td>
          </tr>

          <!-- Corpo -->
          <tr>
            <td style="padding:40px 0;">
              <h1 style="margin:0 0 8px 0;font-size:28px;font-weight:normal;color:#e8dfc8;letter-spacing:1px;">
                {nome},
              </h1>
              <p style="margin:0 0 32px 0;font-size:15px;color:rgba(232,223,200,0.7);line-height:1.7;">
                seu Mapa Hermético foi preparado e está pronto.
              </p>

              <p style="margin:0 0 16px 0;font-size:14px;color:rgba(232,223,200,0.85);line-height:1.8;">
                Em anexo você encontrará os 5 documentos do seu sistema completo:
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px 0;">
                <tr><td style="padding:6px 0;font-size:13px;color:#b8922a;">✦</td>
                    <td style="padding:6px 0 6px 12px;font-size:13px;color:rgba(232,223,200,0.85);">Comece por Aqui — instruções de ativação</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#b8922a;">✦</td>
                    <td style="padding:6px 0 6px 12px;font-size:13px;color:rgba(232,223,200,0.85);">Mapa Hermético — sua análise completa</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#b8922a;">✦</td>
                    <td style="padding:6px 0 6px 12px;font-size:13px;color:rgba(232,223,200,0.85);">Bônus 1 — Vidas Passadas</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#b8922a;">✦</td>
                    <td style="padding:6px 0 6px 12px;font-size:13px;color:rgba(232,223,200,0.85);">Bônus 2 — Biblioteca de Emergências</td></tr>
                <tr><td style="padding:6px 0;font-size:13px;color:#b8922a;">✦</td>
                    <td style="padding:6px 0 6px 12px;font-size:13px;color:rgba(232,223,200,0.85);">Bônus 3 — Áudio de Potencialização</td></tr>
              </table>

              <p style="margin:0 0 12px 0;font-size:14px;color:rgba(232,223,200,0.7);line-height:1.8;">
                Comece pelo documento <em>Comece por Aqui</em> — ele contém as instruções
                para ativar corretamente cada parte do seu sistema.
              </p>
              <p style="margin:0;font-size:14px;color:rgba(232,223,200,0.7);line-height:1.8;">
                O campo já foi configurado. O que acontece a seguir depende de como
                você usa o que está nesses documentos.
              </p>
            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td style="padding:32px 0 0 0;border-top:1px solid rgba(184,146,42,0.2);text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:2px;color:rgba(184,146,42,0.5);text-transform:uppercase;">
                Astrologia Hermética Personalizada
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


async def enviar_pdfs(
    destinatario_email: str,
    destinatario_nome: str,
    pdf_paths: list[Path],
) -> None:
    """
    Envia os PDFs para o cliente via Resend.
    Raises RuntimeError se falhar após 2 tentativas.
    """
    api_key = os.getenv("RESEND_API_KEY", "")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY não configurada — emails não podem ser enviados")

    nome_display = destinatario_nome.strip() or "Cliente"
    html_body = _HTML_TEMPLATE.format(nome=nome_display)

    attachments = []
    for p in pdf_paths:
        try:
            data = base64.b64encode(p.read_bytes()).decode()
            attachments.append({"filename": p.name, "content": data})
        except Exception as exc:
            logger.warning("[Email] Falha ao ler %s: %s", p.name, exc)

    payload = {
        "from":        _FROM,
        "to":          [destinatario_email],
        "subject":     f"{nome_display}, seu Mapa Hermético está aqui",
        "html":        html_body,
        "attachments": attachments,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=60.0) as client:
        for attempt in range(1, 3):
            try:
                resp = await client.post(_RESEND_URL, json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    data_resp = resp.json()
                    logger.info("[Email] Enviado com sucesso → id=%s para=%s",
                                data_resp.get("id"), destinatario_email)
                    return
                logger.warning("[Email] Tentativa %d falhou: %d %s",
                               attempt, resp.status_code, resp.text[:200])
                last_error = RuntimeError(f"Resend retornou {resp.status_code}: {resp.text[:200]}")
            except httpx.RequestError as exc:
                logger.warning("[Email] Tentativa %d — erro de rede: %s", attempt, exc)
                last_error = exc

            if attempt < 2:
                await asyncio.sleep(3)

    raise RuntimeError(f"Falha ao enviar email após 2 tentativas: {last_error}")
