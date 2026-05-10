---
name: security
description: Segurança do sistema — autenticação, autorização, tenant, dados sensíveis, uploads, tokens, logs e proteção no backend.
---

## Objetivo

Garantir que todas as operações do sistema sejam seguras, isoladas por tenant e protegidas contra acesso não autorizado.

## Quando usar

- Ao criar ou modificar endpoints
- Ao lidar com upload de arquivos
- Ao acessar dados de candidatos, vagas ou empresas
- Ao manipular tokens, secrets ou sessões
- Ao implementar qualquer operação que envolva múltiplos tenants

## Regras principais

- Todo endpoint deve verificar autenticação antes de executar qualquer lógica.
- Todo acesso a dados deve ser filtrado pelo tenant (empresa) do usuário autenticado.
- Nunca expor dados de um tenant para outro.
- Tokens e secrets nunca devem aparecer em logs, respostas de API ou frontend.
- Uploads devem validar tipo de arquivo, tamanho e origem antes de salvar.
- Dados sensíveis (CPF, contato, currículo) só podem ser acessados por usuários autorizados dentro do tenant.
- Erros de autorização devem retornar 403, nunca expor detalhes internos.
- Logs devem registrar ações críticas (criação, remoção, transferência) sem expor dados sensíveis.

## Nunca fazer

- Não confiar em dados vindos do frontend para decidir tenant ou permissão.
- Não retornar stack traces ou detalhes internos em respostas de erro para o cliente.
- Não armazenar secrets em código ou variáveis de ambiente versionadas.
- Não permitir acesso cross-tenant, mesmo que acidental.
- Não logar tokens, senhas ou dados pessoais identificáveis.
- Não permitir upload sem validação de tipo e tamanho.

## Checklist antes de concluir

- [ ] Endpoint verifica autenticação?
- [ ] Query está filtrada pelo tenant do usuário?
- [ ] Upload valida tipo e tamanho?
- [ ] Nenhum secret aparece em log ou resposta?
- [ ] Erro retorna mensagem genérica sem expor internals?
- [ ] Ação crítica foi registrada em log de auditoria?
