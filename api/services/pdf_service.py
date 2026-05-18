"""
Gera os PDFs personalizados chamando generate-pdf.js via subprocesso Node.js.

Retorna lista de Path para os PDFs gerados em diretório temporário.
Após o envio por email, chame limpar() para apagar os temporários.
"""
import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Localização do gerador de PDFs relativa a este repo
_PDF_DIR    = Path(__file__).resolve().parent.parent.parent / "astranumerica-pdfs"
_NODE_SCRIPT = str(_PDF_DIR / "generate-pdf.js")

# Signo: slug → display (para o --signo do CLI)
_SIGNO_DISPLAY: dict[str, str] = {
    "aries":       "Áries",
    "touro":       "Touro",
    "gemeos":      "Gêmeos",
    "cancer":      "Câncer",
    "leao":        "Leão",
    "virgem":      "Virgem",
    "libra":       "Libra",
    "escorpiao":   "Escorpião",
    "sagitario":   "Sagitário",
    "capricornio": "Capricórnio",
    "aquario":     "Aquário",
    "peixes":      "Peixes",
}

# Dor: normaliza para os valores aceitos pelo gerador
_DOR_PDF: dict[str, str] = {
    "financas":     "financas",
    "finanças":     "financas",
    "amor":         "amor",
    "vida-amorosa": "amor",
    "saude":        "saude",
    "saúde":        "saude",
    "felicidade":   "saude",  # fallback
    "familia":      "saude",  # fallback
    "família":      "saude",
}


async def gerar_todos(lead: dict) -> list[Path]:
    """
    Executa generate-pdf.js e retorna os caminhos dos 5 PDFs gerados.
    Raises RuntimeError se a geração falhar.
    """
    nome  = _nome_formatado(lead.get("nome", "Cliente"))
    signo = _resolver_signo(lead.get("signo", "Virgem"))
    sexo  = lead.get("sexo", "feminino").lower().strip()
    dor   = _DOR_PDF.get(lead.get("dor", "financas").lower().strip(), "financas")

    # Diretório temporário exclusivo por geração
    tmp_dir = Path(tempfile.mkdtemp(prefix="numerosfera_pdfs_"))

    cmd = [
        "node", _NODE_SCRIPT,
        "--nome",  nome,
        "--signo", signo,
        "--sexo",  sexo,
        "--dor",   dor,
        "--out",   str(tmp_dir),
    ]

    logger.info("[PDF] Iniciando geração | nome=%s signo=%s sexo=%s dor=%s", nome, signo, sexo, dor)
    logger.info("[PDF] Comando: %s", " ".join(cmd))

    env = {
        **os.environ,
        # Garante que Puppeteer usa Chromium do sistema no container
        "PUPPETEER_EXECUTABLE_PATH": os.getenv("PUPPETEER_EXECUTABLE_PATH", ""),
        "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD": "true",
    }

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(_PDF_DIR),
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
    except asyncio.TimeoutError:
        raise RuntimeError("Timeout (5 min) ao gerar PDFs — Puppeteer demorou demais")

    stdout_txt = stdout.decode(errors="replace")
    stderr_txt = stderr.decode(errors="replace")

    if stdout_txt:
        logger.info("[PDF] stdout:\n%s", stdout_txt)
    if stderr_txt:
        logger.warning("[PDF] stderr:\n%s", stderr_txt)

    if proc.returncode != 0:
        raise RuntimeError(
            f"generate-pdf.js falhou com código {proc.returncode}.\n"
            f"stderr: {stderr_txt[:500]}"
        )

    pdfs = sorted(tmp_dir.glob("*.pdf"))
    if not pdfs:
        raise RuntimeError("Nenhum PDF foi gerado no diretório temporário")

    logger.info("[PDF] %d PDFs gerados em %s", len(pdfs), tmp_dir)
    return pdfs


def limpar(pdf_paths: list[Path]) -> None:
    """Remove o diretório temporário com todos os PDFs gerados."""
    if not pdf_paths:
        return
    try:
        tmp_dir = pdf_paths[0].parent
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.info("[PDF] Temporários removidos: %s", tmp_dir)
    except Exception as exc:
        logger.warning("[PDF] Erro ao limpar temporários: %s", exc)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolver_signo(signo: str) -> str:
    """Converte slug (virgem) → display (Virgem). Passa display direto."""
    s = signo.lower().strip()
    return _SIGNO_DISPLAY.get(s, signo.strip().capitalize())


def _nome_formatado(nome: str) -> str:
    nome = nome.strip()
    if not nome:
        return "Cliente"
    # Capitaliza apenas a primeira letra sem alterar o resto
    return nome[0].upper() + nome[1:]
