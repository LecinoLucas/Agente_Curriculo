# Skill Language Alignment - AI Assistant Job Presenter

## Mudanças de Nomenclatura

Para alinhar a comunicação do assistente com o vocabulário real do RH e do sistema, foram feitas as seguintes substituições no frontend:

| Termo Anterior | Novo Termo (RH) | Contexto no Código |
| :--- | :--- | :--- |
| Skills obrigatórias | **Skills essenciais** | `mandatory_skills` |
| Skills desejáveis | **Skills diferenciais** | `nice_to_have_skills` |

## Ajustes nas Pendências

As mensagens de pendência foram atualizadas para refletir a nova nomenclatura:

- **Anterior:** "Skills obrigatórias não informadas."
- **Novo:** "**Skills essenciais não informadas.**"

A ação sugerida também foi alinhada:
- **Anterior:** "Cadastre skills obrigatórias para melhorar a precisão."
- **Novo:** "**Cadastre as skills essenciais da vaga para melhorar a triagem.**"

## Impacto na UX

1. **Consistência:** O assistente agora fala a mesma língua que o usuário e a mesma língua da tela de cadastro de vaga.
2. **Clareza Operacional:** "Essencial" e "Diferencial" são termos mais precisos para a triagem do que "Obrigatório" e "Desejável" no contexto deste produto.
3. **Tom de Voz:** O tom de voz tornou-se mais profissional e menos "duro", mantendo a autoridade sobre o impacto no ranking.
