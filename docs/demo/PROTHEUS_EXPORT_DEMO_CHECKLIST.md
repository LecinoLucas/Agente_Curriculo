# Checklist Técnico de Pré-Demo: Exportação Protheus

Este documento é obrigatório para garantir que a demonstração será 100% segura, isolada (STUB) e que os serviços estão devidamente no ar antes de apresentar para os gestores e time de RH.

## 1. Checklist de Comandos e Serviços
Certifique-se de executar ou conferir os seguintes passos e portas na máquina local:

- [ ] **Bridge em Execução**
  ```bash
  cd /Users/lecinolucas/Developer/protheus-admission-bridge
  npm run dev:local-sql
  ```
- [ ] **Admin Local Configurado (Admissão RH)**
  ```bash
  cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
  .venv/bin/python scripts/create_or_reset_dev_admin.py \
    --email admin.local@example.test \
    --password 'AdminLocal123!'
  ```
- [ ] **Dados da Demo Injetados na Fila (Seed)**
  ```bash
  cd /Users/lecinolucas/Developer/protheus-admission-bridge
  python3 backend/scripts/seed_export_dashboard_demo_data.py --reset
  ```

## 2. Validação de Portas e Acessos
- [ ] Confirmar que o backend do Admissão RH está rodando na porta **8000**
- [ ] Confirmar que o frontend do Admissão RH está rodando na porta **5173**
- [ ] Confirmar que o serviço da Bridge está respondendo na porta **8010**
- [ ] Confirmar que o STUB está operando de forma isolada na porta **8999**
- [ ] Confirmar acesso à rota do frontend: `/admissao/protheus-export-dashboard`
- [ ] Confirmar login bem-sucedido com a conta `admin.local@example.test`
- [ ] Confirmar que o dashboard exibiu os dados (7 status populados com o comando seed)
- [ ] Confirmar que **NENHUM botão perigoso** (ex: "Enviar ao Protheus agora", "Modo Produção") está disponível.

## 3. Checklist de Segurança (Crucial)
Garanta que as seguintes flags/variáveis de ambiente no backend/bridge refletem o modo seguro:
- [ ] `PROTHEUS_REAL_SEND_ENABLED=false` (ou inativa)
- [ ] `ERP_ALLOW_REAL_SEND=false` (ou inativa)
- [ ] `PROTHEUS_EXEC_AUTO_ENABLED=false` (se existir)
- [ ] `PROTHEUS_ALLOW_EMPLOYEE_REGISTRATION=false` (se existir)
- [ ] Confirmar visualmente que a tela indica de alguma forma estar operando em "STUB" ou modo seguro.
- [ ] Confirmar que **não existe botão** com a ação literal "Cadastrar no Protheus" ativo nesta fase.
- [ ] Confirmar que a fila de exemplo gerada **não exibe dados reais** (nenhum CPF, PIS, RG ou CTPS de colaboradores da empresa).

*Somente após todos os itens marcados, inicie a apresentação.*
