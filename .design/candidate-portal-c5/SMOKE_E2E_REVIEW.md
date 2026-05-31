# Revisão de Teste de Fumaça E2E Real — candidate-portal (C5)

Este documento documenta a validação ponta a ponta do `candidate-portal` integrado com o backend real.

## Ambiente Usado
*   **Sistema Operacional:** macOS
*   **Portas de Execução:**
    *   **Candidate Portal:** `http://localhost:5174` (Vite dev server)
    *   **Backend API:** `http://localhost:8000` (FastAPI / Uvicorn)
    *   **Serviço de Fila (Celery):** Concurrencia 2, filas de análise e IA ativas.
*   **Ferramenta E2E:** Playwright (Chromium em modo headless / browser isolado)

## Comandos Executados
1.  **Build do Candidate Portal:**
    ```bash
    npm --prefix candidate-portal run build
    ```
2.  **Build do Frontend Admin/Staff:**
    ```bash
    npm --prefix frontend run build
    ```
3.  **Execução do Teste E2E:**
    ```bash
    npx playwright test e2e/smoke-c5.spec.ts --config=e2e/smoke.config.ts
    ```

---

## Rotas e Funcionalidades Testadas

| Passo | Rota / Ação | Descrição | Resultado |
| :--- | :--- | :--- | :--- |
| **1** | `/vagas` | Listagem de vagas reais vindas da API | **OK** |
| **2** | `/vagas/{id-real}` | Visualização dos detalhes da vaga | **OK** |
| **3** | `/candidatar/{id-real}` | Exibição do formulário de candidatura | **OK** |
| **4** | Envio de Candidatura | Cadastro de dados pessoais + senha + Upload de PDF de currículo válido + Consentimento LGPD | **OK** (Cadastra e vincula currículo real) |
| **5** | `/sucesso` | Tela de sucesso após submissão | **OK** |
| **6** | Botão "Acessar minha área" | Redirecionamento automático e navegação para `/minha-area` | **OK** |
| **7** | `/login` | Redirecionamento automático por falta de sessão e exibição do form de login | **OK** |
| **8** | Login Candidato | Autenticação no portal usando e-mail e senha cadastrados no passo 4 | **OK** |
| **9** | `/minha-area` | Exibição do overview real com a candidatura e cronograma atualizados | **OK** |
| **10** | Refresh em `/minha-area` | Atualização da página (F5) mantendo a sessão persistida | **OK** |
| **11** | `/avaliacao` | Carregamento da avaliação comportamental pendente para a vaga | **OK** |
| **12** | Responder Avaliação | Preenchimento dinâmico das 13 perguntas da avaliação e submissão à API | **OK** (Respostas persistidas no banco) |
| **13** | `/pre-admissao` | Acesso à tela de pré-admissão | **OK** |
| **14** | Estado de Pré-Admissão | Exibição correta do estado vazio "Nenhuma pré-admissão ativa" | **OK** |
| **15** | Logout | Clique no botão "Sair" e encerramento de sessão | **OK** |
| **16** | Rota Protegida sem Sessão | Tentativa de acessar `/minha-area` deslogado redireciona para `/login` | **OK** |

---

## Bugs Encontrados e Corrigidos

### 1. Ausência de Senha no Formulário de Candidatura
*   **Problema:** A API real exige senha (`password` e `confirm_password`) na criação do candidato ao se candidatar a uma vaga. O `candidate-portal` não possuía esses campos na UI e não os enviava ao backend, gerando erros de validação (`ValidationException`) que impediam candidaturas integradas.
*   **Correção:** Adicionados campos de senha no passo 1 do formulário em `ApplicationFormPage.tsx` e mapeado o payload no serviço `publicApplicationService.ts`.

### 2. Acessibilidade do Dropdown de Estado
*   **Problema:** O elemento `<select>` do campo de Estado não continha um `id` associado ao `htmlFor` do `<label>`, impossibilitando sua identificação automática por ferramentas de acessibilidade e pelo Playwright via `.getByLabel("Estado")`.
*   **Correção:** Adicionados `id` e `htmlFor` corretos ao campo.

---

## Must-Fix (Antes de Produção)
*   *Nenhum blocker ativo.* Todos os fluxos críticos de ponta a ponta estão totalmente integrados e validados pelo teste E2E real.

## Should-Fix Futuro
*   **Recuperação Assíncrona do Nome no Header:** Caso o usuário acesse rotas autenticadas secundárias como `/avaliacao` ou `/pre-admissao` por meio de uma navegação direta ou refresh, a sessão real é mantida (via cookies/localStorage), porém a variável de estado React `candidateName` é perdida. O `CandidatePortalLayout` deveria chamar a API para recarregar o perfil se a sessão for válida e `candidateName` estiver nulo, evitando que a barra de navegação pareça estar deslogada.

---

## Confirmação de Integridade
*   **Backend:** Não alterado.
*   **Frontend Interno (admin/staff):** Não alterado (apenas a build final foi validada para garantir que nenhuma dependência foi quebrada).
*   **Geral:** Não houve criação de mocks adicionais ou alteração de regras de negócios.
