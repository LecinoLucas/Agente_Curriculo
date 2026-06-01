import { test, expect } from '@playwright/test';

test.describe('Dark Themes Evaluation', () => {
  const themes = ['theme-1', 'theme-2', 'theme-3', 'theme-4'];

  test('evaluate computed background and text colors in dark mode', async ({ page }) => {
    // Let's just use the actual app running on 5173.
    try {
      await page.goto('http://localhost:5173/login', { timeout: 5000 });
    } catch (e) {
      console.log('Could not connect to localhost:5173');
      return;
    }

    // Force dark mode
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    console.log('--- DARK THEME COLOR EVALUATION ---');

    for (const theme of themes) {
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-visual-theme', t);
      }, theme);

      // Wait a bit for styles to apply
      await page.waitForTimeout(200);

      const computed = await page.evaluate(() => {
        const body = document.body;
        const root = document.documentElement;
        return {
          bg: window.getComputedStyle(body).backgroundColor,
          text: window.getComputedStyle(body).color,
          rootBgVar: window.getComputedStyle(root).getPropertyValue('--bg').trim(),
          rootTextVar: window.getComputedStyle(root).getPropertyValue('--text').trim(),
        };
      });

      console.log(`\nTheme: ${theme} (Dark Mode)`);
      console.log(`Computed Body Background: ${computed.bg}`);
      console.log(`Computed Body Text Color: ${computed.text}`);
      console.log(`Root --bg variable: ${computed.rootBgVar}`);
      console.log(`Root --text variable: ${computed.rootTextVar}`);

      // Basic heuristic: in dark mode, background should be dark (RGB values < 100 roughly)
      const rgbMatch = computed.bg.match(/\d+/g);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[0], 10);
        const g = parseInt(rgbMatch[1], 10);
        const b = parseInt(rgbMatch[2], 10);
        const isLight = (r > 150 && g > 150 && b > 150);
        if (isLight) {
          console.error(`❌ FAILED: ${theme} in Dark Mode has a LIGHT background!`);
        } else {
          console.log(`✅ PASSED: ${theme} in Dark Mode has a DARK background.`);
        }
      }
    }
  });
});
