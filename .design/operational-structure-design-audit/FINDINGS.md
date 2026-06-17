# Findings

## OSD-001

- Severidade: **ALTO**
- Área: **UX, Design, Dados**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:32)
  - [operationalMasterService.ts](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/services/operationalMasterService.ts:4)
- Descrição:
  A linguagem da tela mistura `grupo`, `filial`, `posto`, `nome`, `nome público`, `localidade` e o conceito técnico de `unidade operacional` sem um padrão terminológico forte.
- Evidência:
  A aba principal se chama `Filiais/Postos`, o formulário usa `Filial` para `branch_code`, `Nome` para `name`, e o domínio técnico do backend é `OperationalUnit`.
- Impacto:
  RH/Admin pode cadastrar o registro correto no campo errado ou interpretar `filial` como empresa/filial contábil em vez de unidade operacional do ATS.
- Recomendação:
  Adotar padrão explícito:
  - Staff/Admin: `Unidade operacional`
  - Código interno: `Código da filial/unidade`
  - Portal: `Nome público exibido ao candidato`
  - Agrupador: `Grupo operacional`

## OSD-002

- Severidade: **ALTO**
- Área: **UX, Portal**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:449)
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:973)
- Descrição:
  A tela diz que o candidato verá `localidade`, `nome público` e `ponto de referência`, mas a listagem principal da unidade não mostra `nome público` nem `ponto de referência`.
- Evidência:
  O bloco “Contrato operacional” afirma isso, mas a tabela de unidades lista apenas `Grupo`, `Filial`, `Nome`, `Localidade`, `Status`, `Atualizado`.
- Impacto:
  O administrador não consegue revisar rapidamente o texto efetivamente exposto no portal, elevando risco de inconsistência pública.
- Recomendação:
  Mostrar pelo menos `nome público` e um resumo do `ponto de referência` na linha da unidade ou em expansão rápida.

## OSD-003

- Severidade: **CRÍTICO**
- Área: **UX, Dados, Portal, Protheus**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:663)
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:1048)
  - [operational_master.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/routers/operational_master.py:174)
- Descrição:
  Inativação e reativação acontecem sem confirmação e sem qualquer aviso sobre impacto em vagas, candidaturas, pipeline, pré-admissão ou ERP.
- Evidência:
  O botão `Inativar/Reativar` chama `toggleUnit/toggleGroup/toggleLocation` diretamente.
- Impacto:
  Um clique operacional simples pode alterar referência ativa usada em fluxos críticos sem qualquer guardrail humano.
- Recomendação:
  Introduzir confirmação contextual e indicadores de dependência antes de permitir a ação.

## OSD-004

- Severidade: **ALTO**
- Área: **UX, Dados**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:741)
  - [sqlalchemy_operational_master_repository.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/infrastructure/repositories/sqlalchemy_operational_master_repository.py:145)
- Descrição:
  A tela não mostra contadores de uso ou vínculos operacionais da unidade.
- Evidência:
  Não há colunas, badges ou resumo de uso em vagas, candidaturas, pipeline ou casos.
- Impacto:
  O usuário pode alterar cadastro “cego”, sem saber se aquela unidade está em produção.
- Recomendação:
  Expor indicadores mínimos de uso por unidade/grupo antes de ação de inativação ou edição sensível.

## OSD-005

- Severidade: **ALTO**
- Área: **Design, UX**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:717)
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:846)
- Descrição:
  A informação está segmentada em abas planas, mas a relação hierárquica `Grupo -> Unidades` não é visualizada.
- Evidência:
  A aba de grupos não mostra contagem/lista de unidades do grupo, e a aba de unidades mostra só o código do grupo.
- Impacto:
  Fica difícil detectar unidade no grupo errado ou entender distribuição operacional com muitos cadastros.
- Recomendação:
  Tornar a hierarquia mais explícita na visão principal, ao menos com nome do grupo, total de unidades e navegação contextual.

## OSD-006

- Severidade: **MÉDIO**
- Área: **UX, Dados**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:606)
  - [operational_master_service.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/application/services/operational_master_service.py:118)
- Descrição:
  O backend tem mensagens específicas de conflito/validação, mas o frontend converte tudo em toasts genéricos.
- Evidência:
  `saveGroup/saveLocation/saveUnit` usam `catch { toast.error("Não foi possível...") }`.
- Impacto:
  O operador não entende se o problema foi duplicidade, campo obrigatório, relação pai ausente ou permissão.
- Recomendação:
  Exibir erros operacionais específicos e, quando possível, apontar o campo afetado.

## OSD-007

- Severidade: **MÉDIO**
- Área: **Portal, Bot**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:416)
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:449)
- Descrição:
  `Nome público` existe, mas não é explicado no campo como sendo o nome exibido ao candidato.
- Evidência:
  O label é apenas `Nome público`, sem hint contextual.
- Impacto:
  RH pode preencher com o mesmo valor do nome interno ou com texto inadequado para portal.
- Recomendação:
  Adicionar microcopy explícita: “Esse nome aparece para candidato no portal e em contextos operacionais públicos.”

## OSD-008

- Severidade: **MÉDIO**
- Área: **Scalability, UX**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:535)
  - [DataTable.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/components/common/DataTable.tsx:1)
- Descrição:
  A tela busca até 100 registros por aba, mas não oferece paginação nem agrupamento visual.
- Evidência:
  `page_size: 100` fixo e a tabela não exibe paginação/total navegável.
- Impacto:
  A experiência tende a piorar com crescimento operacional e dificulta leitura com bases grandes.
- Recomendação:
  Introduzir paginação, agrupamento ou visão expandível por grupo/localidade.

## OSD-009

- Severidade: **MÉDIO**
- Área: **Protheus, Design**
- Arquivos envolvidos:
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:390)
  - [operational_master_schemas.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/schemas/operational_master_schemas.py:54)
- Descrição:
  O formulário atual não tem espaço conceitual claro para futura configuração ERP/Protheus.
- Evidência:
  Os modais concentram dados cadastrais básicos, mas não separam “identidade operacional” de “configuração técnica”.
- Impacto:
  Se campos Protheus forem adicionados diretamente no mesmo modal, a experiência tende a ficar confusa e densa.
- Recomendação:
  Reservar futura seção “Configuração técnica/ERP” separada da seção pública-operacional.

## OSD-010

- Severidade: **BAIXO**
- Área: **Permissão**
- Arquivos envolvidos:
  - [dependencies.py](/Users/lecinolucas/Developer/Agente_Curriculo/backend/src/interface/api/dependencies.py:74)
  - [EstruturaOperacionalPage.tsx](/Users/lecinolucas/Developer/Agente_Curriculo/frontend/src/pages/EstruturaOperacionalPage.tsx:748)
- Descrição:
  A política de permissão é coerente, mas o papel `viewer` nem consegue listar e isso não fica documentado na própria tela.
- Evidência:
  O backend libera listagem para `HR`, `RECRUITER`, `ADMIN` e bloqueia `VIEWER`.
- Impacto:
  Pode haver surpresa de acesso para perfis de consulta passiva.
- Recomendação:
  Formalizar a regra de acesso na documentação operacional e no desenho de perfil.
