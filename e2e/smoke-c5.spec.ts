import { expect, test } from "@playwright/test";
import * as path from "path";

test.describe("Smoke Real Ponta a Ponta: candidate-portal", () => {
  const candidateEmail = `smoke.c5.${Date.now()}@example.com`;
  const candidatePassword = "PortalAlice@1234";
  const candidateCpf = String(10_000_000_000 + (Date.now() % 89_999_999_999));

  test("fluxo completo do candidato", async ({ page }) => {
    // 1. Acessa /vagas
    console.log("Passo 1: Acessando /vagas...");
    await page.goto("http://localhost:5174/vagas");
    await expect(page.getByRole("heading", { name: "Vagas disponíveis" })).toBeVisible();
    
    // Obter o link da primeira vaga disponível e navegar diretamente (exigindo correspondência exata para evitar 'Ver vagas')
    const firstJobLink = page.getByRole("link", { name: "Ver vaga", exact: true }).first();
    await expect(firstJobLink).toBeVisible();
    const jobHref = await firstJobLink.getAttribute("href");
    console.log(`Link da vaga obtido: ${jobHref}`);

    // 2. Acessa /vagas/{id-real}
    console.log("Passo 2: Acessando detalhes da vaga diretamente...");
    await page.goto(`http://localhost:5174${jobHref}`);
    await page.waitForURL(/http:\/\/localhost:5174\/vagas\/.+/);
    
    const urlParts = page.url().split("/");
    const jobId = urlParts[urlParts.length - 1];
    console.log(`ID da vaga: ${jobId}`);

    // 3. Acessa /candidatar/{id-real}
    console.log("Passo 3: Acessando formulário de candidatura diretamente...");
    await page.goto(`http://localhost:5174/candidatar/${jobId}`);
    await page.waitForURL(/http:\/\/localhost:5174\/candidatar\/.+/);
    await expect(page.getByRole("heading", { name: "Candidatar-se" })).toBeVisible();

    // 4. Envio de candidatura com currículo válido
    console.log("Passo 4: Preenchendo dados pessoais (Passo 1)...");
    await page.getByLabel("Nome completo").fill("Fumaça Teste C5");
    await page.getByLabel("CPF").fill(candidateCpf);
    await page.getByLabel("E-mail").fill(candidateEmail);
    await page.getByLabel("Telefone").fill("62999999999");
    await page.getByLabel("Cidade").fill("Goiânia");
    await page.getByLabel("Estado").selectOption("GO");
    await page.getByLabel("Pretensão salarial").fill("5000");
    await page.getByText("CLT", { exact: true }).click();
    await page.getByLabel("Senha para o Portal").fill(candidatePassword);
    await page.getByLabel("Confirme a senha").fill(candidatePassword);
    
    await page.getByRole("button", { name: "Próximo" }).click();

    // Passo 2: Upload de currículo
    console.log("Passo 4 (continuação): Upload do currículo (Passo 2)...");
    await expect(page.getByRole("heading", { name: "Upload do currículo" })).toBeVisible();
    
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("label:has-text('Clique para selecionar ou arraste aqui')").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve(__dirname, "../backend/curriculo_teste.pdf"));

    await expect(page.locator("text=curriculo_teste.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Próximo" }).click();

    // Passo 3: Revision and Consent
    console.log("Passo 4 (continuação): Revisão e LGPD (Passo 3)...");
    await expect(page.getByRole("heading", { name: "Revisar candidatura" })).toBeVisible();
    await page.locator("input[type='checkbox']").check(); // LGPD consent
    
    console.log("Passo 4 (continuação): Enviando candidatura...");
    await page.getByRole("button", { name: "Enviar candidatura" }).click();

    // 5. Sucesso (/sucesso)
    console.log("Passo 5: Verificando tela de sucesso...");
    await page.waitForURL("http://localhost:5174/sucesso");
    await expect(page.getByRole("heading", { name: "Candidatura enviada!" })).toBeVisible();

    // 6. Botão "Acessar minha área" -> /minha-area (Navegação direta)
    console.log("Passo 6: Acessando /minha-area...");
    await page.goto("http://localhost:5174/minha-area");

    // 7. /login (redirecionado automaticamente se não autenticado)
    console.log("Passo 7: Validando redirecionamento para login / área...");
    await page.waitForURL(/http:\/\/localhost:5174\/(login|minha-area)/);
    
    if (page.url().includes("/login")) {
      console.log("Redirecionado para /login. Realizando login...");
      await page.getByLabel("E-mail").fill(candidateEmail);
      await page.getByLabel("Senha").fill(candidatePassword);
      await page.getByRole("button", { name: "Entrar" }).click();
    }
    
    // 8 e 9. /minha-area com overview real
    console.log("Passo 8 e 9: Acessando /minha-area com overview real...");
    await page.waitForURL("http://localhost:5174/minha-area");
    await expect(page.getByRole("heading", { name: /Fumaça/ })).toBeVisible();
    await expect(page.getByText("Acompanhe o status das suas candidaturas")).toBeVisible();

    // 10. Refresh em /minha-area mantendo sessão
    console.log("Passo 10: Atualizando a página (refresh) e verificando se mantém sessão...");
    await page.reload();
    await expect(page.getByRole("heading", { name: /Fumaça/ })).toBeVisible();

    // 11 e 12. /avaliacao
    console.log("Passo 11 e 12: Acessando aba /avaliacao...");
    await page.goto("http://localhost:5174/avaliacao");
    await page.waitForURL("http://localhost:5174/avaliacao");
    
    const assessmentHeading = page.getByRole("heading", { name: "Avaliação comportamental" });
    const emptyHeading = page.getByRole("heading", { name: "Nenhuma avaliação disponível" });
    await expect(assessmentHeading.or(emptyHeading)).toBeVisible({ timeout: 15000 });

    const hasPendingAssessment = await assessmentHeading.isVisible();
    if (hasPendingAssessment) {
      console.log("Avaliação comportamental pendente encontrada. Iniciando...");
      await page.getByRole("button", { name: "Iniciar avaliação" }).click();
      
      console.log("Respondendo perguntas da avaliação...");
      const cards = page.locator("div.rounded-xl").filter({ hasText: /Pergunta \d+ de/ });
      await expect(cards.first()).toBeVisible({ timeout: 15000 });
      const cardCount = await cards.count();
      console.log(`Encontradas ${cardCount} questões.`);
      for (let i = 0; i < cardCount; i++) {
        const card = cards.nth(i);
        
        const textarea = card.locator("textarea");
        if (await textarea.count() > 0) {
          await textarea.fill("Resposta de teste para fumaça.");
        }
        
        const scaleButtons = card.locator("button");
        if (await scaleButtons.count() > 0) {
          await scaleButtons.first().click();
        }
        
        const radioLabels = card.locator("label");
        if (await radioLabels.count() > 0) {
          await radioLabels.first().click();
        }
      }
      
      console.log("Enviando avaliação...");
      await page.getByRole("button", { name: "Finalizar avaliação" }).click();
      await expect(page.getByRole("heading", { name: "Avaliação enviada!" })).toBeVisible();
      await page.getByRole("button", { name: "Voltar à minha área" }).click();
      await page.waitForURL("http://localhost:5174/minha-area");
    } else {
      console.log("Nenhuma avaliação pendente encontrada.");
      await expect(page.getByRole("heading", { name: "Nenhuma avaliação disponível" })).toBeVisible();
    }

    // 13 e 14. /pre-admissao
    console.log("Passo 13 e 14: Acessando aba /pre-admissao...");
    await page.goto("http://localhost:5174/pre-admissao");
    await page.waitForURL("http://localhost:5174/pre-admissao");
    await expect(page.getByText(/Nenhuma pré-admissão ativa/i)).toBeVisible();

    // 15. Logout
    console.log("Passo 15: Executando Logout...");
    await page.goto("http://localhost:5174/minha-area");
    await page.waitForURL("http://localhost:5174/minha-area");
    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForURL("http://localhost:5174/login");
    await expect(page.getByRole("heading", { name: "Acesse sua área" })).toBeVisible();

    // 16. Tentativa de rota autenticada sem sessão
    console.log("Passo 16: Tentando acessar rota protegida sem sessão...");
    await page.goto("http://localhost:5174/minha-area");
    await page.waitForURL("http://localhost:5174/login");
    await expect(page.getByRole("heading", { name: "Acesse sua área" })).toBeVisible();
    console.log("E2E Smoke Test concluído com sucesso!");
  });
});
