# Portabilidade da Base de Conhecimento

## Objetivo

Tornar a Base de Conhecimento transportável entre ambientes sem depender de:

- dump bruto do banco;
- embeddings como fonte canônica;
- `vector_json`;
- `content_hash` como dado editorial;
- payloads internos sensíveis.

## Formato canônico

Bundle JSON versionado:

```json
{
  "schema_version": "2026-06-07",
  "exported_at": "2026-06-07T00:00:00+00:00",
  "document_count": 1,
  "documents": [
    {
      "document_key": "source_uri:kb://guia-base-conhecimento",
      "title": "Guia de Base de Conhecimento",
      "source_type": "internal_guide",
      "domain": "ai_assistant",
      "content": "Documento revisado...",
      "visibility": "internal",
      "allowed_roles": ["ADMIN", "HR"],
      "sensitivity_level": "low",
      "tags": ["assistente", "base"],
      "status": "published",
      "reviewed_by": "QA Admin",
      "reviewed_at": "2026-06-07T00:00:00+00:00",
      "source_uri": "kb://guia-base-conhecimento"
    }
  ]
}
```

## Campos exportados

- `document_key`
- `title`
- `source_type`
- `domain`
- `content`
- `visibility`
- `allowed_roles`
- `sensitivity_level`
- `tags`
- `status`
- `reviewed_by`
- `reviewed_at`
- `source_uri`

## Campos proibidos

- `vector_json`
- `embedding`
- `embeddings`
- `content_hash`
- `metadata_json` bruto
- payloads internos
- segredos
- dados pessoais reais

## Estratégia de importação

### Upsert lógico

Busca de correspondência por:

1. `source_uri`, quando existir;
2. `title + domain + source_type`, quando não existir `source_uri`.

### Reindexação

A importação não trata embeddings como fonte de verdade.

Comportamento:

- documento novo entra com `indexing_status=pending`;
- documento atualizado com conteúdo diferente volta para `pending`;
- chunks e embeddings antigos são removidos em atualização de conteúdo;
- reindexação posterior continua controlada e explícita.

## Scripts

Export:

```bash
cd backend
source .venv/bin/activate
python scripts/export_ai_knowledge_bundle.py /tmp/knowledge-bundle.json
```

Import:

```bash
cd backend
source .venv/bin/activate
python scripts/import_ai_knowledge_bundle.py /tmp/knowledge-bundle.json
```

## Validação de segurança

O bundle é rejeitado se contiver:

- CPF
- e-mail
- telefone
- `token`, `password`, `secret`, `api_key`
- `payload_json`, `vector_json`, `content_hash`, `embedding`
- referência a currículo bruto, laudo, RG ou documento pessoal

## Limites atuais

- A importação prepara o documento para reindexação, mas não faz reindex automática.
- O bundle não substitui governança editorial nem revisão humana.
- `schema_version` é estrito nesta fase para evitar importações ambíguas.
