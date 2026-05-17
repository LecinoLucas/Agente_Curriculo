# Planejamento e Documentação Técnica do Projeto

Este diretório centraliza e organiza todos os documentos técnicos de auditoria, decisões de arquitetura, relatórios de execução das fases e prompts comportamentais das IAs.

---

## 📂 Estrutura do Diretório

```txt
docs/implementation/
  ├── README.md           # Este guia de orientação
  ├── phases/             # Relatórios, roadmaps e status das fases do projeto
  ├── decisions/          # Guias de correção, otimização de banco e fluxos específicos
  ├── audits/             # Diagnósticos de performance, fluxo de avaliações e legado
  └── prompts/            # Instruções comportamentais e de domínio das ferramentas de IA
```

---

## 🔍 Índice Geral de Documentos

### 🚀 Fases e Roadmap (`phases/`)
* **[Fases Iniciais (0, 1, 2, 5B)](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/phases/)**: Relatórios finais das etapas iniciais de setup e fundação.
* **[Fase 11 e 11B](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/phases/)**: Relatórios de consistência do estado operacional e regras canônicas.
* **[Fase 12](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/phases/FASE12_E2E_VALIDATION.md)**: Documento de validação de fluxo End-to-End.
* **[Fase 19](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/phases/)**: Roadmap geral, status de integridade e resumos executivos.
* **[Fase 20](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/phases/)**: Auditoria de produto, guia de referência rápida e execução técnica.
* **[Fase 24](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/phases/)**: Resumos de implementação das sub-fases 3B, 3C e relatórios de execução de testes.

### 🧠 Decisões e Guias Técnicos (`decisions/`)
* **[Guia de Limpeza](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/decisions/CLEANUP_IMPLEMENTATION_GUIDE.md)**: Guia completo de cleanup e refatoração de código legado.
* **[Checklist de Correções Críticas](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/decisions/CRITICAL_FIXES_CHECKLIST.md)**: Checklist das regras de integridade operacional do domínio.
* **[Otimização de Índices do Banco](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/decisions/DATABASE_INDEX_OPTIMIZATION.md)**: Decisões e índices criados para otimização de queries pesadas no SQLite/PostgreSQL.
* **[Importação do Google Forms](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/decisions/GOOGLE_FORMS_IMPORT_FLOW.md)**: Desenho do fluxo técnico de importação via Forms.
* **[Destravamento de Análise de IA](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/decisions/RESUME_EXTRACTION_STUCK_FIX.md)**: Correção aplicada no processador de fila Gemini para evitar extrações travadas.

### 📊 Auditorias e Diagnósticos (`audits/`)
* **[Índice de Auditorias](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/audits/AUDIT_INDEX.md)**: Mapeamento de todas as frentes auditadas do sistema.
* **[Resumo de Auditoria](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/audits/AUDIT_SUMMARY.md)**: Principais pontos de atenção encontrados.
* **[Código Legado](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/audits/LEGACY_CODE_AUDIT.md)**: Mapeamento detalhado de dívidas técnicas e fallbacks a serem removidos.
* **[Performance de Queries (Fase 21)](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/audits/FASE21_PERFORMANCE_DIAGNOSTICO.md)**: Consolidação de queries SQL do dashboard com subqueries escalares de alta performance.
* **[Fluxo de Avaliações (Fase 25A)](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/audits/FASE25A_AUDITORIA_FLUXO_AVALIACOES.md)**: Auditoria técnica e detalhamento do ciclo de vida das avaliações comportamentais do candidato.

### 🎯 Prompts de IA (`prompts/`)
* **[AGENTS.md](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/prompts/AGENTS.md)**: Regra central de domínio oficial (*1 candidato = no máximo 1 pipeline ativo = 1 vaga ativa*).
* **[GEMINI.md](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/prompts/GEMINI.md)**: Diretrizes e invariantes específicas para o modelo Gemini.
* **[CLAUDE.md](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/prompts/CLAUDE.md)** / **[CODEX.md](file:///Users/lecinolucas/Desktop/projetos/agentes/resume-ai-system/docs/implementation/prompts/CODEX.md)**: Diretrizes complementares para outros agentes.
