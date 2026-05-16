/**
 * LeadManager — gerencia dados do lead entre todas as páginas do funil.
 *
 * Lê automaticamente as chaves individuais salvas pelo quiz (index.html)
 * e consolida em um objeto normalizado, pronto para enviar à API.
 *
 * localStorage keys do quiz:
 *   signo, dia, decada, ano, sexo, estadoCivil, desafioAtual, primeiroNome
 */

(function (global) {
  'use strict';

  // ── Tabelas de normalização ────────────────────────────────────────────────

  const SIGNO_SLUG = {
    'áries': 'aries',    'aries': 'aries',
    'touro': 'touro',
    'gêmeos': 'gemeos',  'gemeos': 'gemeos',
    'câncer': 'cancer',  'cancer': 'cancer',
    'leão': 'leao',      'leao': 'leao',
    'virgem': 'virgem',
    'libra': 'libra',
    'escorpião': 'escorpiao', 'escorpiao': 'escorpiao',
    'sagitário': 'sagitario', 'sagitario': 'sagitario',
    'capricórnio': 'capricornio', 'capricornio': 'capricornio',
    'aquário': 'aquario', 'aquario': 'aquario',
    'peixes': 'peixes',
  };

  const SIGNO_DISPLAY = {
    aries: 'Áries', touro: 'Touro', gemeos: 'Gêmeos', cancer: 'Câncer',
    leao: 'Leão', virgem: 'Virgem', libra: 'Libra', escorpiao: 'Escorpião',
    sagitario: 'Sagitário', capricornio: 'Capricórnio', aquario: 'Aquário', peixes: 'Peixes',
  };

  const SEXO_SLUG = {
    'masculino': 'masculino', 'male': 'masculino', 'homem': 'masculino', 'm': 'masculino',
    'feminino': 'feminino', 'female': 'feminino', 'mulher': 'feminino', 'f': 'feminino',
  };

  const ESTADO_CIVIL_SLUG = {
    'casado': 'casada', 'casada': 'casada', 'casados': 'casada',
    'casado(a)': 'casada',                          // quiz value
    'relacionamento': 'relacionamento', 'em relacionamento': 'relacionamento',
    'noivado': 'noivado', 'noivada': 'noivado', 'noivo': 'noivado', 'noiva': 'noivado',
    'noivo(a)': 'noivado',                          // quiz value
    'sozinho': 'sozinha', 'sozinha': 'sozinha',
    'solteiro': 'sozinha', 'solteira': 'sozinha', 'solteiro(a)': 'sozinha',
    'sozinho(a)': 'sozinha',                        // quiz value
    'separado': 'separada', 'separada': 'separada',
    'separado(a)': 'separada',                      // quiz value
    'divorciado': 'separada', 'divorciada': 'separada',
    'viúvo': 'viuva', 'viúva': 'viuva', 'viuvo': 'viuva', 'viuva': 'viuva',
    'viúvo(a)': 'viuva',                            // quiz value
  };

  const DOR_SLUG = {
    'finanças': 'financas', 'financas': 'financas', 'dinheiro': 'financas', 'financeiro': 'financas',
    'minhas finanças': 'financas',                  // quiz value
    'saúde': 'saude', 'saude': 'saude',
    'minha saúde': 'saude',                         // quiz value
    'vida amorosa': 'vida-amorosa', 'vida-amorosa': 'vida-amorosa',
    'amor': 'vida-amorosa', 'relacionamentos': 'vida-amorosa', 'amoroso': 'vida-amorosa',
    'minha vida amorosa': 'vida-amorosa',           // quiz value
    'felicidade': 'felicidade', 'emocional': 'felicidade', 'emoções': 'felicidade',
    'minha felicidade': 'felicidade',               // quiz value (future-proof)
    'família': 'familia', 'familia': 'familia',
    'minha família': 'familia',                     // quiz value
  };

  const DOR_DISPLAY = {
    financas: 'suas finanças',
    saude: 'sua saúde',
    'vida-amorosa': 'sua vida amorosa',
    felicidade: 'sua felicidade',
    familia: 'sua família',
  };

  const SIGNO_ICON = {
    aries:      'assets/img/aries.png',
    touro:      'assets/img/touro.png',
    gemeos:     'assets/img/gemeos.png',
    cancer:     'assets/img/cancer.png',
    leao:       'assets/img/leao.png',
    virgem:     'assets/img/virgem.png',
    libra:      'assets/img/libra.png',
    escorpiao:  'assets/img/escorpiao.png',
    sagitario:  'assets/img/sagitario.png',
    capricornio:'assets/img/capricornio.png',
    aquario:    'assets/img/aquario.png',
    peixes:     'assets/img/peixes.png',
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function norm(str) {
    return (str || '').toLowerCase().trim();
  }

  function calcFaixaEtaria(anoNasc, sexo) {
    const idade = new Date().getFullYear() - anoNasc;
    if (idade < 30) return 'jovem';
    return sexo === 'masculino' ? 'homem-maduro' : 'mulher-madura';
  }

  function buildFromQuizKeys() {
    const raw = {
      signo:       localStorage.getItem('signo')       || '',
      dia:         localStorage.getItem('dia')         || '',
      decada:      localStorage.getItem('decada')      || '1990',
      ano:         localStorage.getItem('ano')         || '1990',
      sexo:        localStorage.getItem('sexo')        || '',
      estadoCivil: localStorage.getItem('estadoCivil') || '',
      desafio:     localStorage.getItem('desafioAtual')|| '',
      nome:        localStorage.getItem('primeiroNome')|| '',
    };
    console.log('QUIZ DATA', raw);
    console.log('RAW NAME (localStorage)', raw.nome);

    const signoSlug = SIGNO_SLUG[norm(raw.signo)] || norm(raw.signo).replace(/\s+/g, '-');
    const sexoSlug  = SEXO_SLUG[norm(raw.sexo)]   || 'feminino';
    const ecSlug    = ESTADO_CIVIL_SLUG[norm(raw.estadoCivil)] || 'sozinha';
    const dorSlug   = DOR_SLUG[norm(raw.desafio)] || 'felicidade';

    // O quiz salva o ano completo (ex: 1995) em 'ano'
    const anoNasc = parseInt(raw.ano, 10) || 1990;

    return {
      nome:        raw.nome.trim(),
      signo:       signoSlug,
      signoDisplay:SIGNO_DISPLAY[signoSlug] || raw.signo,
      signoIcon:   SIGNO_ICON[signoSlug]    || '',
      sexo:        sexoSlug,
      estadoCivil: ecSlug,
      dor:         dorSlug,
      dorDisplay:  DOR_DISPLAY[dorSlug]     || dorSlug,
      faixaEtaria: calcFaixaEtaria(anoNasc, sexoSlug),
      anoNascimento: anoNasc,
      email:       '',
      sessionId:   crypto.randomUUID(),
      savedAt:     new Date().toISOString(),
    };
  }

  // ── LeadManager ───────────────────────────────────────────────────────────

  const KEY = 'astra_lead';

  const LeadManager = {
    /**
     * Retorna o lead consolidado.
     * Se não existir no storage, tenta construir das chaves do quiz.
     */
    getLead() {
      const stored = localStorage.getItem(KEY);
      if (stored) {
        try {
          const lead = JSON.parse(stored);
          console.log('LEAD LOADED (cached)', lead);
          return lead;
        } catch (_) { /* json inválido — reconstrói */ }
      }
      const lead = buildFromQuizKeys();
      console.log('LEAD LOADED (built)', lead);
      this.saveLead(lead);
      return lead;
    },

    /**
     * Salva o objeto lead completo.
     */
    saveLead(data) {
      localStorage.setItem(KEY, JSON.stringify(data));
      return data;
    },

    /**
     * Atualiza campos específicos sem sobrescrever os demais.
     */
    updateLead(updates) {
      const current = this.getLead() || {};
      const updated = Object.assign({}, current, updates);
      localStorage.setItem(KEY, JSON.stringify(updated));
      return updated;
    },

    /**
     * Remove o lead do storage (após conversão ou reset).
     */
    clearLead() {
      localStorage.removeItem(KEY);
    },

    // ── Helpers de display ─────────────────────────────────────────────────

    getSignoDisplay(lead) {
      return lead.signoDisplay || SIGNO_DISPLAY[lead.signo] || lead.signo || '';
    },

    getSignoIcon(lead) {
      return SIGNO_ICON[lead.signo] || lead.signoIcon || '';
    },

    getDorDisplay(lead) {
      return lead.dorDisplay || DOR_DISPLAY[lead.dor] || lead.dor || '';
    },

    getNomeFormatado(lead) {
      const raw = (lead.nome || '').trim();
      console.log('RAW NAME', raw);
      if (!raw) return '';
      // Capitalize only the first letter — never alter the rest of the name
      const final = raw.charAt(0).toUpperCase() + raw.slice(1);
      console.log('FINAL NAME', final);
      return final;
    },

    /**
     * Monta o payload para POST /api/audio/generate.
     */
    toApiPayload(lead, tipo) {
      return {
        tipo:        tipo,
        nome:        this.getNomeFormatado(lead),
        sexo:        lead.sexo,
        dor:         lead.dor,
        signo:       lead.signo,
        idade:       lead.faixaEtaria,
        estadoCivil: lead.estadoCivil,
      };
    },
  };

  global.LeadManager = LeadManager;

}(window));
