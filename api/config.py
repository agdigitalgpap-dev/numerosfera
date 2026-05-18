from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent.parent / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── TTS Providers ────────────────────────────────────────────────────────
    elevenlabs_api_key: str = ""
    # Charlotte XB0fDUnXU5powFXDhCwa — madura, europeia, elegante, hipnótica (recomendada)
    # Rachel   21m00000000000000000014 — americana, natural, calorosa
    # Dorothy  ThT5KcBeYPX3keUQqHPh  — britânica, suave, madura
    # Matilda  XrExE9yKIg1WjnnlVkGX  — acolhedora, maternal
    elevenlabs_voice_id: str = "XB0fDUnXU5powFXDhCwa"  # Charlotte — padrão
    elevenlabs_model: str = "eleven_flash_v2_5"
    elevenlabs_stability: float = 0.45
    elevenlabs_similarity_boost: float = 0.65
    elevenlabs_style: float = 0.25
    elevenlabs_speed: float = 0.85
    elevenlabs_speaker_boost: bool = True
    elevenlabs_output_format: str = "mp3_44100_128"

    openai_api_key: str = ""
    openai_tts_model: str = "tts-1-hd"
    openai_voice_feminine: str = "nova"
    openai_voice_masculine: str = "onyx"
    openai_tts_speed: float = 0.95

    # ── Provider padrão ──────────────────────────────────────────────────────
    tts_provider: str = "elevenlabs"   # "elevenlabs" | "openai"

    # ── Paths ────────────────────────────────────────────────────────────────
    base_dir: Path = Path(__file__).parent.parent
    blocks_dir: Path = base_dir / "Briefing" / "AUDIO"
    cache_dir: Path = base_dir / "cache"

    # ── Cache ────────────────────────────────────────────────────────────────
    cache_enabled: bool = True
    cache_max_age_days: int = 90

    # ── Admin ────────────────────────────────────────────────────────────────
    admin_key: str = ""


settings = Settings()
