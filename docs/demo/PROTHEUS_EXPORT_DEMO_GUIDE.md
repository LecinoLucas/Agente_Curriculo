# Guia de Demonstração: Exportação para o Protheus (Modo Seguro / STUB)

## Objetivo da Demo
Mostrar para gestores e profissionais de RH como o sistema Admissão RH organiza a pré-admissão, valida pendências antes de qualquer envio e garante total controle e segurança ao se comunicar com o ERP Protheus. Esta demonstração foca na usabilidade, transparência da fila operacional e rastreabilidade, utilizando apenas dados fictícios.

## Público-Alvo
* Profissionais de Recursos Humanos (RH)
* Gestores e Lideranças

## Pré-requisitos
* Modo Seguro/STUB ativado: **Nada será enviado para o Protheus real**.
* Uso exclusivo de dados fictícios gerados para demonstração (sem CPF, PIS, RG ou CTPS reais).
* Bridge rodando localmente (backend mockado).
* Admissão RH rodando localmente.

---

## Preparação: Comandos para Subir os Ambientes

### 1. Subir o Bridge
Abra o terminal e execute:
```bash
cd /Users/lecinolucas/Developer/protheus-admission-bridge
npm run dev:local-sql
```

### 2. Criar/Resetar Admin Local (Admissão RH)
Abra um novo terminal e execute:
```bash
cd /Users/lecinolucas/Developer/Agente_Curriculo/backend
.venv/bin/python scripts/create_or_reset_dev_admin.py \
  --email admin.local@example.test \
  --password 'AdminLocal123!'
```
(Certifique-se de iniciar o servidor backend e frontend após a criação do usuário, caso não estejam em execução).

### 3. Rodar Seed Demo
Para popular o dashboard com dados de demonstração contendo os diferentes cenários:
```bash
cd /Users/lecinolucas/Developer/protheus-admission-bridge
python3 backend/scripts/seed_export_dashboard_demo_data.py --reset
```

---

## Ordem dos Cliques e Fala Sugerida

### 1. Tela Inicial / Pré-admissão
* **Ação:** Mostrar a tela de pré-admissão ou organização dos candidatos.
* **Fala sugerida:** *"Aqui o RH vê quem está pronto para exportar."*
* **Explicação:** *"Antes de qualquer envio, o sistema valida se faltam dados. Se algo estiver errado, o envio nem entra na fila."*

### 2. Dashboard Operacional (Fila de Exportação)
* **Ação:** Navegar para a rota `/admissao/protheus-export-dashboard`.
* **Fala sugerida:** *"Este é o painel onde podemos acompanhar a fila operacional de envios em tempo real. Cada estágio da comunicação com o sistema de folha (Protheus) fica visível aqui."*
* **Explicação dos Status Visualizados (Usando linguagem do RH):**
  * **queued:** *"Aguardando processamento"*.
  * **processing:** *"Em processamento"*.
  * **retry_scheduled:** *"Vai tentar novamente"*.
  * **success:** *"Concluído em modo seguro/STUB"*.
  * **failed_permanent:** *"Precisa de revisão manual"*.
  * **blocked:** *"Bloqueado por segurança"*. *"Quando há risco, ele bloqueia e pede revisão técnica."*
  * **cancelled:** *"Cancelado"*.

### 3. Lógica de Segurança (Durante a Navegação)
* **Fala sugerida:** *"Nesta demo, tudo roda em STUB, então nada é cadastrado no Protheus real."*

---

## Riscos que Foram Bloqueados
* Não há chamada ao Protheus real.
* Não executamos funções como `ExecAuto`, `MsExecAuto` ou `GPEA010`.
* Nenhum funcionário real é cadastrado.
* Não são mostradas informações de API key, token, headers, DSN, senha ou payloads operacionais.
* Botões perigosos e envios reais estão desativados.

---

## FAQ: Perguntas Comuns e Respostas Simples

**Pergunta:** *“Isso já cadastra no Protheus?”*
**Resposta:** *"Não nesta fase. A demo usa STUB seguro. O objetivo é validar o fluxo, pendências, fila, auditoria e segurança antes de qualquer envio real."*

**Pergunta:** *“E se faltar CPF ou função?”*
**Resposta:** *"O sistema bloqueia antes de entrar na fila e mostra a pendência para correção."*

**Pergunta:** *“E se der erro no envio?”*
**Resposta:** *"O erro aparece na fila com ação recomendada, tentativa e rastreio."*

**Pergunta:** *“Consigo saber quem falhou?”*
**Resposta:** *"Sim, pela fila e pelo identificador de rastreio, sem expor documentos sensíveis."*

**Pergunta:** *“Dá para enviar mesmo com erro?”*
**Resposta:** *"Não. A ideia é impedir envio inseguro."*

---

## Plano de Apresentação (5 minutos)
* **Minuto 0–1:** Problema atual: planilhas, retrabalho, risco de erro.
* **Minuto 1–2:** Pré-admissão organizada no sistema.
* **Minuto 2–3:** Validação antes da exportação.
* **Minuto 3–4:** Dashboard operacional da fila.
* **Minuto 4–5:** Segurança, rastreabilidade e próximos passos.

---

## Checklist Final antes da Apresentação
Consulte o arquivo [PROTHEUS_EXPORT_DEMO_CHECKLIST.md](./PROTHEUS_EXPORT_DEMO_CHECKLIST.md) para revisar as travas de segurança e conferências de portas antes da demonstração.
