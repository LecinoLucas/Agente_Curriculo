import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
  const authFile = path.resolve('.design/auth/staff-state.json');
  
  if (!fs.existsSync(authFile)) {
    console.error('Arquivo de autenticação não encontrado.');
    console.error('Por favor, faça login executando:');
    console.error('npx playwright codegen http://localhost:5173/login --save-storage=.design/auth/staff-state.json');
    process.exit(1);
  }

  console.log('Iniciando navegador...');
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();

  console.log('Acessando http://localhost:5173/pipeline ...');
  await page.goto('http://localhost:5173/pipeline', { waitUntil: 'networkidle' });

  // Wait a bit to see if there is a redirection
  await page.waitForTimeout(2000);

  if (page.url().includes('/login')) {
    console.error('A sessão expirou ou o token é inválido.');
    console.error('Por favor, atualize seu acesso executando:');
    console.error('npx playwright codegen http://localhost:5173/login --save-storage=.design/auth/staff-state.json');
    await browser.close();
    process.exit(1);
  }

  // Ensure screenshots directory exists
  const screenshotsDir = path.resolve('.design/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const viewports = [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'laptop', width: 1280, height: 900 },
    { name: 'mobile', width: 375, height: 812 }
  ];

  for (const vp of viewports) {
    console.log(`Capturando screenshot para ${vp.name} (${vp.width}x${vp.height})...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // Add an extra wait for responsive layout to adjust and data to potentially re-render
    await page.waitForTimeout(1000);
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `pipeline-${vp.name}.png`),
      fullPage: true 
    });
  }

  console.log('Screenshots capturados com sucesso!');
  await browser.close();
})();
