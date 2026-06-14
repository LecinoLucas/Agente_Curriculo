# Fluxo Futuro de Importação via Google Forms / Google Drive

Este documento registra o planejamento do fluxo de ingestão automática de candidatos vindos de formulários do Google e arquivos anexados no Google Drive. Esta funcionalidade **não está implementada** e representa uma entrega futura.

## 1. Objetivo

O objetivo deste documento é servir como referência técnica e de produto para a futura implementação da automação de ingestão. Atualmente, o sistema conta apenas com a representação visual (mockada) desse fluxo no frontend.

## 2. Cenário Atual

Atualmente:
*   Os candidatos preenchem um formulário de inscrição no Google Forms.
*   Os currículos anexados são salvos automaticamente em uma pasta do Google Drive do recrutador.
*   O sistema não consome esses dados automaticamente. O recrutador precisa baixar o PDF e fazer o upload manual na tela de importação atual.

## 3. Fluxo Futuro Desejado

Quando implementado, o fluxo real seguirá os seguintes passos:
1.  **Google Form**: O candidato preenche as respostas.
2.  **Resposta**: O backend detecta a nova resposta (via Webhook ou polling na Google Forms API).
3.  **Drive fileId**: O backend extrai o ID do arquivo no Drive do campo de anexo.
4.  **Download do Arquivo**: O sistema baixa o arquivo usando a Google Drive API.
5.  **Hash**: O sistema calcula o hash SHA-256 do arquivo baixado.
6.  **Deduplicação**: O sistema verifica se o candidato já existe por e-mail, CPF ou hash do arquivo.
7.  **Criação/Atualização de Candidato**: O sistema cria um novo perfil ou atualiza um existente (mantendo o status "Aguardando Vaga" se não houver vaga explícita vinculada).
8.  **Análise**: O currículo é enviado para a fila de extração de dados e análise por IA.
9.  **Score/Ranking**: Se o formulário estiver vinculado a uma vaga ativa específica, calcula-se o score do candidato.

## 4. Regras de Negócio Esperadas

*   **Anti-duplicação**: O sistema deve impedir a criação de candidatos duplicados usando o e-mail como chave principal, e o hash do arquivo para evitar reprocessar o mesmo currículo.
*   **Reaproveitamento de Análise**: Se o candidato enviar exatamente o mesmo arquivo que já foi processado anteriormente (mesmo hash), o sistema pode optar por reaproveitar a extração de dados existente para economizar processamento de IA.
*   **Controle de Versão**: Se o candidato enviar um novo arquivo, uma nova versão de currículo deve ser criada na tabela `resume_versions`.
*   **Score Oficial**: O `final_score` ou `job_fit_score` decisório só será calculado se houver um pipeline ativo vinculando o candidato a uma vaga, conforme as regras centrais do projeto.

## 5. Contrato Futuro Esperado

Espera-se que o backend forneça endpoints RESTful semelhantes a:
*   `GET /api/v1/imports/google-forms`: Listagem paginada das submissões (usando padrão `data`, `page`, `page_size`, `total`, `total_pages`).
*   `POST /api/v1/imports/google-forms/{id}/reprocess`: Forçar reprocessamento.
*   `POST /api/v1/imports/google-forms/{id}/discard`: Descartar envio.

**Estados de Processamento (`processing_status`):**
`received` | `file_detected` | `validating` | `duplicate_check` | `queued` | `processing` | `completed` | `discarded` | `failed`.

**Estados de Duplicidade (`duplicate_status`):**
`unknown` | `none` | `possible_duplicate` | `exact_duplicate`.

## 6. O que já Existe no Frontend

*   Uma tela visual e navegável acessível pela rota `/importar-formulario` (disponível no menu lateral como "Formulários").
*   Simulação completa de estados de progresso para fins de demonstração de UX.
*   Mocks de dados locais isolados para não impactar chamadas reais.

## 7. O que Falta para Implementação Real

Para que a funcionalidade saia do papel, será necessário:
*   **Backend**: Criar rotas, controllers e serviços específicos para a ingestão.
*   **APIs do Google**: Configurar credenciais e autenticação (OAuth2 ou Service Account) para ler a Google Forms API e baixar arquivos via Google Drive API.
*   **Job Assíncrono**: Configurar tarefas periódicas no Celery para buscar novas respostas.
*   **Persistência**: Criar tabelas no banco de dados para rastrear o status de cada linha de importação.
*   **Lógica de Deduplicação**: Implementar os validadores de hash e e-mails existentes.

## 8. Observações

*   Esta implementação **não deve** interferir no fluxo atual de importação manual por upload de arquivo. São caminhos complementares.
*   O frontend foi construído de forma desacoplada para facilitar o "plug" nas APIs reais quando elas estiverem prontas.
*   A interface visual pode evoluir independentemente do backend para testes de usabilidade com a equipe de recrutamento.
