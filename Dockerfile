# ─────────────────────────────────────────────────────────────────────────────
# NUMEROSFERA — Dockerfile
# Suporta:  Python 3.12 (FastAPI + uvicorn)
#           Node.js 20  (Puppeteer + geração de PDFs)
#           Chromium     (renderização headless)
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim

# ── Sistema: Chromium + dependências de renderização + curl/gnupg ─────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl gnupg \
      chromium \
      fonts-liberation \
      fonts-noto-core \
      libgbm1 \
      libatk-bridge2.0-0 \
      libgtk-3-0 \
      libasound2 \
      libxss1 \
      libxtst6 \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 20 (via NodeSource) ───────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python: dependências ──────────────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Node.js: dependências (sem baixar Chromium — usamos o do sistema) ─────────
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY astranumerica-pdfs/package.json astranumerica-pdfs/package-lock.json ./astranumerica-pdfs/
RUN cd astranumerica-pdfs && npm ci --omit=dev

# ── Copia o restante do projeto ───────────────────────────────────────────────
COPY . .

# ── Expõe porta (Railway injeta $PORT) ───────────────────────────────────────
EXPOSE 8000

# ── Start ─────────────────────────────────────────────────────────────────────
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}
