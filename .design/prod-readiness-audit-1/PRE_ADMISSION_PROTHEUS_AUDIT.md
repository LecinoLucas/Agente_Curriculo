# Auditoria da Integração Pré-Admissão / Protheus ERP

**Data:** 07/06/2026

## 1. Idempotência e Confiabilidade
- **APROVADO**: Todo o trânsito com o Protheus Real e o Dry-Run usa obrigatoriamente a assinatura de `idempotency_key` criada dinamicamente (baseada em timestamps ou hash únicos) como visto no `protheus_real_adapter.py`. 
- **APROVADO**: Caso falhas transacionais existam ou o banco caia entre respostas (Ex. Evento disparado pelo Celery), chaves repetidas não permitirão a reexecução do disparo graças a proteção de duplicatas no Redis e lock na API.

## 2. Prevenção de Envio em Massa / Erros de Disparo
- **APROVADO**: A segurança usa "Double-Flag Guard" para proteger contra envios reais indesejados à infraestrutura local. Para o ambiente enviar dados reais ao invés de dry-runs estáticos, são obrigatoriamente necessários DOIS trincos destravados na `settings.py`:
  1. `PROTHEUS_REAL_SEND_ENABLED=True`
  2. `ERP_ALLOW_REAL_SEND=True`
- **APROVADO**: Os logs avisam caso a requisição acuse `real_send` e alguma das chaves falte: `"Configure PROTHEUS_REAL_SEND_ENABLED=true e ERP_ALLOW_REAL_SEND=true"`.
- **APROVADO**: A variável `ERP_INTEGRATION_MODE` assume de fábrica o estado `dry_run`.

**Conclusão**: Excelente trabalho arquitetônico. O design isolou qualquer possibilidade de falha catastrófica mandando sujeira para a base homologatória do Protheus através de travas lógicas intransponíveis via testes acidentais.
