# Política de Exclusão de Dados Sensíveis — AI-KNOWLEDGE-SEED-0

A base de conhecimento RAG deve conter apenas informações institucionais, processuais e técnicas genéricas. É terminantemente proibida a indexação de dados pessoais, sigilosos ou operacionais de indivíduos.

## O que NUNCA indexar (Lista de Exclusão)

### Dados Pessoais (PII)
*   **Identificadores:** CPF, RG, CNH, Passaporte.
*   **Contato:** Endereços residenciais, telefones pessoais, e-mails pessoais de candidatos ou funcionários em massa.
*   **Saúde:** Exames admissionais, laudos médicos, atestados, dados de deficiência (PCD) vinculados a nomes.

### Dados Financeiros
*   **Individuais:** Salários de funcionários, pretensões salariais de candidatos, bônus individuais, dados bancários.
*   **Contratos:** Cláusulas financeiras de contratos com fornecedores específicos.

### Dados Operacionais brutos
*   **Currículos:** O arquivo original do currículo (o RAG indexa regras de triagem, não o currículo de "Fulano").
*   **Documentos Admissionais:** OCR de certidões, diplomas ou fotos de documentos.
*   **Logs:** Stack traces de erro que contenham caminhos de arquivos locais, segredos de ambiente ou payloads reais do ERP Protheus.

### Segredos de Infraestrutura
*   **Tokens:** API Keys, segredos JWT, senhas de banco de dados.
*   **Configurações:** Detalhes de rede interna ou vulnerabilidades conhecidas.

## Regras de Ouro

1.  **Regra da Dúvida:** Se você estiver em dúvida se um parágrafo contém dado sensível, **não indexar**.
2.  **Anonimização:** Se o documento for essencial mas contiver nomes, substitua-os por placeholders (ex: "Candidato A", "Gestor B").
3.  **Generalização:** Em vez de indexar "O salário do Analista João é R$ 5.000", indexar "A faixa salarial para Analista I é de R$ 4.000 a R$ 6.000".

## Procedimento de Limpeza

Antes da ingestão, cada arquivo deve passar por uma varredura manual (ou via script de regex) para identificar e remover os padrões listados acima.
