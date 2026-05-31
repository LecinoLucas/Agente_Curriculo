# Information Architecture: IA Vaga Visual Mock

## Entry Point

- Página real: `/vagas/nova` e `/vagas/:id/editar`
- Área afetada: topo operacional do `JobFormPage`, antes do stepper principal

## Local Flow

1. Usuário entra no cadastro real de vaga.
2. Escolhe `Cadastro manual` ou `Criar com IA`.
3. Em `Criar com IA`, informa uma descrição ou usa o exemplo.
4. Clica em `Gerar exemplo com IA`.
5. Vê um rascunho com:
   - título
   - resumo
   - responsabilidades
   - requisitos obrigatórios
   - diferenciais
   - perguntas de triagem
   - etapas sugeridas
6. Clica em `Aplicar ao formulário`.
7. Volta ao modo manual com feedback de revisão.

## Hierarchy

1. Header da página
2. Alternância de modo
3. Painel mockado de IA
4. Feedback de rascunho aplicado
5. Stepper e formulário real

## State Model

- `manual`: formulário segue como hoje.
- `ai`: painel mockado aparece.
- `loading`: geração simulada em andamento.
- `ready`: rascunho visível.
- `applied`: painel fecha e o formulário real recebe os dados.

## Integration Notes

- O apply escreve apenas em campos já existentes do formulário.
- Salvamento e publicação continuam dependentes dos botões e regras já existentes.
- O local de futura integração real fica concentrado no gerador mock.
