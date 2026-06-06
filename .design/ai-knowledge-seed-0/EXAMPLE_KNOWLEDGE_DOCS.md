# Exemplos de Documentos de Conhecimento — AI-KNOWLEDGE-SEED-0

Este documento contém exemplos fictícios e seguros de conteúdo que podem ser usados para o seed inicial do RAG.

---

## Exemplo 1: Regra de Exportação Protheus (Fictício)
**Título:** Manual de Integração ERP Protheus — Regras de Exportação
**Source Type:** `protheus_manual`

**Conteúdo:**
A exportação de dados admissionais para o Protheus só é permitida após a conclusão de todos os itens do checklist admissional obrigatório. O candidato deve estar com o status "Aprovado para Contratação" no pipeline.
Cenários de erro comuns:
- Erro 401: Falha na autenticação do token de serviço do ERP.
- Erro 400 (Bad Request): Ausência de campo obrigatório (Ex: Número do PIS).
O sistema tentará a exportação 3 vezes antes de marcar como "Falha Definitiva".

---

## Exemplo 2: Política de Uso de Critérios Objetivos (Fictício)
**Título:** Política RH 001 — Critérios Objetivos em Triagem de Currículos
**Source Type:** `hr_policy`

**Conteúdo:**
Todos os recrutadores devem utilizar critérios objetivos e mensuráveis para a triagem inicial de candidatos. São considerados critérios válidos: tempo de experiência na tecnologia exigida, nível de escolaridade comprovado e certificações específicas listadas na vaga. 
É proibido o uso de filtros baseados em idade, gênero, etnia, religião ou endereço residencial. Qualquer suspeita de viés algorítmico deve ser reportada imediatamente ao gestor da área.

---

## Exemplo 3: Checklist Admissional Padrão (Fictício)
**Título:** Guia Operacional — Checklist Admissional Obrigatório
**Source Type:** `admission_policy`

**Conteúdo:**
O processo de admissão no ATS exige a coleta dos seguintes documentos digitalizados:
1. Foto legível do RG ou CNH (Frente e Verso).
2. Comprovante de Residência (emitido nos últimos 90 dias).
3. Diploma ou Certificado de Conclusão do maior grau de escolaridade.
4. Carteira de Trabalho (CTPS Digital).
A conferência deve ser feita em até 48 horas úteis após o upload pelo candidato.

---

## Exemplo 4: Fluxo de Pipeline de Recrutamento (Fictício)
**Título:** Manual ATS — Fluxo Padrão de Pipeline
**Source Type:** `pipeline_rules`

**Conteúdo:**
O pipeline padrão de recrutamento é composto pelas seguintes etapas:
1. Triagem Inicial (Screening): Avaliação automatizada de requisitos.
2. Entrevista com RH: Validação de fit cultural e soft skills.
3. Teste Técnico: Avaliação prática de conhecimentos.
4. Entrevista com Gestor: Alinhamento de expectativas e equipe.
5. Proposta: Envio de oferta formal ao candidato.
Mover um candidato para "Arquivado" exige a seleção de um motivo de desclassificação pré-cadastrado.
