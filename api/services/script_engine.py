"""
Script Engine — monta roteiros de áudio a partir de blocos .md

Variáveis suportadas nos arquivos .md:
  {nome}       → nome do lead (ex: "Gustavo")
  {signo}      → signo formatado (ex: "Sagitário")
  {dor}        → dor em linguagem natural (ex: "suas finanças")
  {sexo_trat}  → tratamento de gênero (ex: "querida" / "querido")

Estrutura Audio 1:
  intro/padrao.md → sexo/{sexo}.md → idade/{faixa_etaria}.md
  → estado-civil/{estado_civil}.md → dor/{dor}.md → cta/email-cta.md

Estrutura Audio 2:
  blocos-fixos (1-8) intercalados com blocos variáveis por dor
"""

import logging
from pathlib import Path
from typing import Optional

from api.config import settings
from api.models.lead import AudioRequest
from api.services.text_utils import normalize_tts_text, normalize_gender_text

logger = logging.getLogger(__name__)

# ── Nota: pasta audio-1 tem espaço no nome no filesystem ─────────────────────
_A1 = "audio-1 "   # "audio-1 " (com espaço — nome real da pasta)
_A2 = "audio-2"


# ── Estrutura dos roteiros ────────────────────────────────────────────────────

AUDIO1_BLOCOS: list[str] = [
    f"{_A1}/intro/padrao.md",
    f"{_A1}/sexo/{{sexo}}.md",
    f"{_A1}/idade/{{faixa_etaria}}.md",
    f"{_A1}/estado-civil/{{estado_civil}}.md",
    f"{_A1}/dor/{{dor}}.md",
    f"{_A1}/cta/email-cta.md",
]

AUDIO2_BLOCOS: list[str] = [
    f"{_A2}/blocos-fixos/1 intro-hipnotica.md",
    f"{_A2}/blocos-fixos/2 autoridade-destino.md",
    f"{_A2}/dor/{{dor}}.md",
    f"{_A2}/sintomas/{{dor}}.md",
    f"{_A2}/blocos-fixos/3 revelacao-bloqueio.md",
    f"{_A2}/blocos-fixos/4 consequencias-bloqueio.md",
    f"{_A2}/blocos-fixos/5 origem-bloqueio.md",
    f"{_A2}/casos/{{dor}}.md",
    f"{_A2}/visualizacao/{{dor}}.md",
    f"{_A2}/blocos-fixos/6 alivio-emocional.md",
    f"{_A2}/blocos-fixos/7 transicao-cta.md",
    # email-cta e cta/padrao removidos: email pertence somente ao audio1
]

# Audio único: audio1 (sem email-cta) + audio2 — um só MP3
AUDIO_FULL_BLOCOS: list[str] = [
    # Bloco audio-1 (sem cta/email-cta — email é gerenciado pelo frontend)
    f"{_A1}/intro/padrao.md",
    f"{_A1}/sexo/{{sexo}}.md",
    f"{_A1}/idade/{{faixa_etaria}}.md",
    f"{_A1}/estado-civil/{{estado_civil}}.md",
    f"{_A1}/dor/{{dor}}.md",
    # Blocos audio-2 na sequência
    f"{_A2}/blocos-fixos/1 intro-hipnotica.md",
    f"{_A2}/blocos-fixos/2 autoridade-destino.md",
    f"{_A2}/dor/{{dor}}.md",
    f"{_A2}/sintomas/{{dor}}.md",
    f"{_A2}/blocos-fixos/3 revelacao-bloqueio.md",
    f"{_A2}/blocos-fixos/4 consequencias-bloqueio.md",
    f"{_A2}/blocos-fixos/5 origem-bloqueio.md",
    f"{_A2}/casos/{{dor}}.md",
    f"{_A2}/visualizacao/{{dor}}.md",
    f"{_A2}/blocos-fixos/6 alivio-emocional.md",
    f"{_A2}/blocos-fixos/7 transicao-cta.md",
]

# Padrões que indicam arquivo sem copy real.
# ATENÇÃO: são verificados como substrings — use marcadores únicos que
# nunca apareçam em copy real de português.
_PLACEHOLDER_EXATO = frozenset([
    "sem dados",
    "precisa preenchimento",
    "[preencher]",
    "[a preencher]",
    "[em branco]",
    "<!-- todo",
    "# wip",
])


def _resolve_path(template: str, req: AudioRequest) -> str:
    return template.format(
        sexo=req.sexo,
        faixa_etaria=req.faixa_etaria or "jovem",
        estado_civil=req.estado_civil or "sozinha",
        dor=req.dor,
    )


def _extrair_copy(texto: str) -> str:
    """
    Extrai apenas a seção de copy do arquivo .md.

    Os arquivos de audio-1 seguem o padrão:
      # OBJETIVO ...
      # PERFIL   ...
      # EMOÇÃO   ...
      # COPY
      <texto para TTS>

    Se não houver marcador '# COPY', usa o texto completo
    (padrão dos blocos de audio-2 e dos novos arquivos de intro/cta).
    """
    marcador = "# COPY"
    idx = texto.upper().find(marcador)
    if idx == -1:
        return texto.strip()

    after = texto[idx + len(marcador):].strip()
    # Remove qualquer próximo cabeçalho markdown
    linhas = after.splitlines()
    copy_linhas: list[str] = []
    for linha in linhas:
        if linha.startswith("#"):
            break
        copy_linhas.append(linha)
    return "\n".join(copy_linhas).strip()


