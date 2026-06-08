# Job AI Extraction - Field Matrix

Matriz de comportamento de extração de campos do fluxo Job AI Draft:

| Campo | Comportamento Backend (Limpeza/Guards) | Mapeamento Frontend |
|---|---|---|
| `title` | Retornado pela IA (Obrigatório). | Aplicado. |
| `description` | Retornado pela IA; Termos discriminatórios removidos no backend. | Aplicado. |
| `requirements` | Retornado pela IA; Termos discriminatórios removidos; Backfill se IA omitir. | Aplicado. |
| `responsibilities` | Retornado pela IA. | Aplicado. |
| `experience_context`| IA tenta inferir; Backfill se IA omitir baseado no contexto livre. | Aplicado. |
| `minimum_education_level` | Mantém apenas se houver evidência explícita no texto original; senão omite c/ warning. | Aplicado (quando retornado). |
| `minimum_years_experience` | Mantém apenas se explícito; conversão semestral para anos parciais. | Aplicado (quando retornado). |
| `salary_min` / `salary_max` | Preservado apenas se explícito (evidência estrita); inventado é deletado. | **NÃO MAPEA (deliberado)** para revisão humana. |
| `benefits` | Apenas itens com evidência fonte (Vale Transporte, VR, Saúde). Itens sem evidência suprimidos. | Aplicado. |
| `work_model` | Requer evidência no texto (Remoto/Híbrido/Presencial). Se ausente ou inventado, descartado. | Aplicado (quando retornado). |
| `unit` / `location` | Descartado se houver viés geográfico indiscriminado (ex: "tem que morar perto"). | Aplicado no front como `location`. |
| `working_hours` | Mantido apenas com evidência textual forte. | Aplicado. |
| `skills` / `nice_to_have` | Extraído e normalizado; Aliases mapeados internamente. | Aplicado. |
| `booleans (review)` | Ativados apenas com evidência ("entrevista com o gestor", "avaliação psicológica"). | Aplicado. |
| `pipeline_steps` | Inferência da IA. | **NÃO MAPEA** - fluxo invisível ou hardcoded no RH. |
| `matching_criteria` | Inferência IA. | **NÃO MAPEA** - invisível na tela de vagas. |
| `warnings` / `needs_review` | Preenchidos baseados na ausência de campos críticos e violações de guardrails. | Renderizado no componente de alertas de IA. |
