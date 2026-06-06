# Padrão de Metadados RAG — AI-KNOWLEDGE-SEED-0

Para garantir a qualidade da recuperação (retrieval) e permitir filtragem granular (ex: por área ou nível de visibilidade), todos os documentos injetados na base de conhecimento devem seguir este padrão de metadados.

## Campos de Metadados

| Campo | Descrição | Exemplo |
| :--- | :--- | :--- |
| `source_type` | Categoria funcional do documento. | `hr_policy`, `system_doc` |
| `domain` | Domínio de negócio. | `admission`, `recruitment` |
| `title` | Título legível do documento. | `Política de Férias v2` |
| `version` | Versão do conteúdo. | `1.0.0` |
| `owner_area` | Área responsável pelo conteúdo. | `RH`, `TI`, `Jurídico` |
| `visibility` | Quem pode ler este dado no assistente. | `internal`, `hr_only` |
| `allowed_roles` | Lista de roles que podem recuperar este chunk. | `["recruiter", "admin"]` |
| `sensitivity_level` | Nível de criticidade da informação. | `low`, `high` |
| `language` | Idioma predominante. | `pt-BR` |
| `tags` | Palavras-chave para busca. | `["protheus", "exportação"]` |
| `created_by` | ID ou nome do autor. | `admin` |
| `reviewed_by` | Quem revisou para o RAG. | `rh_manager` |
| `reviewed_at` | Data da última revisão. | `2026-06-06T15:00:00Z` |
| `expires_at` | Data de expiração (opcional). | `2027-01-01T00:00:00Z` |
| `source_uri` | Link para o documento original (opcional). | `https://sharepoint.com/doc.pdf` |

## Valores Sugeridos (Enums)

### `source_type`
*   `system_doc`: Documentação de telas e botões do sistema.
*   `hr_policy`: Políticas de Recursos Humanos.
*   `admission_policy`: Regras específicas de admissão.
*   `protheus_manual`: Guias de integração ERP.
*   `ranking_rules`: Critérios de triagem e pontuação.
*   `pipeline_rules`: Definição de estágios do funil.
*   `faq`: Perguntas e respostas comuns.
*   `technical_walkthrough`: Guias de implementação/arquitetura.

### `visibility`
*   `internal`: Funcionários autorizados em geral.
*   `hr_only`: Apenas usuários com role HR.
*   `admin_only`: Apenas administradores do sistema.
*   `public_candidate`: Informação que pode ser exposta ao candidato (ex: manual de login).

### `sensitivity_level`
*   `low`: Informação pública ou sem risco.
*   `medium`: Informação interna operacional.
*   `high`: Regras de negócio proprietárias.
*   `restricted`: Dados de conformidade ou segurança.
