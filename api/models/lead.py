from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


AudioTipo = Literal["audio1", "audio2", "audio_full"]

Sexo = Literal["masculino", "feminino"]

FaixaEtaria = Literal["jovem", "homem-maduro", "mulher-madura"]

Dor = Literal["financas", "saude", "vida-amorosa", "felicidade", "familia"]

EstadoCivil = Literal[
    "casada", "relacionamento", "noivado", "sozinha", "separada", "viuva"
]

Signo = Literal[
    "aries", "touro", "gemeos", "cancer", "leao", "virgem",
    "libra", "escorpiao", "sagitario", "capricornio", "aquario", "peixes",
]

# ── Tabelas de normalização ───────────────────────────────────────────────────

ESTADO_CIVIL_NORM: dict[str, EstadoCivil] = {
    # Feminino
    "casada": "casada",
    "noivada": "noivado",
    "noivado": "noivado",
    "relacionamento": "relacionamento",
    "sozinha": "sozinha",
    "solteira": "sozinha",
    "separada": "separada",
    "divorciada": "separada",
    "viuva": "viuva",
    "viúva": "viuva",
    # Masculino → mesmo arquivo (copy é neutral)
    "casado": "casada",
    "noivo": "noivado",
    "sozinho": "sozinha",
    "solteiro": "sozinha",
    "separado": "separada",
    "divorciado": "separada",
    "viuvo": "viuva",
    "viúvo": "viuva",
}

DOR_NORM: dict[str, Dor] = {
    "financas": "financas",
    "finanças": "financas",
    "saude": "saude",
    "saúde": "saude",
    "vida-amorosa": "vida-amorosa",
    "vida_amorosa": "vida-amorosa",
    "amoroso": "vida-amorosa",
    "amor": "vida-amorosa",
    "felicidade": "felicidade",
    "emocional": "felicidade",
    "familia": "familia",
    "família": "familia",
}

SIGNO_DISPLAY: dict[str, str] = {
    "aries": "Áries",
    "touro": "Touro",
    "gemeos": "Gêmeos",
    "cancer": "Câncer",
    "leao": "Leão",
    "virgem": "Virgem",
    "libra": "Libra",
    "escorpiao": "Escorpião",
    "sagitario": "Sagitário",
    "capricornio": "Capricórnio",
    "aquario": "Aquário",
    "peixes": "Peixes",
}

DOR_DISPLAY: dict[str, str] = {
    "financas": "suas finanças",
    "saude": "sua saúde",
    "vida-amorosa": "sua vida amorosa",
    "felicidade": "sua felicidade e equilíbrio emocional",
    "familia": "sua família",
}


# ── Request / Response ────────────────────────────────────────────────────────

class AudioRequest(BaseModel):
    tipo: AudioTipo = Field(..., description="'audio1' | 'audio2' | 'audio_full'")
    nome: str = Field(..., min_length=1, max_length=80)
    sexo: str = Field(..., description="'masculino' ou 'feminino'")
    dor: str = Field(..., description="Desafio principal do lead")
    signo: Optional[str] = Field(None, description="Signo do lead")

    # audio1 somente
    faixa_etaria: Optional[str] = Field(
        None,
        alias="idade",
        description="'jovem' | 'homem-maduro' | 'mulher-madura'",
    )
    estado_civil: Optional[str] = Field(
        None,
        alias="estadoCivil",
        description="Estado civil normalizado",
    )

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def normalizar(self) -> "AudioRequest":
        # Normaliza dor
        self.dor = DOR_NORM.get(self.dor.lower().strip(), self.dor.lower().strip())

        # Normaliza estado civil
        if self.estado_civil:
            key = self.estado_civil.lower().strip()
            self.estado_civil = ESTADO_CIVIL_NORM.get(key, key)

        # Normaliza sexo
        self.sexo = self.sexo.lower().strip()

        # Normaliza faixa etária
        if self.faixa_etaria:
            self.faixa_etaria = self.faixa_etaria.lower().strip()

        # Normaliza signo
        if self.signo:
            self.signo = self.signo.lower().strip()

        return self

    @property
    def signo_display(self) -> str:
        return SIGNO_DISPLAY.get(self.signo or "", self.signo or "")

    @property
    def dor_display(self) -> str:
        return DOR_DISPLAY.get(self.dor, self.dor)

    @property
    def nome_formatado(self) -> str:
        n = self.nome.strip()
        if not n:
            return ""
        # Capitalize only the FIRST letter — never alter the rest
        # (Python's .capitalize() would lowercase everything after the first char)
        return n[0].upper() + n[1:]


class AudioResponse(BaseModel):
    success: bool
    audio_url: str = Field(..., alias="audioUrl")
    cached: bool
    generation_time: float = Field(0.0, alias="generationTime")
    provider: str = ""
    script_length: int = Field(0, alias="scriptLength")
    timestamps: list | None = Field(None)

    model_config = {"populate_by_name": True}
