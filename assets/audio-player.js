/**
 * AudioPlayer — fábrica de players de áudio personalizados via API.
 *
 * Uso:
 *   const player = createAudioPlayer();
 *   player.loadAndPlay('audio_full', lead, { onReady, onProgress, ... });
 *
 * Cada chamada a createAudioPlayer() retorna uma instância INDEPENDENTE.
 * window.AudioPlayer é o singleton padrão (compatibilidade retroativa).
 * window.createAudioPlayer é a fábrica exportada para uso explícito.
 *
 * Configuração da URL da API:
 *   Defina window.ASTRA_API_URL antes de carregar este script para produção.
 */

(function (global) {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────

  const API_BASE = (() => {
    if (global.ASTRA_API_URL) return global.ASTRA_API_URL.replace(/\/$/, '');
    if (location.protocol === 'file:') return 'http://localhost:8000';
    // Dev: Live Server (5500/3000) ou localhost → API na porta 8000 do mesmo host
    if (location.port === '5500' || location.port === '3000' ||
        location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://' + location.hostname + ':8000';
    }
    return '';
  })();

  const UNLOCK_AT       = 0.85;
  const REQUEST_TIMEOUT = 180_000;  // 3 min — audio_full pode levar 60-120s para gerar no ElevenLabs
  const DEFAULT_VOLUME  = 0.85;
  const FADE_IN_MS      = 500;
  const FADE_OUT_MS     = 300;
  const FADE_STEP_MS    = 40;

  // Restaura flag de desbloqueio do quiz (sobrevive navegação entre páginas)
  if (!global.__audioUnlocked && sessionStorage.getItem('__audioUnlocked') === '1') {
    global.__audioUnlocked = true;
    console.log('[AudioUnlock] restaurado do sessionStorage');
  }

  // ── Fábrica ────────────────────────────────────────────────────────────────

  function createAudioPlayer() {

    // ── Estado da instância ────────────────────────────────────────────────

    let _audio        = null;
    let _currentUrl   = null;
    let _generating   = false;
    let _fetchAbort   = null;   // AbortController do POST em voo
    let _progressTimer= null;
    let _fadeTimer    = null;   // setInterval para fades de volume
    let _ctaUnlocked  = false;
    let _savedCb      = null;
    let _userPaused   = false;
    let _lastTipo     = null;   // 'audio1' | 'audio_full' — para logs nomeados

    // WebAudio API — usado APENAS para o analisador (equalizador visual)
    // O volume é controlado via _audio.volume (mais simples e confiável)
    let _audioCtx     = null;
    let _analyser     = null;
    let _gainNode     = null;   // fixo em 1.0 — não controla volume
    let _source       = null;
    let _webAudioOk   = false;

    // Timestamps de palavras retornados pela API
    let _timestamps   = null;

    // Guards de ciclo de vida
    let _started      = false;
    let _loading      = false;
    let _playTriggered = false;
    let _destroyed    = false;
    let _epoch        = 0;    // incrementado em reset() — invalida timers de _checkReadyAndPlay pendentes

    // ── Helpers privados ──────────────────────────────────────────────────

    function _tag() { return _lastTipo ? '[' + _lastTipo.toUpperCase() + ']' : '[AudioPlayer]'; }

    function _clearProgressTimer() {
      if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
    }

    function _clearFade() {
      if (_fadeTimer) { clearInterval(_fadeTimer); _fadeTimer = null; }
    }

    function _clearAudio() {
      console.log('[AUDIO CLEAN]');
      _clearProgressTimer();
      _clearFade();
      if (_source) {
        try { _source.disconnect(); } catch(_) {}
        _source = null;
      }
      if (_audio) {
        _audio.pause();
        _audio.src = '';
        _audio = null;
      }
      // _currentUrl = null;
    }

    function _fmtTime(sec) {
      if (!sec || isNaN(sec)) return '0:00';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return m + ':' + String(s).padStart(2, '0');
    }

    // ── WebAudio (apenas para analyser — volume via audio.volume) ─────────

    function _initWebAudio() {
      if (_audioCtx) return _webAudioOk;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) { console.warn(_tag() + ' WebAudio API não disponível'); return false; }
        _audioCtx = new Ctx();
        _analyser = _audioCtx.createAnalyser();
        _analyser.fftSize = 256;
        _analyser.smoothingTimeConstant = 0.82;
        _gainNode = _audioCtx.createGain();
        _gainNode.gain.value = 1.0;   // fixo em 1.0 — volume controlado por audio.volume
        _gainNode.connect(_analyser);
        _analyser.connect(_audioCtx.destination);

        // Conecta o audio ao analyser somente quando o contexto está running
        // e há um elemento de áudio válido (guarda contra race após reset()).
        _audioCtx.addEventListener('statechange', () => {
          if (_audioCtx.state === 'running' && _audio) {
            _connectAudioToWebAudio();
          }
          if (_audioCtx.state === 'suspended' && _audio && !_audio.paused) {
            _audioCtx.resume().catch(() => {});
          }
        });

        _webAudioOk = true;
        console.log(_tag() + ' WebAudio inicializado (analyser only)');
        return true;
      } catch(e) {
        console.warn(_tag() + ' WebAudio init falhou:', e.message);
        _webAudioOk = false;
        return false;
      }
    }

    function _connectAudioToWebAudio() {
      if (!_audio || !_webAudioOk || !_audioCtx || !_gainNode) return;
      if (_source) return;
      try {
        if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
        // crossOrigin='anonymous' é definido antes do src na criação do elemento —
        // permite createMediaElementSource em origens diferentes (Live Server vs API)
        _source = _audioCtx.createMediaElementSource(_audio);
        _source.connect(_gainNode);
        console.log(_tag() + ' WebAudio conectado (analyser)');
      } catch(e) {
        console.warn(_tag() + ' createMediaElementSource falhou:', e.message);
        _webAudioOk = false;
      }
    }

    // ── Fades via audio.volume (simples e confiável em todos os browsers) ──

    function _fadeIn() {
      _clearFade();
      if (!_audio) return;
      // Garante que GainNode permanece em 1.0 (nunca controla volume)
      if (_webAudioOk && _gainNode && _audioCtx) {
        const now = _audioCtx.currentTime;
        _gainNode.gain.cancelScheduledValues(now);
        _gainNode.gain.setValueAtTime(1.0, now);
      }
      if (_audio.volume >= DEFAULT_VOLUME) return;
      const inc = (DEFAULT_VOLUME - _audio.volume) / (FADE_IN_MS / FADE_STEP_MS);
      _fadeTimer = setInterval(() => {
        if (!_audio) { _clearFade(); return; }
        const v = Math.min(_audio.volume + inc, DEFAULT_VOLUME);
        _audio.volume = v;
        if (v >= DEFAULT_VOLUME) _clearFade();
      }, FADE_STEP_MS);
    }

    function _fadeOut(cb) {
      _clearFade();
      if (!_audio) { if (cb) cb(); return; }
      if (_audio.volume <= 0) { if (cb) cb(); return; }
      const dec = _audio.volume / (FADE_OUT_MS / FADE_STEP_MS);
      _fadeTimer = setInterval(() => {
        if (!_audio) { _clearFade(); if (cb) cb(); return; }
        const v = Math.max(_audio.volume - dec, 0);
        _audio.volume = v;
        if (v <= 0) { _clearFade(); if (cb) cb(); }
      }, FADE_STEP_MS);
    }

    // ── Listeners do elemento Audio ────────────────────────────────────────

    function _setupAudioListeners(cb) {
      if (!_audio) return;

      _audio.addEventListener('error', () => {
        if (!_audio) return;
        _clearProgressTimer();
        const code = _audio.error ? _audio.error.code : '?';
        const msg  = _audio.error ? _audio.error.message : 'unknown';
        console.error(_tag() + ' Erro no elemento Audio — code:', code, '|', msg);
        // Reseta flags ANTES de limpar o elemento, para permitir retry imediato.
        // _clearAudio() seta _audio = null → o timer iOS de 3s verifica !_audio e aborta,
        // evitando um segundo disparo de cb.onError após o timer.
        _loading = false;
        _started = false;
        _clearAudio();
        if (cb.onError) cb.onError(new Error('MediaError ' + code + ': ' + msg));
      }, { once: true });

      _audio.addEventListener('ended', () => {
        _playTriggered = false;
        _started = false;
        _loading = false;

        _clearProgressTimer();

        console.log('[' + (_lastTipo || 'AUDIO').toUpperCase() + ' END]');
        
        if (!_ctaUnlocked) { _ctaUnlocked = true; if (cb.onUnlock) cb.onUnlock(); }
        if (cb.onEnd) cb.onEnd();
      }, { once: true });
    }

    async function _checkReadyAndPlay(cb) {
      if (!_audio) return;

      _initWebAudio();

      if (_audio.readyState >= 4) {
        console.log(_tag() + ' readyState >= 4 — reproduzindo imediatamente');
        if (cb.onReady) cb.onReady(_audio.duration, _timestamps);
        await _tryPlay(cb);
        return;
      }

      console.log(_tag() + ' Aguardando canplaythrough... (readyState:', _audio.readyState, ')');

      let _canplayCalled = false;
      const myEpoch = _epoch;   // captura época atual — invalida este contexto se reset() for chamado

      // iOS/Safari: canplaythrough não dispara sem gesto do usuário.
      // Após 3s força o caminho de play — _tryPlay rejeita com NotAllowedError
      // e exibe o overlay de tap para o usuário iniciar manualmente.
      const _iosTimer = setTimeout(async () => {
        if (_canplayCalled || !_audio || _epoch !== myEpoch) return;
        _canplayCalled = true;
        console.warn(_tag() + ' [iOS FALLBACK] canplaythrough não disparou em 3s — forçando');
        if (cb.onReady) cb.onReady(0, _timestamps);
        await _tryPlay(cb);
      }, 3000);

      _audio.addEventListener('canplaythrough', async () => {
        if (_canplayCalled || !_audio || _epoch !== myEpoch) {
          clearTimeout(_iosTimer);
          return;
        }
        _canplayCalled = true;
        clearTimeout(_iosTimer);
        console.log(_tag() + ' [' + (_lastTipo || 'audio').toUpperCase() + ' READY]  duração:', _audio.duration, 's');
        if (cb.onReady) cb.onReady(_audio.duration, _timestamps);
        await _tryPlay(cb);
      }, { once: true });

      _audio.load();
    }

    async function _tryPlay(cb) {

      if (_playTriggered) {
       console.warn('[BLOCK PLAY TRIGGER] play já disparado');
       return;
      }
      if (_started) {
        console.log('[BLOCK PLAY] ' + (_lastTipo || '?') + ' — já iniciado');
        return;
      }
      if (!_audio) {
        console.warn(_tag() + ' _tryPlay — _audio é null, abortado');
        return;
      }

_playTriggered = true;
      _started = true;
      _loading = false;

      console.log('[' + (_lastTipo || 'AUDIO').toUpperCase() + ' PLAY]');
      _fadeIn();

      try {
        await _audio.play();
        // Áudio reproduz pelo elemento HTML — WebAudio conecta via statechange quando running
        if (_webAudioOk && _audioCtx && _audioCtx.state === 'suspended') {
          _audioCtx.resume().catch(() => {});
        }
        player._startProgressLoop(cb);
      } catch (err) {
        _started = false;
        _loading  = false;
        if (err.name === 'NotAllowedError') {
          console.warn('[AUTOPLAY BLOCKED]', _lastTipo || 'audio');
          if (cb.onAutoplayBlocked) cb.onAutoplayBlocked();
          return;
        }
        console.error(_tag() + ' play() falhou:', err.name, err.message);
        if (cb.onError) cb.onError(err);
      }
    }

    // ── API pública da instância ───────────────────────────────────────────

    const player = {

      async loadAndPlay(tipo, lead, cb = {}) {
        if (_destroyed) {
          console.warn('[AUDIO ABORT] instância destruída — loadAndPlay ignorado');
          return;
        }
        if (_started) {
          console.warn('[BLOCK START] ' + tipo + ' — já iniciado');
          return;
        }
        if (_loading) {
          console.warn('[BLOCK LOAD] ' + tipo + ' — já carregando');
          return;
        }
        if (_lastTipo && _lastTipo !== tipo) {
          console.warn(_tag() + ' Tipo mismatch: tentou ' + tipo + ' em player de ' + _lastTipo + ' — destruindo');
          this.destroy();
          return;
        }
        if (_generating) {
          console.warn('[BLOCK LOAD] ' + tipo + ' — fetch em andamento');
          return;
        }
        if (global.__playerInstance && !global.__playerInstance._destroyed && global.__playerInstance !== this) {
          console.warn('[BLOCK LOAD] ' + tipo + ' — outra instância ativa detectada — destruindo');
          global.__playerInstance.destroy();
        }
        if (global.__audioPlayerLock && global.__audioPlayerLock !== this) {
          console.warn('[BLOCK LOAD] ' + tipo + ' — outro player já está carregando (lock global)');
          return;
        }
        global.__audioPlayerLock = this;
        global.__playerInstance  = this;

        const frozenLead = JSON.parse(JSON.stringify(lead));
        console.log('LEAD FINAL', frozenLead);

        _loading     = true;
        _generating  = true;
        _ctaUnlocked = false;
        _savedCb     = cb;
        _lastTipo    = tipo;

        console.log('[' + tipo.toUpperCase() + ' INIT]  nome=' + frozenLead.nome);

        const payload = LeadManager.toApiPayload(frozenLead, tipo);

        // ── Verificar URL pré-gerada (sessionStorage) ────────────────────
        const _pregenKey = tipo === 'audio1'      ? 'audio1_url'
                         : tipo === 'audio2'      ? 'audio2_url'
                         : tipo === 'audio_full'  ? 'audio_full_url'
                         : null;
        if (_pregenKey) {
          const pregenUrl = sessionStorage.getItem(_pregenKey);
          const _validPregen = pregenUrl &&
            pregenUrl.startsWith('/cache/') &&
            pregenUrl.endsWith('.mp3');
          if (_validPregen) {
            sessionStorage.removeItem(_pregenKey);
            const _pregenTsKey = tipo + '_timestamps';
            try { _timestamps = JSON.parse(sessionStorage.getItem(_pregenTsKey) || 'null'); } catch(_) { _timestamps = null; }
            sessionStorage.removeItem(_pregenTsKey);
            _generating = false;
            _currentUrl = API_BASE + pregenUrl;
            console.log('[PREGEN] URL completa (' + tipo + '):', _currentUrl);

            _clearAudio();
            _audio = new Audio();
            _audio.crossOrigin = 'anonymous'; // deve vir ANTES de src para CORS + WebAudio
            _audio.preload     = 'auto';
            _audio.volume      = 0;
            _audio.src         = _currentUrl;

            _setupAudioListeners(cb);
            await _checkReadyAndPlay(cb);
            return;
          } else if (pregenUrl) {
            console.warn('[PREGEN] URL inválida descartada (' + tipo + '):', pregenUrl);
            sessionStorage.removeItem(_pregenKey);
          }
        }

        // ── Gerar via API ────────────────────────────────────────────────
        _fetchAbort = new AbortController();
        const timeoutId = setTimeout(() => {
          if (_fetchAbort) _fetchAbort.abort();
        }, REQUEST_TIMEOUT);

        let audioUrl;
        try {
          console.log(_tag() + ' POST', API_BASE + '/api/audio/generate');
          const res = await fetch(
            API_BASE + '/api/audio/generate',
            {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify(payload),
              signal:  _fetchAbort.signal,
            }
          );
          clearTimeout(timeoutId);

          console.log(_tag() + ' Response status:', res.status);
          if (!res.ok) throw new Error('HTTP ' + res.status);

          const data = await res.json();
          console.log(_tag() + ' Response body:', JSON.stringify(data));

          if (!data.success) throw new Error(data.detail || 'API error');

          _timestamps = (data.timestamps && Array.isArray(data.timestamps)) ? data.timestamps : null;
          audioUrl = API_BASE + data.audioUrl;
          console.log(_tag() + ' Audio URL:', audioUrl);

        } catch (err) {
          clearTimeout(timeoutId);
          _fetchAbort = null;
          _generating = false;
          _loading    = false;
          if (err.name === 'AbortError') {
            console.log('[' + tipo.toUpperCase() + ' ABORT]');
            if (cb.onError) cb.onError(new Error('Tempo esgotado ao gerar o áudio. Tente novamente.'));
            return;
          }
          console.error(_tag() + ' Geração falhou:', err.message);
          if (cb.onError) cb.onError(err);
          return;
        }

        _fetchAbort = null;
        _generating = false;
        _currentUrl = audioUrl;
        console.log(_tag() + ' URL completa (API):', _currentUrl);

        _clearAudio();
        _audio = new Audio();
        _audio.crossOrigin = 'anonymous'; // deve vir ANTES de src para CORS + WebAudio
        _audio.preload     = 'auto';
        _audio.volume      = 0;
        _audio.src         = audioUrl;

        _setupAudioListeners(cb);
        await _checkReadyAndPlay(cb);
      },

      /**
       * Inicia reprodução via gesto do usuário (fallback autoplay bloqueado).
       * DEVE ser chamado diretamente no handler de click (Safari iOS).
       */
      manualPlay() {
        if (!_audio) {
          console.warn(_tag() + ' manualPlay() — nenhum Audio element existe');
          return Promise.resolve();
        }
        console.log('[MANUAL PLAY]');
        _started = true;
        _initWebAudio();
        if (_webAudioOk && _audioCtx && _audioCtx.state === 'suspended') {
          _audioCtx.resume().catch(() => {});
        }
        _connectAudioToWebAudio();
        _fadeIn();
        const p = _audio.play();
        if (p !== undefined) {
          return p.then(() => {
            console.log('[MANUAL PLAY SUCCESS]');
            if (_savedCb) player._startProgressLoop(_savedCb);
          }).catch(err => {
            _started = false;
            console.error(_tag() + ' manualPlay falhou:', err.name, err.message);
            if (_savedCb && _savedCb.onError) _savedCb.onError(err);
          });
        }
        return Promise.resolve();
      },

      _startProgressLoop(cb) {
        _clearProgressTimer();
        console.log(_tag() + ' Loop de progresso iniciado');
        _progressTimer = setInterval(() => {
          // Safari/iOS: auto-resume AudioContext suspenso durante playback
          if (_webAudioOk && _audioCtx && _audioCtx.state === 'suspended') {
            _audioCtx.resume().catch(() => {});
          }
          if (!_audio || _audio.paused) return;
          const cur = _audio.currentTime;
          const dur = _audio.duration;
          const pct = dur ? (cur / dur) : 0;

          if (cb.onProgress) cb.onProgress(pct, cur, dur, _fmtTime(cur), _fmtTime(dur));

          if (!_ctaUnlocked && pct >= UNLOCK_AT) {
            _ctaUnlocked = true;
            console.log(_tag() + ' CTA desbloqueado em', (pct * 100).toFixed(0) + '%');
            if (cb.onUnlock) cb.onUnlock();
          }
        }, 250);
      },

      // ── Controles ────────────────────────────────────────────────────

      pause() {
        if (!_audio || _audio.paused) return;
        _userPaused = true;
        _fadeOut(() => { if (_audio) _audio.pause(); });
      },

      resume() {
        if (!_audio || !_audio.paused) return;
        _fadeIn();
        _audio.play().catch(() => {});
      },

      toggle() {
        if (!_audio) return;
        _audio.paused ? this.resume() : this.pause();
      },

      setVolume(v) {
        const vol = Math.max(0, Math.min(1, v));
        if (_audio) _audio.volume = vol;
      },

      mute(on) {
        if (_audio) _audio.muted = on;
      },

      stop() {
        if (_fetchAbort) { _fetchAbort.abort(); _fetchAbort = null; }
        _generating = false;
        _loading    = false;
        _clearAudio();
      },

      /**
       * Reseta o estado para permitir uma nova chamada a loadAndPlay() na mesma instância.
       * Diferente de destroy(): o player continua usável após reset().
       */
      reset() {
        this.stop();
        _started     = false;
        _savedCb     = null;
        _userPaused  = false;
        _epoch++;           // invalida timers de _checkReadyAndPlay pendentes
        if (global.__audioPlayerLock === this) global.__audioPlayerLock = null;
        if (global.__playerInstance  === this) global.__playerInstance  = null;
        console.log('[AUDIO RESET]  tipo=' + (_lastTipo || '?'));
      },

      destroy() {
        this.stop();
        _ctaUnlocked    = false;
        _savedCb        = null;
        _userPaused     = false;
        _started        = false;
        _loading        = false;
        _destroyed      = true;
        this._destroyed = true;
        if (global.__audioPlayerLock === this) global.__audioPlayerLock = null;
        if (global.__playerInstance  === this) global.__playerInstance  = null;
        console.log('[AUDIO DESTROY]  tipo=' + (_lastTipo || '?'));
      },

      // ── Getters ──────────────────────────────────────────────────────

      isPlaying()    { return _audio ? !_audio.paused : false; },
      getProgress()  { if (!_audio || !_audio.duration) return 0; return _audio.currentTime / _audio.duration; },
      getCurrentUrl(){ return _currentUrl; },
      getApiBase()   { return API_BASE; },
      getAnalyser()  { return _webAudioOk ? _analyser : null; },
    };

  
  return player;
}

window.createAudioPlayer = createAudioPlayer;

})(window);