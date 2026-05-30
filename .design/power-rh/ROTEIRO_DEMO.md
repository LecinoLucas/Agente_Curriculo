# Power RH 11 — Roteiro de demonstração autenticado

## 1. Objetivo da demo

Apresentar o fluxo diário do RH dentro do Power RH, mostrando como o time sai de uma operação espalhada entre Google Forms, planilhas, Agenda e WhatsApp para uma central simples de trabalho.

A demo deve provar três pontos:

- o RH sabe o que precisa de atenção hoje;
- a IA ajuda a criar vaga e priorizar candidaturas;
- as ações operacionais ficam acessíveis sem transformar o fluxo em um cockpit pesado.

## 2. Perfil do usuário

Usuário principal: profissional de RH que hoje recebe candidatos por formulário, organiza triagem em planilha, agenda entrevistas manualmente e usa WhatsApp para contato.

Expectativa desse usuário:

- entender rapidamente onde começar;
- ver candidatos e vagas em uma visão parecida com planilha;
- identificar quem precisa de ação;
- executar ações comuns com poucos cliques;
- abrir Pipeline apenas quando precisar de controle operacional mais avançado.

## 3. Pré-requisitos

- Sistema rodando em ambiente local ou homologação.
- Login autenticado com perfil `admin`, `hr` ou `recruiter`.
- Usuário com permissão para acessar `/rh`, `/vagas/nova`, `/candidaturas`, `/pipeline` e, quando aplicável, pré-admissão.
- Pelo menos uma vaga disponível ou permissão para criar vaga.
- Pelo menos um candidato existente para demonstrar score, contato, entrevista e Pipeline.
- Um arquivo CSV simples para demonstrar importação, com dados mínimos de candidato.
- IA configurada quando a demo incluir geração de vaga ou score real.
- Backend e frontend apontando para a mesma base de dados.

## 4. Roteiro passo a passo

### 4.1 Abrir a Central RH

1. Fazer login com usuário de RH.
2. Acessar `/rh` pelo menu "Central RH".
3. Mostrar o título "Central RH" e o subtítulo "Veja o que precisa de atenção hoje.".
4. Explicar os cards:
   - Candidatos novos;
   - Entrevistas de hoje;
   - Aguardando decisão;
   - Pré-admissões pendentes;
   - Admitidos no mês.
5. Abrir o bloco "Pendências do dia".
6. Mostrar que cada pendência tem candidato, vaga, pendência, próxima ação e atalho.

Mensagem de apresentação:

> "Aqui o RH começa o dia. Em vez de abrir planilha, agenda e conversas soltas, ele vê primeiro o que precisa de atenção."

### 4.2 Criar uma vaga com IA

1. Acessar `/vagas/nova`.
2. Clicar em "Criar com IA".
3. Informar ou colar uma descrição simples da vaga.
4. Gerar o rascunho com IA.
5. Revisar os campos preenchidos.
6. Aplicar o rascunho no formulário.
7. Ajustar qualquer campo necessário.
8. Salvar a vaga.

Mensagem de apresentação:

> "Aqui a IA ajuda a estruturar a vaga, mas o RH continua revisando antes de salvar."

### 4.3 Abrir Candidaturas

1. Acessar `/candidaturas`.
2. Mostrar a listagem em formato de planilha inteligente.
3. Destacar os blocos compactos de candidato, vaga, score IA, status, entrevista e próxima ação.
4. Explicar que filtros e busca ajudam a reduzir a lista sem sair da tela.

Mensagem de apresentação:

> "Aqui substituímos a planilha: o RH vê candidato, vaga, status, score e próxima ação em uma única visão."

### 4.4 Adicionar candidato manual

1. Em `/candidaturas`, clicar em "Adicionar candidato".
2. Usar a aba manual.
3. Preencher dados mínimos do candidato.
4. Vincular à vaga quando o fluxo pedir.
5. Salvar.
6. Confirmar que o candidato aparece na listagem.

Mensagem de apresentação:

> "Quando chega um candidato fora do fluxo padrão, o RH consegue registrar sem depender de outra ferramenta."

### 4.5 Importar CSV

1. Em `/candidaturas`, abrir "Adicionar candidato".
2. Usar a aba de importação.
3. Selecionar um CSV simples.
4. Conferir o preview.
5. Confirmar a importação.
6. Mostrar o resultado da importação.
7. Se nenhum candidato válido for importado, mostrar o estado claro de conclusão sem válidos.

Mensagem de apresentação:

> "Se o RH já tem uma planilha, ele consegue trazer os dados sem transformar isso em uma integração pesada."

### 4.6 Ver score IA e próxima ação

1. Na listagem de `/candidaturas`, escolher um candidato com score.
2. Mostrar o badge de aderência:
   - Alta aderência;
   - Avaliar;
   - Baixa aderência;
   - Aguardando IA.
3. Mostrar a coluna "Próxima ação".
4. Explicar exemplos:
   - Analisar currículo;
   - Marcar entrevista;
   - Copiar WhatsApp;
   - Registrar decisão;
   - Acompanhar pré-admissão;
   - Sem ação pendente.

Mensagem de apresentação:

> "A IA não decide pelo RH. Ela ajuda a priorizar e a deixar claro qual é o próximo passo."

### 4.7 Marcar entrevista

1. Selecionar candidato em `/candidaturas`.
2. Abrir a ação de marcar entrevista.
3. Informar data e hora.
4. Confirmar.
5. Mostrar a entrevista atualizada na linha ou no drawer.
6. Se houver agenda do dia em `/rh`, voltar para a Central RH e mostrar reflexo quando aplicável.

