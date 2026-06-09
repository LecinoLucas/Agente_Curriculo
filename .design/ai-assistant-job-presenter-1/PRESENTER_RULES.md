# Presenter Rules - AI Assistant Job Presenter

## 1. Mapeamento de Enums (PT-BR)

### Status (`status`)
- `draft` -> Rascunho
- `published` -> Publicada
- `paused` -> Pausada
- `closed` -> Encerrada
- `cancelled` -> Cancelada
- Outros -> Humanizar string (Capitalize)

### Senioridade (`seniority`, `seniority_level`)
- `junior` -> Júnior
- `mid`, `pleno` -> Pleno
- `senior` -> Sênior
- `lead` -> Liderança
- `specialist` -> Especialista

### Modelo de Trabalho (`work_model`)
- `onsite`, `presencial` -> Presencial
- `hybrid` -> Híbrido
- `remote`, `remoto` -> Remoto

### Prioridade (`priority`)
- `low` -> Baixa
- `normal` -> Normal
- `high` -> Alta
- `urgent` -> Urgente

### Áreas (`area`, `job_area`)
- `data` -> Dados
- `administrative`, `administrativa` -> Administrativa
- `finance`, `financial` -> Financeiro
- `it` -> Tecnologia
- `hr` -> RH
- `commercial`, `sales` -> Comercial

## 2. Regras de Exibição

- **Campos Ausentes:** Se um campo essencial não vier no payload ou for nulo, mostrar "Não informado".
- **Origem dos Dados:** Substituir o título "Evidências" por "Dados cadastrados" ou "Informações da vaga".
- **Fonte Honesta:** Se o payload não trouxer `source`, usar "Fonte: dados atuais da vaga".

## 3. Pendências Acionáveis

As pendências devem explicar o impacto e sugerir uma ação.

- **Skills ausentes:**
    - Texto: "Skills obrigatórias não informadas."
    - Impacto: "O ranking IA e o matching ficam menos confiáveis."
    - Ação: "Cadastre skills obrigatórias (ex.: SQL, Excel) para melhorar a precisão."

- **Requisitos incompletos:**
    - Texto: "Requisitos detalhados incompletos."
    - Ação: "Complete a descrição de requisitos para ajudar na triagem automática."

## 4. Campos Proibidos (Sanitização)
Nunca exibir:
- `payload_json`
- `vector_json`
- `content_hash`
- `embedding`
- `raw_text`
- `id` (UUIDs internos se não forem links)
