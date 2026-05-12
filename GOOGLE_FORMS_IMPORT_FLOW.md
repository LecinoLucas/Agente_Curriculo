# Google Forms & Drive Import Flow

Este documento descreve o fluxo planejado para a futura integração de ingestão de candidatos via Google Forms e Google Drive, servindo de guia para a implementação no backend e integração real.

## 1. Objetivo

Atualmente, a tela de importação via formulário no frontend é puramente demonstrativa (mockada). O objetivo atual é validar a experiência do usuário (UX) e preparar a estrutura visual antes de investir no desenvolvimento das APIs e automações.

## 2. Fluxo Futuro Desejado

O fluxo real planejado seguirá os seguintes passos:
1. **Envio do Formulário**: O candidato preenche um formulário público no Google Forms e anexa seu currículo em PDF.
2. **Armazenamento**: O Google Forms salva o arquivo no Google Drive do recrutador e registra a resposta.
3. **Detecção**: O sistema (backend) consulta periodicamente a API do Google Forms ou recebe um Webhook avisando sobre novas respostas.
4. **Coleta de Arquivos**: O backend extrai o `fileId` do arquivo no Drive a partir da resposta do formulário.
5. **Download & Hash**: O sistema baixa o arquivo via Google Drive API, calcula o hash SHA-256 para evitar duplicidade de arquivos.
6. **Deduplicação**: O sistema verifica se o candidato já existe (por CPF, e-mail ou hash do arquivo).
7. **Processamento**: O currículo é enviado para a fila de extração por IA (como já ocorre na importação manual).
8. **Criação/Atualização**: O candidato é criado ou atualizado no banco de dados com status "Aguardando Vaga".

## 3. Dados que o Backend Futuro Deve Fornecer

Para alimentar a tela que foi desenhada no frontend, o endpoint futuro (ex: `GET /api/v1/imports/google-forms`) deverá fornecer uma lista de objetos com a seguinte estrutura:

*   `form_response_id` (string): ID único da resposta no Google Forms.
*   `drive_file_id` (string): ID do arquivo no Google Drive.
*   `file_name` (string): Nome original do arquivo.
*   `mime_type` (string): Tipo do arquivo (ex: application/pdf).
*   `submitted_at` (string/ISO Date): Data de envio do formulário.
*   `processing_status` (string): `pending` | `processing` | `completed` | `failed`.
*   `duplicate_status` (string): `new` | `duplicate_detected` | `candidate_updated`.
*   `candidate_id` (string | null): ID do candidato criado ou atualizado.
*   `analysis_status` (string | null): Status de análise de IA se aplicável.
*   `final_score` (number | null): Score se houver vaga vinculada (opcional).

## 4. Estados de UI

O frontend atual já representa visualmente e simula os seguintes estados para guiar o usuário:
*   **Aguardando Processamento**: Novo envio detectado, mas não processado.
*   **Duplicado Detectado**: O sistema identificou que esse currículo ou candidato já existe e sugere a mesclagem ou apenas ignora.
*   **Candidato Criado**: Sucesso total, novo perfil inserido na base.
*   **Erro de Integração**: Falha ao baixar arquivo ou acessar API do Google.

## 5. Pendências para Integração Real

Para que esse fluxo funcione de verdade, as seguintes tarefas precisam ser realizadas:
*   Configurar Credenciais OAuth2 / Service Account no Google Cloud Console.
*   Implementar integração com a Google Forms API (leitura de respostas).
*   Implementar integração com a Google Drive API (download de arquivos).
*   Criar um Job assíncrono (ex: Celery) para pesquisar novos envios ou configurar Webhooks.
*   Criar lógica de hash anti-duplicação na camada de repositório de currículos.
*   Criar endpoint no backend que sirva a listagem desses eventos de importação.

## 6. O que foi Implementado Agora

Foi desenvolvida apenas a interface visual rica no frontend (`GoogleImportPage`) com dados mockados emulando uma lista de respostas do formulário sendo processadas em tempo real. Não há chamadas para o backend nem persistência de dados.
