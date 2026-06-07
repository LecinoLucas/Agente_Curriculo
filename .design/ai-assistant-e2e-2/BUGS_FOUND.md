# Bugs Encontrados (e Correções)

| ID | Severidade | Descrição | Evidência | Correção/Recomendação |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-E2E2-01** | Baixa | O teste `qa-assistant-admission.spec.ts` falhava incorretamente porque usava as palavras literais `"cpf"`, `"phone"`, `"email"` no seu array de `SENSITIVE_TERMS`. Como o sistema extrai texto do RAG contendo frases instrucionais como "enviar documento rg ou cpf", o teste capturava a palavra genérica e falhava, assumindo um vazamento de dados. | Falha do Playwright (`expect(received).not.toContain("cpf")`) no trecho extraído do banco de dados que explicava as regras. | O teste foi ajustado. `SENSITIVE_TERMS` agora avalia o não-vazamento do CPF fake (`00000000000`) e do E-mail fake (`qa.admissional@example.test`), validando estritamente os dados do seed e mantendo a verificação sobre termos sistêmicos (`payload_json`, `vector_json`, etc.). A suíte passou a rodar perfeitamente. |
