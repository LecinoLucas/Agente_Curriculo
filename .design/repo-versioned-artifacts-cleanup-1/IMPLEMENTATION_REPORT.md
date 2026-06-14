# Relatório de Implementação — F2: REPO-VERSIONED-ARTIFACTS-CLEANUP-1

> **Data:** 2026-06-14
> **Branch:** `save/behavioral-ai-and-wips`
> **Tipo:** Higiene de versionamento — nenhum código de produção foi alterado.

---

## Resumo

39 arquivos removidos do índice Git (`git rm --cached`) sem apagar do disco local.
3 regras adicionadas ao `.gitignore` para proteger contra reentrada.
Apenas `.gitignore` foi modificado como arquivo de texto.

---

## Arquivos Removidos do Versionamento

> Status `D ` no `git status` = removido do índice, arquivo permanece no disco.

### Bancos SQLite de teste (2 arquivos)

| Arquivo | Tamanho | Coberto pelo .gitignore? |
|---|---|---|
| `backend/test_transfer.db` | 556 KB | Sim — `**/*.db` (linha 90) |
| `backend/test_run.db` | 0 B | Sim — `**/*.db` (linha 90) |

### Output / artefato de seed (2 arquivos)

| Arquivo | Tamanho | Coberto pelo .gitignore? |
|---|---|---|
| `backend/full_output.txt` | 36 KB | **Não** → regra adicionada nesta fase |
| `backend/.seeded` | 0 B | **Não** → regra adicionada nesta fase |

### PNGs de smoke test (33 arquivos, diretório `.tmp-smoke/`)

| Subdiretório | Qtd. arquivos | Coberto pelo .gitignore? |
|---|---|---|
| `.tmp-smoke/` (raiz) | 19 PNGs | **Não** → regra adicionada nesta fase |
| `.tmp-smoke/outros-testes-demo/` | 14 PNGs | **Não** → coberto pela regra `.tmp-smoke/` adicionada |

Tamanho total do diretório: **3,9 MB**.

### Artefatos de node_modules duplicado (2 arquivos)

| Arquivo | Coberto pelo .gitignore? |
|---|---|
| `frontend/node_modules 2/.deps-stamp` | Sim — `frontend/node_modules 2/` (linha 50) |
| `frontend/node_modules 2/.package-lock.json` | Sim — `frontend/node_modules 2/` (linha 50) |

---

## Arquivos Mantidos por Dúvida

Nenhum. Todos os candidatos citados pela auditoria foram confirmados como artefatos
gerados/locais e removidos. Nenhum arquivo com ambiguidade foi tocado.

---

## Alterações no `.gitignore`

Seção adicionada ao final do arquivo raiz `.gitignore`:

```gitignore
# REPO-VERSIONED-ARTIFACTS-CLEANUP-1 - artefatos locais não cobertos anteriormente
.tmp-smoke/
backend/.seeded
backend/full_output.txt
```

**Por que estas 3 regras:**
- `.tmp-smoke/` — diretório de screenshots de smoke test; gerado automaticamente por scripts de teste visual; não era coberto por nenhuma regra existente.
- `backend/.seeded` — flag criado por `scripts/bootstrap_dev.py` para marcar banco como populado; é estado local de ambiente de dev.
- `backend/full_output.txt` — output capturado de execução; o `.gitignore` cobria `backend/output.txt` mas não `full_output.txt`.

O `.gitignore` do backend (`backend/.gitignore`) não foi alterado — suas regras não precisavam de complemento para estes casos.

---

## Comandos Usados

```bash
# Auditoria (somente leitura)
git ls-files | grep -E "\.(db|sqlite|sqlite3)$"
git ls-files | grep -E "(\.coverage|coverage\.xml)"
git ls-files | grep -E "full_output|\.seeded|\.tmp-smoke|test-results"
git ls-files | grep -E "\.(log|tmp|temp)$"
git ls-files | grep -E "(node_modules|__pycache__|\.pyc$)"
du -sh backend/test_transfer.db backend/test_run.db backend/full_output.txt backend/.seeded .tmp-smoke/
git check-ignore -v --no-index <arquivos>   # verificar cobertura do .gitignore

# Alteração no .gitignore (Edit)
# Adicionadas 3 linhas ao final de .gitignore

# Remoção do índice (sem apagar do disco)
git rm --cached backend/test_transfer.db backend/test_run.db backend/full_output.txt backend/.seeded
git rm --cached -r .tmp-smoke/
git rm --cached "frontend/node_modules 2/.deps-stamp" "frontend/node_modules 2/.package-lock.json"

# Validação
git status --short          # confirma 39 entradas "D " (removidas do índice)
ls -lh backend/test_transfer.db backend/.seeded ...   # arquivos ainda no disco
```

---

## Confirmação: Código de Produção Intocado

`git status --short` mostra apenas dois tipos de mudança:
- `D ` — arquivos removidos do índice (os 39 artefatos)
- `M .gitignore` — único arquivo de texto alterado

Nenhum arquivo em `backend/src/`, `frontend/src/`, `candidate-portal/src/` foi tocado.
Nenhuma migration, nenhum build, nenhuma instalação de dependências.

---

## Riscos

| # | Risco | Avaliação | Mitigação |
|---|---|---|---|
| R1 | `backend/test_transfer.db` pode ser necessário para testes de integração pesados | Baixo — é um banco gerado por seed, não fixture de testes | Pode ser recriado com `scripts/bootstrap_dev.py` |
| R2 | `.seeded` removido pode causar re-execução do bootstrap | Baixo — é apenas uma flag de controle | Arquivo ainda existe no disco local; não afeta outros devs |
| R3 | Alguém pode ter scripts que dependem de `.tmp-smoke/` estar versionado | Mínimo — é outputs de screenshots de design | Arquivos continuam no disco |
| R4 | `full_output.txt` pode ser usado como fixture de referência | Baixo — nome sugere output capturado | Arquivo ainda existe no disco local |

---

## Próxima Fase Recomendada

**F3 — `docs-consolidation`**: reorganizar a documentação dispersa nos 5 locais
(`raiz`, `docs/`, `backend/docs/`, `workflows/`, `.design/`) em uma estrutura canônica
`docs/{architecture,deploy,protheus,ai,product,testing}`, arquivando `.design/` como
histórico somente-leitura.

Impacto: alto (melhora muito a navegabilidade para humanos e IA).
Risco: baixo (somente movimentação de documentação, sem código de produção).
Pré-requisito: fase não destrutiva; pode ser feita em qualquer momento após F2.