Mensagem de apresentação:

> "A entrevista fica registrada no fluxo do candidato, sem depender de uma anotação paralela."

### 4.8 Copiar WhatsApp

1. Em `/candidaturas`, usar a ação "Copiar WhatsApp".
2. Mostrar que o sistema copia o contato ou mensagem para uso manual.
3. Reforçar que não há envio automático.

Mensagem de apresentação:

> "Aqui o sistema apoia o contato, mas não faz integração real com WhatsApp nesta demo."

### 4.9 Abrir Pipeline

1. A partir de uma candidatura, clicar em "Abrir Pipeline".
2. Confirmar abertura do Pipeline com o candidato em contexto quando houver `candidateId`.
3. Explicar que o Pipeline é usado para operação avançada, não para substituir a visão rápida de Candidaturas.

Mensagem de apresentação:

> "Quando o RH precisa operar etapa, bloqueio ou movimentação com mais detalhe, ele abre o Pipeline já no contexto certo."

### 4.10 Decisão

1. Abrir o candidato pelo drawer ou perfil completo.
2. Mostrar a área de decisão quando disponível.
3. Registrar ou explicar o ponto onde a decisão é tomada.
4. Se o candidato for reprovado, demonstrar a ação de reprovar somente se fizer sentido para o cenário.
5. Reforçar que ações destrutivas ficam separadas e menos chamativas.

Mensagem de apresentação:

> "A decisão fica registrada no processo, e ações sensíveis não competem visualmente com as ações principais."

### 4.11 Pré-admissão

1. Mostrar pré-admissão apenas quando o candidato estiver no ponto correto do fluxo.
2. Acessar `/admitidos` ou `/admissao/:caseId` quando houver caso existente.
3. Explicar que pré-admissão é separada do fluxo de triagem.
4. Não demonstrar Protheus real se o ambiente não estiver configurado.

Mensagem de apresentação:

> "A pré-admissão aparece depois da decisão. Ela não mistura triagem, entrevista e admissão no mesmo lugar."

## 5. Frases curtas para apresentar

- "Aqui substituímos a planilha."
- "Aqui a IA ajuda a estruturar a vaga."
- "Aqui o RH vê quem precisa de ação hoje."
- "A IA sugere prioridade, mas o RH continua decidindo."
- "Candidaturas é a visão rápida; Pipeline é a operação avançada."
- "WhatsApp aqui é apoio manual, não envio automático."
- "Pré-admissão começa depois da decisão, sem misturar etapas."

## 6. Pontos fora da demo

- Integração real com WhatsApp.
- Google Forms real.
- Nova integração com Google Agenda.
- Geração de XLSX.
- Protheus real quando o ambiente não estiver configurado.
- Alteração de regra de score, ranking, matching ou pipeline.
- Histórico pesado de candidato.
- Cockpit com gráficos avançados.

## 7. Checklist de smoke manual

- Login com `admin`, `hr` ou `recruiter` funciona.
- Perfil `candidate` não acessa `/rh`.
- `/rh` abre e mostra cards da Central RH.
- `/rh` mostra pendências ou estado vazio claro.
- Atalho "Abrir Candidaturas" leva para `/candidaturas`.
- `/vagas/nova` abre o formulário.
- Botão "Criar com IA" abre o painel de IA.
- Rascunho de IA pode ser aplicado ao formulário.
- Vaga pode ser salva.
- `/candidaturas` lista candidatos sem quebrar layout.
- Filtros de `/candidaturas` funcionam.
- Adição manual de candidato abre modal e salva dados mínimos.
- Importação CSV mostra preview e resultado.
- Score IA aparece como badge claro.
- Próxima ação aparece para candidatos da lista.
- Marcar entrevista atualiza data/hora visível.
- Copiar WhatsApp copia o contato ou mensagem esperada.
- Reprovar fica separado de ações principais.
- Abrir Pipeline preserva contexto do candidato quando há `candidateId`.
- Pré-admissão aparece apenas quando aplicável.
- Em notebook 1366px, botões não vazam.
- Em tablet/mobile, tabela usa rolagem ou layout responsivo sem quebrar.

## 8. Riscos conhecidos e warnings

- A demo depende de dados mínimos coerentes; uma base vazia deve mostrar estados vazios, mas reduz o impacto da apresentação.
- Score IA e criação de vaga com IA dependem de configuração do provedor no ambiente.
- "Copiar WhatsApp" não envia mensagem automaticamente.
- Agenda real externa não faz parte desta etapa.
- Protheus real não deve ser demonstrado sem configuração confirmada.
- Viewer pode acessar telas em modo leitura conforme permissões atuais, mas não deve executar ações de escrita.
- A suíte frontend passa, mas ainda emite warnings conhecidos de testes sobre React Router future flags e alguns `act()`/Radix; eles não bloqueiam o baseline.

## 9. Fechamento da demo

Encerrar retomando o fluxo completo:

1. Central RH mostra prioridades do dia.
2. Vaga nasce estruturada com ajuda da IA.
3. Candidaturas substitui a planilha operacional.
4. Entrevista, WhatsApp manual e decisão acontecem no mesmo contexto.
5. Pipeline entra quando há operação avançada.
6. Pré-admissão fica separada e só aparece quando aplicável.

Mensagem final:

> "O Power RH não tenta criar mais uma ferramenta para o RH alimentar. Ele organiza o trabalho que já existe em uma rotina mais clara, rastreável e rápida."