def _is_placeholder(texto: str) -> bool:
    lower = texto.lower().strip()
    return not lower or any(p in lower for p in _PLACEHOLDER_EXATO)


def _ler_bloco(caminho_relativo: str) -> Optional[str]:
    path = settings.blocks_dir / caminho_relativo
    if not path.exists():
        logger.warning("Bloco ausente: %s", caminho_relativo)
        return None

    raw = path.read_text(encoding="utf-8").strip()
    copy = _extrair_copy(raw)

    if _is_placeholder(copy):
        logger.warning("Bloco sem copy válido: %s", caminho_relativo)
        return None

    return copy


def _injetar_variaveis(texto: str, req: AudioRequest) -> str:
    """
    Variáveis suportadas nos arquivos .md:
      {nome}         → nome capitalizado (ex: "Gustavo")
      {signo}        → signo display (ex: "Sagitário")
      {dor}          → dor em linguagem natural (ex: "suas finanças")
      {sexo_trat}    → "querido" | "querida"
      {sexo_ref}     → "homem" | "mulher"
      {sexo_ref_cap} → "Homem" | "Mulher"
    """
    masculino = req.sexo == "masculino"
    return (
        texto
        .replace("{nome}", req.nome_formatado)
        .replace("{signo}", req.signo_display)
        .replace("{dor}", req.dor_display)
        .replace("{sexo_trat}", "querido" if masculino else "querida")
        .replace("{sexo_ref_cap}", "Homem" if masculino else "Mulher")
        .replace("{sexo_ref}", "homem" if masculino else "mulher")
    )


def _validar_audio1(req: AudioRequest) -> None:
    if not req.faixa_etaria:
        raise ValueError("'faixa_etaria' (idade) é obrigatório para audio1")
    if not req.estado_civil:
        raise ValueError("'estado_civil' (estadoCivil) é obrigatório para audio1")


def montar_roteiro(req: AudioRequest) -> str:
    """
    Monta e retorna o roteiro completo como string.
    Blocos ausentes ou vazios são ignorados (log de aviso emitido).
    Lança ValueError se parâmetros obrigatórios estiverem faltando.
    """
    if req.tipo in ("audio1", "audio_full"):
        _validar_audio1(req)
        estrutura = AUDIO1_BLOCOS if req.tipo == "audio1" else AUDIO_FULL_BLOCOS
    elif req.tipo == "audio2":
        estrutura = AUDIO2_BLOCOS
    else:
        raise ValueError(f"Tipo de áudio desconhecido: '{req.tipo}'")

    logger.info(
        "[%s] RAW NAME=%r  FINAL NAME=%r  sexo=%s  dor=%s  faixa=%s  ec=%s  signo=%s",
        req.tipo,
        req.nome,
        req.nome_formatado,
        req.sexo,
        req.dor,
        req.faixa_etaria,
        req.estado_civil,
        req.signo,
    )

    partes: list[str] = []

    for template in estrutura:
        caminho = _resolve_path(template, req)
        path = settings.blocks_dir / caminho
        logger.debug("[%s] Lendo bloco: %s  (existe=%s)", req.tipo, caminho, path.exists())
        texto = _ler_bloco(caminho)
        if texto is None:
            logger.warning("[%s] Bloco ignorado (ausente/vazio/placeholder): %s", req.tipo, caminho)
            continue
        texto = _injetar_variaveis(texto, req)
        partes.append(texto)
        logger.debug("[%s] Bloco OK: %s  (%d chars)", req.tipo, caminho, len(texto))

    if not partes:
        raise RuntimeError("Nenhum bloco carregado — verifique os arquivos .md")

    roteiro = "\n\n".join(partes)
    roteiro = normalize_tts_text(roteiro)
    logger.info("SEXO FINAL [%s]: %s", req.tipo, req.sexo)
    roteiro = normalize_gender_text(roteiro, req.sexo)
    logger.info(
        "[%s] Roteiro montado: %d/%d blocos, %d chars  |  sexo=%s",
        req.tipo, len(partes), len(estrutura), len(roteiro), req.sexo,
    )
    logger.info(
        "FINAL SCRIPT CLEAN [%s] (primeiros 200 chars): %s",
        req.tipo, roteiro[:200].replace("\n", " "),
    )
    return roteiro


def listar_blocos(req: AudioRequest) -> list[dict]:
    """Debug: retorna status de cada bloco (encontrado / ausente / vazio)."""
    if req.tipo == "audio1":
        estrutura = AUDIO1_BLOCOS
    elif req.tipo == "audio_full":
        estrutura = AUDIO_FULL_BLOCOS
    else:
        estrutura = AUDIO2_BLOCOS
    result = []
    for template in estrutura:
        caminho = _resolve_path(template, req)
        path = settings.blocks_dir / caminho
        if not path.exists():
            result.append({"bloco": caminho, "status": "ausente"})
            continue
        raw = path.read_text(encoding="utf-8").strip()
        copy = _extrair_copy(raw)
        status = "placeholder" if _is_placeholder(copy) else "ok"
        result.append({"bloco": caminho, "status": status, "chars": len(copy)})
    return result
