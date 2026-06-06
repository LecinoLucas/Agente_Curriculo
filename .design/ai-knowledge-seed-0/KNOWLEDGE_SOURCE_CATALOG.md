# Catálogo de Fontes de Conhecimento — AI-KNOWLEDGE-SEED-0

Este documento mapeia as fontes candidatas para alimentar a base de conhecimento RAG do ATS/RH. O objetivo é fornecer ao assistente informações precisas sobre o funcionamento do sistema e as políticas da empresa.

## Fontes Mapeadas

| Nome da Fonte | `source_type` sugerido | Prioridade | Público-alvo | Pode Indexar? | Exige Revisão? | Risco de Dados Sensíveis | Observações |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| Documentação Funcional do ATS | `system_doc` | Altíssima | Interno | Sim | Não | Baixo | Descrição de telas e fluxos. |
| Regras de Cadastro de Vagas | `system_doc` | Alta | Interno | Sim | Sim | Baixo | Campos obrigatórios, modelos. |
| Regras de Pipeline/Fluxo | `pipeline_rules` | Alta | Interno | Sim | Sim | Baixo | Definição de etapas padrão. |
| Critérios de Ranking/Triagem | `ranking_rules` | Alta | Interno | Sim | Sim | Médio | Evitar critérios subjetivos. |
| Guia de Status Protheus | `protheus_manual` | Alta | HR/Admin | Sim | Sim | Baixo | Significado de cada código ERP. |
| Manual de Exportação Protheus | `protheus_manual` | Alta | HR/Admin | Sim | Sim | Médio | Não incluir logs reais. |
| Regras de Pré-admissão | `admission_policy` | Alta | HR | Sim | Sim | Baixo | Prazos e documentos genéricos. |
| Checklist Admissional Padrão | `admission_policy` | Média | HR | Sim | Sim | Baixo | Lista de documentos necessários. |
| FAQ Interno RH | `faq` | Média | Interno | Sim | Sim | Médio | Revisar respostas para LGPD. |
| Política Antidiscriminatória | `hr_policy` | Altíssima | Todos | Sim | Não | Baixo | Documento institucional crítico. |
| Guia LGPD Operacional | `hr_policy` | Alta | Interno | Sim | Não | Baixo | Como tratar dados no ATS. |
| Manual do Assistente de IA | `system_doc` | Média | Todos | Sim | Não | Baixo | Como interagir com o bot. |
| FAQ Público Candidato | `faq` | Baixa | Público | Sim | Não | Baixo | Dúvidas comuns de login/uso. |
| Documentação Técnica das Fases | `technical_walkthrough` | Baixa | Admin | Sim | Não | Baixo | Histórico de evolução do dev. |

## Legenda

*   **Pode Indexar?**: Indica se o conteúdo é seguro para ingestão no RAG.
*   **Exige Revisão?**: Indica se o texto original precisa ser editado ou "limpo" antes de virar chunk.
*   **Risco de Dados Sensíveis**: Avaliação do potencial de vazamento de PII (Personally Identifiable Information) ou segredos técnicos.
