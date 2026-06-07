# Ativação Local do Gemini

## Objetivo
Ativar Gemini apenas no ambiente local ou homologação para testar embeddings, síntese RAG e fluxos controlados do Laboratório IA.

## Envs principais
Configure no arquivo local `backend/.env`:

```bash
RAG_EMBEDDING_PROVIDER=gemini
RAG_GEMINI_EMBEDDING_ENABLED=true
RAG_GEMINI_EMBEDDING_MODEL=text-embedding-004

RAG_SYNTHESIS_ENABLED=true
RAG_SYNTHESIS_PROVIDER=gemini
RAG_GEMINI_SYNTHESIS_MODEL=gemini-2.5-flash

GOOGLE_API_KEY_1=sua_chave_local
```

Se o ambiente usar outro slot de chave, também são reconhecidos:

```bash
GOOGLE_API_KEY_2=
GOOGLE_API_KEY_3=
GOOGLE_API_KEY_4=
GOOGLE_API_KEY_5=
```

## Como testar
1. Garanta que o banco está migrado e com seed seguro da base de conhecimento.
2. Suba o backend.
3. Suba o frontend.
4. Acesse `/admin/ia` com usuário admin.
5. Confira `gemini_api_key_configured` como ligado na UI.
6. Clique em:
   - `Buscar fontes sobre Protheus`
   - `Responder com fontes`
   - `Testar política antidiscriminatória`

## Como desligar
Para voltar ao modo sem IA real:

```bash
RAG_EMBEDDING_PROVIDER=fake
RAG_GEMINI_EMBEDDING_ENABLED=false
RAG_SYNTHESIS_ENABLED=false
GOOGLE_API_KEY_1=
```

Depois reinicie o backend.

## Cuidados
- Não commitar `.env`.
- Não colar chave Gemini em prints, logs ou tickets.
- Gemini real consome quota e pode gerar custo.
- O endpoint de status mostra apenas `gemini_api_key_configured: true/false`.
- A chave nunca deve ser retornada ao frontend.

## Protheus
Protheus real continua desligado nesta fase. Mantenha:

```bash
PROTHEUS_REAL_SEND_ENABLED=false
ERP_ALLOW_REAL_SEND=false
```

Mesmo com Gemini ativo, o Laboratório IA executa apenas testes read-only.
