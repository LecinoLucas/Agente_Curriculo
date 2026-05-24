import { expect, test } from "@playwright/test";

test.describe("LoginPage - Modernist Editorial Visual Validation", () => {
  
  test("1. Renderização em Desktop", async ({ page }) => {
    // Definir viewport largo
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");

    // Verificar marca Marajó RH no cabeçalho/logo
    await expect(page.getByText("Marajo RH").first()).toBeVisible();

    // Verificar Headline Display Serif usando regex robusto
    await expect(
      page.getByRole("heading", { name: /Recrutamento com/i })
    ).toBeVisible();

    // Verificar Subtexto usando regex
    await expect(
      page.getByText(/Centralize vagas/i)
    ).toBeVisible();

    // Verificar formulário e campos de entrada
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();

    // Verificar botão de envio
    await expect(
      page.getByRole("button", { name: "Entrar no painel" })
    ).toBeVisible();

    // Verificar link do Portal do Candidato
    await expect(
      page.getByRole("link", { name: "Portal do Candidato" })
    ).toBeVisible();
  });

  test("2. Renderização em Mobile (Responsividade)", async ({ page }) => {
    // Definir viewport mobile padrão
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");

    // A coluna de manifesto da esquerda deve estar oculta no mobile (hidden lg:flex)
    await expect(
      page.getByRole("heading", { name: /Recrutamento com/i })
    ).not.toBeVisible();

    // O formulário de login e os inputs devem continuar visíveis e acessíveis
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entrar no painel" })
    ).toBeVisible();

    // A marca Marajó RH deve aparecer na versão mobile do formulário
    await expect(page.locator(".lg\\:hidden").getByText("Marajo RH", { exact: true })).toBeVisible();

    // Garantir que não existe barra de rolagem horizontal (overflow-x)
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test("3. Estados de Formulário (Focus & Toggle Senha)", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.getByLabel("E-mail");
    const passwordInput = page.locator("#password");

    // Verificar foco no E-mail
    await emailInput.focus();
    await expect(emailInput).toBeFocused();

    // Preencher campos
    await emailInput.fill("teste@email.com");
    await passwordInput.fill("MinhaSenha123!");

    // Verificar que a senha está inicialmente oculta (tipo password)
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Clicar em "Mostrar senha"
    await page.getByLabel("Mostrar senha").click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Clicar novamente (Ocultar senha)
    await page.getByLabel("Ocultar senha").click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("4. Exibição de Erro de Login", async ({ page }) => {
    await page.goto("/login");

    // Inserir credenciais incorretas deliberadas
    await page.getByLabel("E-mail").fill("invalido@domain.com");
    await page.locator("#password").fill("senhaErrada123");
    
    // Clicar no botão para submeter
    await page.getByRole("button", { name: "Entrar no painel" }).click();

    // Deve aparecer a mensagem de erro na caixa de alerta
    const errorAlert = page.locator("[role='alert']");
    await expect(errorAlert).toBeVisible();

    // O botão deve voltar a ficar ativo após falha (não manter estado loading travado)
    await expect(
      page.getByRole("button", { name: "Entrar no painel" })
    ).toBeEnabled();
  });

  test("5. Navegação do Portal do Candidato", async ({ page }) => {
    await page.goto("/login");

    // Clicar em "Portal do Candidato"
    await page.getByRole("link", { name: "Portal do Candidato" }).click();

    // Verificar que a URL redirecionou para a rota correta do candidato
    await page.waitForURL(/\/candidato/);
    expect(page.url()).toContain("/candidato");
  });

  test("6. Renderização do Google Login", async ({ page }) => {
    await page.goto("/login");

    // Verificar que o componente do Google Login renderiza (ou o botão ou o aviso de Client ID)
    const googleContainer = page.locator("div.flex.w-full.flex-col.items-center.gap-2, p:has-text('VITE_GOOGLE_CLIENT_ID')");
    await expect(googleContainer.first()).toBeVisible();
  });
});
