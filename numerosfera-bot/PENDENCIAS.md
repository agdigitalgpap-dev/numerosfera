# Pendências — Numerosfera Bot

## BLOQUEANTE — Fazer antes de ativar o bot

### ⏳ Meta Developer App (PENDENTE)
**O que é:** Aplicativo no developers.facebook.com que autoriza o bot a postar e enviar DMs via API.
**Necessário para:** postagem automática + comentários + DMs (tudo).
**Por que está pendente:** conta Instagram e Página Facebook ainda não criadas.
**Quando fazer:** após criar as contas e ter 2-4 semanas de posts manuais (aquecimento).

**Passos quando chegar a hora:**
1. Acessar `developers.facebook.com` → Meus apps → Criar app (tipo Business)
2. Nome: `Numerosfera Bot` — vincular à Página Numerosfera
3. Ativar: Instagram Graph API + Messenger + Webhooks
4. Em Configurações > Básico: copiar App ID e App Secret para o `.env`
5. Gerar Access Token de longa duração via Graph API Explorer
6. Solicitar aprovação da Instagram Messaging API (5-15 dias úteis)

---

### ⏳ API Keys — Preencher no .env (PENDENTE)
- [ ] META_ACCESS_TOKEN — gerado após criar o app
- [ ] INSTAGRAM_ACCOUNT_ID — ID numérico da conta (obtido via Graph API)
- [ ] FACEBOOK_PAGE_ID — ID numérico da página (obtido via Graph API)
- [ ] LEONARDO_API_KEY — `app.leonardo.ai`
- [ ] SERPER_API_KEY — `serper.dev`
- [ ] ASSEMBLYAI_API_KEY — `assemblyai.com`
- [ ] PROXY_HOST / PROXY_PORT / PROXY_USER / PROXY_PASS — `webshare.io`

**Já disponíveis (copiar do projeto principal):**
- [x] ANTHROPIC_API_KEY
- [x] ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID

---

## Fase atual: Aquecimento manual

**O que fazer agora:**
1. Criar `@numerosfera.oficial` no Instagram → converter para Business
2. Criar Página Numerosfera no Facebook → linkar ao Instagram
3. Completar perfil: foto de perfil, bio com link do quiz, destaque de stories
4. Postar manualmente 2x/dia por 2-4 semanas antes de ativar o bot

**Referências de perfis do nicho para inspiração:**
@personareoficial, @eusouodu, @br000na, @numerologia.cabalistica, @pilotojupiter.astrologia
