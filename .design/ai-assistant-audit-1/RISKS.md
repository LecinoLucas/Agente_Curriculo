# RISKS

## HIGH

| Risco | Cenario | Mitigacao |
|---|---|---|
| Chat livre geral sem classificador | Usuario pede para mover candidato, aprovar documento, exportar Protheus ou revelar dados | Manter `free_text_enabled=false`; liberar apenas intent classification com allowlist read-only |
| Acoes de escrita automaticas | IA move candidato, aprova/reprova documento, envia email ou altera vaga | Proibir write tools no registry do assistant; `ToolRuntime(read_only=True)` obrigatorio |
| Decisao automatizada sobre candidato | Assistente diz "contrate/rejeite" sem revisao humana | Respostas devem ser assistivas, com evidencias, lacunas e revisao humana obrigatoria |
| Exportacao Protheus por IA | IA dispara envio real ou aprova pacote | Nunca expor send real como tool; manter flags e aprovacao humana |
| Exposicao de dados sensiveis | Tool/RAG/presenter mostra CPF, salario, OCR, documento bruto, payload ERP, notas internas | Sanitizacao em tools, presenters e RAG; testes de regressao por campo sensivel |
| Prompt injection via documentos RAG | Documento instrui modelo a ignorar regras ou exfiltrar dados | Prompt ja manda tratar docs como dados; adicionar testes e filtros de ingestion |
| Candidato acessar assistant interno | Portal candidato herda AppShell ou endpoint interno | Garantir RBAC/backend: role candidate sem permissoes; frontend separado |

## MEDIUM

| Risco | Cenario | Mitigacao |
|---|---|---|
| Warnings/erros tecnicos expostos | Usuario ve `embedding_provider_error`, tool name, permissao ou user_id | Traduzir mensagens por publico; remover detalhes internos do payload final |
| RAG sem filtro fino por role/documento | Documento `admin_only` aparece para role operacional | Aplicar `allowed_roles`, `visibility`, `sensitivity_level` no retrieval |
| Base pequena causar alucinacao percebida | Usuario pergunta processo real, base seed responde generico | Expandir base e responder "sem evidencia" quando faltar fonte |
| Multi-tool sem budget | Consulta ampla chama muitas tools e degrada performance | Limitar steps, timeout, quantidade de registros e tokens |
| Historico de sessao armazenar resposta sensivel | Drawer guarda resultados sanitizados, mas algum campo novo vaza | Sanitizacao centralizada e testes com novas tools |
| Viewer com UX confusa | Viewer abre drawer, ve Knowledge, mas backend nega | Ajustar visibilidade por role ou mensagem explicita |
| Logs de usage com erro de provider longo | `error_message` guarda mensagem externa sanitizada parcial | Limitar e sanitizar mensagens; nao guardar prompt/resposta |

## LOW

| Risco | Cenario | Mitigacao |
|---|---|---|
| Comentarios desatualizados no registry | Devs acham que existem 17 tools, mas ha 19 | Atualizar comentario em fase propria |
| Empty state generico | Usuario em admin/rh nao entende o que pode fazer | Empty states por rota/persona |
| Resultado longo em drawer estreito | Arrays de docs/candidatos ficam dificeis de ler | Presenters por dominio e agrupamento |
| Testes mockam formatos diferentes do backend real | Frontend passa, mas exibicao real fica ruim | Testes de contrato com payload real das tools |
| Falta de screenshots nesta auditoria | Avaliacao visual incompleta | Rodar design review/browser em fase UX |

## O que nao deve ser feito ainda

- Nao ativar chat livre geral.
- Nao criar endpoint de escrita por IA.
- Nao mover candidato por IA.
- Nao aprovar/rejeitar documento por IA.
- Nao exportar Protheus por IA.
- Nao expor dados sensiveis em respostas, fontes ou historico.
- Nao permitir que documento RAG dite instrucoes ao modelo.
- Nao expor assistant interno ao candidato.
- Nao chamar Gemini real em auditorias/testes comuns sem necessidade explicita.

