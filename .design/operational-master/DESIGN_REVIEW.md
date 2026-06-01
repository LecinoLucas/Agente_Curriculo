# Design Review: Estrutura Operacional

Reviewed against: OP-1B reconstruida para `/admin/estrutura-operacional`
Date: 2026-06-01
Status: validado com backend real

## Screenshots Captured

- `.design/operational-master/screenshots/estrutura-operacional-desktop-1280.png`
- `.design/operational-master/screenshots/estrutura-operacional-tablet-768.png`
- `.design/operational-master/screenshots/estrutura-operacional-mobile-375.png`

## Resultado do Review

A tela `/admin/estrutura-operacional` renderiza apos login admin e consome os endpoints reais do Cadastro Mestre Operacional:

- `/api/v1/operational-groups`
- `/api/v1/location-groups`
- `/api/v1/operational-units`

As tres abas aparecem corretamente:

- Grupos
- Localidades
- Filiais/Postos

Foram validadas via UI autenticada:

- listagem/carregamento real dos endpoints;
- criacao de grupo, localidade e filial/posto;
- edicao de grupo;
- inativacao e reativacao por PATCH;
- ausencia de DELETE na interface;
- responsividade em desktop, tablet e mobile.

Registro local criado para review:

- Grupo: `OP708524` / `Grupo OP1B 708524`
- Localidade: `Teste OP1B 708524`
- Filial/Posto: `U708524` / `Posto OP1B 708524`

Observacao: uma tentativa anterior interrompida criou tambem o grupo `OP690305`. Como a fase nao possui DELETE e a regra operacional e inativar em vez de remover, o registro foi mantido.

## Validacao Executada

- Backend real em `http://127.0.0.1:8000`: `GET /health` retornou `status=ok` com banco conectado.
- Frontend real em `http://localhost:5173`.
- Login admin validado com `admin@resume.ai`.
- Build frontend executado com sucesso: `npm --prefix frontend run build`.
- Testes focados executados com sucesso: `npm --prefix frontend run test -- operationalMasterService EstruturaOperacionalPage`.
- API confirmou usuarios smoke `recruiter` e `viewer` ativos e login valido com senha de smoke. A validacao visual desses perfis nao foi concluida porque o ambiente bloqueou a execucao de um segundo script Playwright.

## Checklist Solicitado

| Item | Resultado |
| --- | --- |
| Subir backend e frontend | OK |
| Logar como admin | OK |
| Abrir `/admin/estrutura-operacional` | OK |
| Confirmar abas Grupos, Localidades, Filiais/Postos | OK |
| Confirmar listagem/carregamento real dos endpoints | OK |
| Criar/editar/inativar/reativar registro de teste | OK |
| Confirmar HR/recruiter leitura sem escrita | Parcial: coberto por teste unitario de pagina; validacao visual bloqueada pelo ambiente |
| Confirmar viewer bloqueado/sem acoes proibidas | Parcial: credencial smoke disponivel; validacao visual bloqueada pelo ambiente |
| Gerar screenshots desktop/tablet/mobile | OK |

## Findings

### Must Fix

Nenhum bloqueio visual ou funcional encontrado no fluxo admin reconstruido.

### Should Fix

1. Capturar uma imagem mobile adicional com rolagem na tabela em uma etapa futura.

   A captura mobile atual registra o topo da tela e os cards/abas. A tabela fica abaixo do primeiro viewport dentro do shell com rolagem.

2. Validar visualmente `recruiter`, `hr` e `viewer` quando o ambiente permitir nova execucao Playwright.

   O codigo da tela remove acoes de escrita para nao-admin e a rota bloqueia `viewer` por contrato estatico. Os testes focados cobrem `recruiter` em modo somente leitura.

## Riscos

- Registros locais de teste foram criados porque a fase nao inclui seed dos 51 postos e nao possui DELETE por design.
- A tela usa `page_size=100` para administracao local do cadastro mestre; paginacao dedicada pode ser necessaria se o volume crescer muito alem dos 51 postos previstos.
- A validacao visual de perfis nao-admin ficou parcial por bloqueio do ambiente, apesar de haver cobertura automatizada para modo somente leitura.

## Confirmacao de Escopo

Nao houve alteracao de backend, vagas, pipeline, candidato, candidate portal, bot, WhatsApp, matching/IA ou pre-admissao durante a reconstrucao e review da OP-1B.
