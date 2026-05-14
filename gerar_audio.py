import os
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

load_dotenv()

api_key = os.getenv("ELEVENLABS_API_KEY")
if not api_key:
    raise ValueError("ELEVENLABS_API_KEY não encontrada no .env")

client = ElevenLabs(api_key=api_key)

texto = "Bem-vindo ao ASTRA. Seu cosmos, sua verdade, revelada."

audio = client.text_to_speech.convert(
    text=texto,
    voice_id="JBFqnCBsd6RMkjVDRZzb",   # George (voz padrão da ElevenLabs)
    model_id="eleven_multilingual_v2",
    output_format="mp3_44100_128",
)

output_path = "audio.mp3"
with open(output_path, "wb") as f:
    for chunk in audio:
        f.write(chunk)

print(f"Áudio salvo em: {output_path}")
