"""
Utilitários de normalização de texto para síntese TTS.
Deve ser aplicado ANTES de enviar o script ao provedor TTS.
"""

import re
import unicodedata

# Regex para linhas que são marcadores técnicos internos (ALL-CAPS curtos, sem pontuação)
_TECH_LINE_RE = re.compile(
    r'^\s*(?:CTA|BLOCO|TRANSIC[AÃ]O|TRANSIÇÃO|SECAO|SEÇÃO|MARCADOR|INTRO|HOOK)'
    r'[A-ZÁÉÍÓÚÂÊÔÀÃÕÜÇÑ0-9 _\-]{0,40}\s*$',
    re.IGNORECASE | re.MULTILINE,
)


def normalize_tts_text(text: str) -> str:
    """
    Sanitiza o texto do roteiro antes de enviar ao TTS.
    Remove markdown residual, marcadores técnicos, símbolos quebrados
    e normaliza pontuação para produzir uma fala natural e limpa.
    """
    text = unicodedata.normalize("NFC", text)

    substitutions = [
        ("…", "."),
        ("—", ", "),
        ("–", ", "),
        ("—", ", "),
        ("–", ", "),
        ("✨", ""),
        ("⚠️", ""),
        ("✦", ""),
        ("★", ""),
        ("☆", ""),
        ("🔊", ""),
        ("✉️", ""),
        ("🔒", ""),
        ("→", "."),
        ("←", ""),
        ("↗", ""),
        ("​", ""),    # zero-width space
        (" ", " "),   # espaço não-quebrável
        ("‘", "'"),   # aspas simples esquerda
        ("’", "'"),   # aspas simples direita
        ("“", '"'),   # aspas duplas esquerda
        ("”", '"'),   # aspas duplas direita
        ("·", "."),
    ]
    for src, dst in substitutions:
        text = text.replace(src, dst)

    # Remove marcadores markdown
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)      # # Heading
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text, flags=re.DOTALL)   # **negrito**
    text = re.sub(r"\*(.+?)\*", r"\1", text)                         # *itálico*
    text = re.sub(r"_{1,2}(.+?)_{1,2}", r"\1", text)                 # _itálico_
    text = re.sub(r"`[^`]+`", "", text)                               # `código`
    text = re.sub(r"<[^>]+>", "", text)                               # tags HTML
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)            # [link](url)

    # Remove linhas técnicas como "CTA FINAL", "BLOCO 1", "TRANSICAO CTA"
    text = _TECH_LINE_RE.sub("", text)

    # Múltiplas reticências / pontos → ponto único
    text = re.sub(r"\.{2,}", ".", text)

    # Colapsa espaços e linhas em branco excessivos
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(lines).strip()

    return text


def normalize_gender_text(text: str, sexo: str) -> str:
    """
    Corrige automaticamente palavras de gênero incorretas no script.
    Aplicar APÓS injeção de variáveis e ANTES do TTS.
    Preserva capitalização da palavra original.
    """
    if sexo not in ("masculino", "feminino"):
        return text

    # Resolve marcadores parentéticos de gênero ANTES das substituições de pares.
    # Exemplos: Querida(o) → Querido (masc) | Querida (fem)
    #           certa(o)   → certo   (masc) | certa   (fem)
    #           certo(a)   → certo   (masc) | certa   (fem)
    if sexo == "feminino":
        # base_a(o) → base_a  (já feminino, remove alternativa)
        text = re.sub(r'\b(\w+a)\(o\)', r'\1', text, flags=re.IGNORECASE)
        # base_o(a) → base_a  (muda para feminino)
        text = re.sub(r'\b(\w+)o\(a\)', lambda m: m.group(1) + 'a', text, flags=re.IGNORECASE)
    else:  # masculino
        # base_a(o) → base_o  (muda para masculino)
        text = re.sub(r'\b(\w+)a\(o\)', lambda m: m.group(1) + 'o', text, flags=re.IGNORECASE)
        # base_o(a) → base_o  (já masculino, remove alternativa)
        text = re.sub(r'\b(\w+o)\(a\)', r'\1', text, flags=re.IGNORECASE)

    if sexo == "masculino":
        pairs = [
            ("querida", "querido"),
            ("cética", "cético"),
            ("preparada", "preparado"),
            ("conectada", "conectado"),
            ("escolhida", "escolhido"),
            ("pronta", "pronto"),
            ("disposta", "disposto"),
            ("aberta", "aberto"),
            ("perdida", "perdido"),
            ("bloqueada", "bloqueado"),
            ("sozinha", "sozinho"),
            ("presa", "preso"),
            ("confusa", "confuso"),
        ]
    else:  # feminino
        pairs = [
            ("querido", "querida"),
            ("cético", "cética"),
            ("preparado", "preparada"),
            ("conectado", "conectada"),
            ("escolhido", "escolhida"),
            ("pronto", "pronta"),
            ("disposto", "disposta"),
            ("aberto", "aberta"),
            ("perdido", "perdida"),
            ("bloqueado", "bloqueada"),
            ("sozinho", "sozinha"),
            ("preso", "presa"),
            ("confuso", "confusa"),
        ]

    for wrong, correct in pairs:
        def _replace(m: re.Match, c: str = correct) -> str:
            original = m.group(0)
            return (c[0].upper() + c[1:]) if original[0].isupper() else c

        text = re.sub(r"\b" + re.escape(wrong) + r"\b", _replace, text, flags=re.IGNORECASE)

    return text
