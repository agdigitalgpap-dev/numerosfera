# PROJECT_CONTEXT.md — NUMEROSFERA
> Gerado em 2026-05-09 · Atualizar sempre que houver mudanças estruturais.

---

## 1. VISÃO GERAL

**ASTRANUMERICA** é um funil de conversão digital baseado em astrologia que combina:
- Quiz de qualificação de lead (8 perguntas)
- Geração personalizada de áudio via TTS (ElevenLabs / OpenAI)
- Player de áudio premium com autoplay híbrido
- Sequência de páginas VSL (Video Sales Letter)

O sistema gera roteiros personalizados a partir de blocos de copy em markdown, converte via TTS e serve os MP3 cacheados por hash de conteúdo. A experiência é mobile-first, sem frameworks JS, sem reloads de página.

---

## 2. STACK

### Backend
| Componente | Tecnologia | Versão |
|---|---|---|
| Framework | FastAPI | ≥ 0.115.0 |
| Server | Uvicorn | ≥ 0.34.0 |
| Validação | Pydantic + pydantic-settings | ≥ 2.10.0 |
| TTS principal | ElevenLabs SDK | ≥ 2.0.0 |
| TTS fallback | OpenAI SDK | ≥ 1.0.0 |
| Normalização de volume | ffmpeg (opcional) | qualquer |
| Runtime | Python | 3.12+ |

### Frontend
| Componente | Tecnologia |
|---|---|
| Framework JS | Nenhum — Vanilla JS puro |
| Audio | WebAudio API (nativo) + HTML5 `<audio>` |
| Fonts | Google Fonts — Poppins + Outfit |
| CSS | Custom design system (shared.css) |
| Persistência | localStorage + sessionStorage |

### Infraestrutura
- Servidor local via `uvicorn` (porta 8000)
- Assets servidos estaticamente via FastAPI
- Cache de MP3s em disco (`/cache/`)
- Sem banco de dados — estado em localStorage + arquivos

---

## 3. ESTRUTURA DE PASTAS

```
VS CODE - ASTRA/
├── .env                          # Variáveis de ambiente (chaves API, parâmetros TTS)
├── .env.example                  # Template de configuração
├── .gitignore
├── gerar_audio.py                # Script standalone para geração manual de áudio
├── copy-quiz.md                  # Referência de copy do quiz
│
├── api/                          # Backend FastAPI
│   ├── main.py                   # App FastAPI + CORS + lifespan + mount /cache
│   ├── config.py                 # Settings (pydantic-settings, lê .env)
│   ├── requirements.txt          # Dependências Python
│   ├── models/
│   │   └── lead.py               # Schemas AudioRequest / AudioResponse + tabelas de normalização
│   ├── routes/
│   │   └── audio.py              # Endpoints REST: generate, preview, blocos, status, cache
│   └── services/
│       ├── cache_service.py      # Cache por hash MD5 (16 chars) — leitura/escrita de MP3
│       ├── script_engine.py      # Montagem de roteiro a partir de blocos .md
│       ├── text_utils.py         # Normalização de texto para TTS + correção de gênero
│       └── tts_service.py        # Abstração ElevenLabs / OpenAI + loudnorm ffmpeg
│
├── assets/                       # Frontend estático
│   ├── shared.css                # Design system global (cores, tipografia, componentes)
│   ├── audio.js                  # AudioManager — áudio ambiente persistente entre páginas
│   ├── audio-player.js           # Fábrica de players (WebAudio + HTML5 + callbacks)
│   ├── lead-manager.js           # Consolidação de dados do quiz + helpers de display
│   └── audio-loop.mp3            # Loop ambiente (tocado enquanto quiz / loading)
│
├── Briefing/
│   ├── AUDIO/
│   │   ├── audio-1 /             # Blocos de copy do áudio 1 (6 blocos modulares)
│   │   │   ├── intro/
│   │   │   ├── sexo/             # masculino.md / feminino.md
│   │   │   ├── idade/            # jovem / homem-maduro / mulher-madura
│   │   │   ├── estado-civil/     # casada / relacionamento / noivado / sozinha / separada / viuva
│   │   │   ├── dor/              # financas / saude / vida-amorosa / felicidade / familia
│   │   │   └── cta/              # email-cta.md
│   │   └── audio-2/             # Blocos do áudio 2 (10 blocos: 7 fixos + 3 variáveis)
│   │       ├── blocos-fixos/     # intro-hipnotica → autoridade → revelacao → cta (8 arquivos)
│   │       ├── dor/              # 4 dores (sem "familia" no audio2)
│   │       ├── sintomas/         # Sintomas por dor
│   │       ├── casos/            # Cases por dor
│   │       └── visualizacao/     # Visualização guiada por dor
│   └── Referencias/              # 42 PNGs (signos, ícones de status civil, gênero, etc.)
│
├── cache/
│   ├── audio1/                   # MP3s gerados — nomeados por hash MD5 (ex: 26bf5732.mp3)
│   └── audio2/
│
├── pages/                        # Páginas VSL (page2.html → page11.html)
│
└── [Root HTML]                   # 9 páginas principais do funil
    ├── index.html                # Quiz (8 steps)
    ├── audio1.html               # Player áudio 1 — leitura pessoal
    ├── audio2.html               # Player áudio 2 — revelação hipnótica
    ├── vsl.html                  # VSL 1
    ├── vsl2.html                 # VSL 2
    ├── landing.html              # Landing page de entrada
    ├── email.html                # Captura de email isolada
    ├── test-audio2.html          # Página de teste (dev)
    └── typography-preview.html   # Preview do design system
```

