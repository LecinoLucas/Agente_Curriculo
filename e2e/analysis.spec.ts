import { test, expect } from '@playwright/test';

test('E2E: Análise de candidatos - Hiago Dantos e Christian Prado', async ({ page }) => {
  // Acessar a página inicial
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForLoadState('networkidle');

  console.log('✅ Página inicial carregada');

  // Fazer login se necessário
  const loginForm = page.locator('input[type="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  const needsLogin = await loginForm.isVisible().catch(() => false);
  if (needsLogin) {
    console.log('🔐 Fazendo login...');
    await loginForm.fill('equipepioneiracolchoes@gmail.com');
    await passwordInput.fill('senha123');

    const loginBtn = page.locator('button:has-text("Entrar no painel")').first();
    await loginBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    console.log('✅ Login realizado');
  }

  await page.screenshot({ path: '/tmp/01-after-login.png' });
  
  // Verificar se tem um link para candidatos na navegação
  const candidatesNav = page.locator('a[href*="candidatos"], [data-testid="nav-candidates"]').first();
  const candidatesText = page.locator('button:has-text("Candidatos"), a:has-text("Candidatos")').first();
  
  let hasNavigation = await candidatesNav.isVisible().catch(() => false);
  if (!hasNavigation) {
    hasNavigation = await candidatesText.isVisible().catch(() => false);
  }
  
  if (hasNavigation) {
    await candidatesNav.or(candidatesText).first().click();
    await page.waitForLoadState('networkidle');
    console.log('✅ Navegando para Candidatos');
  }
  
  await page.screenshot({ path: '/tmp/02-candidates-page.png' });
  console.log(`📍 URL atual: ${page.url()}`);
  
  // Esperar pelos candidatos carregarem
  await page.waitForTimeout(2000);
  
  // Procurar por "Hiago Dantos"
  const hiagoCandidateText = page.locator('text=/Hiago Dantos/i');
  const hiagoCandidateButton = page.locator('button:has-text("Hiago Dantos"), a:has-text("Hiago Dantos"), [data-testid*="hiago"], div:has-text("Hiago Dantos")').first();
  
  const hiagos = await hiagoCandidateText.all();
  const hiagoFound = hiagos.length > 0;
  
  console.log(`🔍 Procurando Hiago Dantos... ${hiagoFound ? '✅ Encontrado' : '❌ Não encontrado'}`);
  
  if (hiagoFound) {
    await hiagoCandidateText.first().click({ force: true });
    await page.waitForLoadState('networkidle');
    console.log('✅ Abrindo perfil do Hiago Dantos');
    await page.screenshot({ path: '/tmp/03-hiago-profile.png' });
  }
  
  // Procurar pela vaga "Desenvolver Full Stack"
  const vagaSelect = page.locator('select, [role="combobox"], [placeholder*="vaga"], label:has-text("Vaga")');
  const vagaOption = page.locator('text=/Desenvolver Full Stack/i, button:has-text("Desenvolver Full Stack")');
  
  const vagaFound = await vagaOption.isVisible().catch(() => false);
  console.log(`🔍 Procurando vaga "Desenvolver Full Stack"... ${vagaFound ? '✅ Encontrada' : '❌ Não encontrada'}`);
  
  if (vagaFound) {
    await vagaOption.first().click();
    await page.waitForLoadState('networkidle');
    console.log('✅ Vaga selecionada');
    await page.screenshot({ path: '/tmp/04-vaga-selected.png' });
  }
  
  // Procurar por botão de análise
  const analyzeBtn = page.locator('button:has-text("Analisar"), button:has-text("Analise"), button:has-text("Executar")').first();
  const analyzeBtnExists = await analyzeBtn.isVisible().catch(() => false);
  
  if (analyzeBtnExists) {
    console.log('✅ Botão de análise encontrado');
    await analyzeBtn.click();
    console.log('⏳ Executando análise...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('✅ Análise concluída');
    await page.screenshot({ path: '/tmp/05-analysis-result.png' });
  }
  
  // Verificar score
  const scoreElements = page.locator('[data-testid*="score"]');
  const scores = await scoreElements.all();
  console.log(`📊 Scores encontrados: ${scores.length}`);

  // Procurar por texto de score
  const scoreTexts = page.locator('text=/Score|Pontuação|Nota/i');
  const scoreTextsCount = (await scoreTexts.all()).length;
  console.log(`📊 Textos de score encontrados: ${scoreTextsCount}`);
  
  // Procurar por modal ou painel de decisão
  const decisionPanel = page.locator('[data-testid*="decision"], [role="dialog"], .modal, [class*="Modal"]').first();
  const decisionPanelVisible = await decisionPanel.isVisible().catch(() => false);
  
  if (decisionPanelVisible) {
    console.log('✅ Painel de decisão/modal encontrado');
    const modalScore = page.locator('[data-testid*="score"]').first();
    const modalScoreVisible = await modalScore.isVisible().catch(() => false);
    console.log(`📊 Score visível na modal: ${modalScoreVisible ? '✅ Sim' : '❌ Não'}`);
    await page.screenshot({ path: '/tmp/06-decision-panel.png' });
  }
  
  console.log('\n✅ Teste E2E concluído!');
});
