# Fix Domain Bug

Workflow curto para bugs em candidato, vaga, pipeline, análise IA, score, importação ou histórico.

Se houver conflito, `AGENTS.md` vence.

## Quando usar

- Quando o bug mexer em vaga ativa, pipeline ativo, análise atual ou score atual.
- Quando histórico, importação, match ou ranking parecerem decidir estado atual.
- Quando backend e frontend mostrarem estados diferentes para o mesmo candidato.

## Arquivos/áreas comuns

- `backend/src/application/services/`
- `backend/src/infrastructure/repositories/`
- `backend/src/interface/api/routers/`
- `frontend/src/features/candidates/`
- `frontend/src/features/pipeline/`
- `backend/tests/integration/`
- `backend/tests/unit/`

## Passo a passo

1. Confirmar a regra de domínio aplicável no `AGENTS.md`.
2. Definir a fonte de verdade do caso atual.
3. Localizar onde o estado é criado, persistido, lido e exibido.
4. Confirmar se o erro nasce no backend, no frontend ou no contrato entre ambos.
5. Aplicar a menor correção segura, sem fallback legado e sem endpoint paralelo.
6. Cobrir a regressão com teste de integração e, se houver cálculo, com teste unitário.

## Checklist antes de concluir

- [ ] `pipeline ativo = vaga ativa` continua verdadeiro.
- [ ] Sem pipeline ativo não existe score atual nem análise atual.
- [ ] Histórico não decide estado atual.
- [ ] Importação não criou vínculo ativo fora do fluxo oficial.
- [ ] Frontend exibe só o estado atual vindo da fonte correta.
- [ ] Existe teste cobrindo a regressão corrigida.

## Erros comuns a evitar

- Inferir vaga atual por `latest_analysis`, score antigo ou histórico.
- Corrigir só a UI quando a regra errada nasce no backend.
- Ajustar só texto explicativo e não o score final usado na decisão.
- Criar exceção de domínio para manter fluxo legado.
- Manter código morto, fallback silencioso ou regra duplicada.