---

## 4. FLUXO DA APLICAÇÃO

```
[index.html] ──(8 steps quiz)──► localStorage individual
    │                             signo, dia, decada, ano,
    │                             sexo, estadoCivil,
    │                             desafioAtual, primeiroNome
    │
    ├── Step 1 (signo click):
    │   ├── unlockAudioContext()  ← desbloqueia WebAudio para autoplay futuro
    │   └── startAudio()          ← inicia loop ambiente com fade-in
    │
    └── Step 9 (loading 3.2s):
        ├── _preGenerateAudio1()  ← POST /api/audio/generate (audio1)
        │   └── URL salva em sessionStorage('audio1_url')
        └── redirect → audio1.html

[audio1.html]
    ├── LeadManager.getLead()     ← consolida localStorage em objeto lead
    ├── showState('loading')      ← spinner premium + progress bar
    ├── AudioManager.resume()     ← retoma loop ambiente se estava tocando
    │
    ├── audioPlayer1.loadAndPlay('audio1', lead, callbacks)
    │   ├── sessionStorage('audio1_url') encontrado?
    │   │   └── SIM: usa URL pré-gerada (instantâneo)
    │   │   └── NÃO: POST /api/audio/generate (gera agora)
    │   │
    │   ├── onReady() → finishLoading() [850ms] → showState('player')
    │   │              → AudioManager.fadeOut() → startEqualizer()
    │   │
    │   └── _tryPlay() ─────► autoplay OK?
    │       ├── SIM: _startProgressLoop() → onProgress() a cada 250ms
    │       │         │
    │       │         └── (dur - cur) ≤ 20s AND !lead.email:
    │       │               → showEmailOverlay() [email-overlay]
    │       │
    │       └── NÃO (NotAllowedError):
    │             → showAutoplayOverlay() [#autoplay-overlay, fixed full-page]
    │             → usuário clica #btn-start-reading
    │             → manualPlay() → hideAutoplayOverlay() → startEqualizer()
    │
    ├── onEnd() → audioPlayer1.destroy() → redirect audio2.html
    └── submitEmailOverlay() → LeadManager.updateLead({email})
                             → fade-out overlay → redirect audio2.html
