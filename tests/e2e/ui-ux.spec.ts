import { test, expect } from '@playwright/test';

test.describe('GitPulse UI/UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
  });

  test('Dashboard loads and shows onboarding on first run', async ({ page }) => {
    await expect(page.locator('h1:has-text("Welcome to GitPulse")')).toBeVisible();
    await expect(page.locator('text=A calm, read-only view of your local repositories')).toBeVisible();
    await expect(page.locator('button:has-text("Add a repository")')).toBeVisible();
    await expect(page.locator('button:has-text("Scan a folder")')).toBeVisible();
  });

  test('Keyboard navigation works on Onboarding', async ({ page }) => {
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // first button
    await expect(page.locator('button:has-text("Add a repository")')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button:has-text("Scan a folder")')).toBeFocused();
  });

  test('Settings page opens via header icon button', async ({ page }) => {
    await page.click('button[aria-label*="Settings"]');
    // Wait for URL hash to change
    await page.waitForURL('**/#/settings', { timeout: 5000 });
    await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
    
    // Click each nav button to scroll to sections
    const navButtons = page.locator('nav[aria-label="Settings sections"] button');
    const count = await navButtons.count();
    for (let i = 0; i < count; i++) {
      await navButtons.nth(i).click();
      await page.waitForTimeout(200);
    }
  });

  test('Settings form elements are keyboard accessible', async ({ page }) => {
    await page.click('button[aria-label*="Settings"]');
    await page.waitForURL('**/#/settings', { timeout: 5000 });
    await page.keyboard.press('Tab');
    const firstFocusable = await page.locator(':focus').first();
    await expect(firstFocusable).toBeVisible();
  });

  test('Theme toggle works', async ({ page }) => {
    await page.click('button[aria-label*="Settings"]');
    await page.waitForURL('**/#/settings', { timeout: 5000 });
    
    const themeSelect = page.locator('select').first();
    await themeSelect.selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    
    await themeSelect.selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    
    await themeSelect.selectOption('system');
  });

  test('Add repo button in sidebar works', async ({ page }) => {
    const addRepoBtn = page.locator('button:has-text("Add repo")').last();
    await expect(addRepoBtn).toBeVisible();
    await expect(addRepoBtn).toBeEnabled();
  });

  test('Scan folder button in sidebar works', async ({ page }) => {
    const scanBtn = page.locator('button[aria-label="Scan a folder for repositories"]');
    await expect(scanBtn).toBeVisible();
  });

  test('Refresh button in header works', async ({ page }) => {
    const refreshBtn = page.locator('button:has-text("Refresh")').first();
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toBeEnabled();
  });

  test('Search input exists and is accessible', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder="Search repos"]');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeEditable();
  });

  test('Accessibility: Focus indicators visible', async ({ page }) => {
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
    
    const styles = await focused.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        outline: computed.outline,
        outlineOffset: computed.outlineOffset,
        boxShadow: computed.boxShadow,
      };
    });
    
    const hasFocusRing = styles.outline !== 'none' || styles.boxShadow !== 'none';
    expect(hasFocusRing).toBeTruthy();
  });

  test('Accessibility: ARIA labels on icon buttons', async ({ page }) => {
    await page.click('button[aria-label*="Settings"]');
    await page.waitForURL('**/#/settings', { timeout: 5000 });
    
    const iconButtons = page.locator('button[aria-label]');
    const count = await iconButtons.count();
    expect(count).toBeGreaterThan(0);
    
    for (let i = 0; i < count; i++) {
      const label = await iconButtons.nth(i).getAttribute('aria-label');
      expect(label).toBeTruthy();
      expect(label!.length).toBeGreaterThan(0);
    }
  });

  test('Accessibility: Skip to content link exists', async ({ page }) => {
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toHaveText('Skip to content');
    await expect(skipLink).toHaveClass(/sr-only/);
  });

  test('Reduced motion respected', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    
    const animated = page.locator('[class*="animate-"], [style*="animation"], [style*="transition"]');
    const count = await animated.count();
    
    for (let i = 0; i < count; i++) {
      const styles = await animated.nth(i).evaluate(e => {
        const computed = window.getComputedStyle(e);
        return {
          animationDuration: computed.animationDuration,
          transitionDuration: computed.transitionDuration,
        };
      });
      
      const duration = parseFloat(styles.animationDuration) || parseFloat(styles.transitionDuration);
      if (duration > 0) {
        expect(duration).toBeLessThanOrEqual(0.01);
      }
    }
  });

  test('Responsive layout works at different widths', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('main')).toBeVisible();
    
    await page.setViewportSize({ width: 900, height: 600 });
    await expect(page.locator('main')).toBeVisible();
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('main')).toBeVisible();
  });

  test('No critical console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    const criticalErrors = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('DevTools') &&
      !e.includes('websocket') &&
      !e.includes('hot-update') &&
      !e.includes('favicon.ico')
    );
    
    expect(criticalErrors.length).toBe(0);
  });

  test('Color scheme: dark mode by default', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const bgColor = await page.locator('body').evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).toBeTruthy();
  });

  test('Repo row keyboard navigation (when repos exist)', async ({ page }) => {
    test.skip();
  });
});

test.describe('Settings Page Details', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await page.click('button[aria-label*="Settings"]');
    await page.waitForURL('**/#/settings', { timeout: 5000 });
  });

  const sectionNames = ['General', 'Repositories', 'Notifications', 'Data & history', 'About'];
  
  async function scrollToSection(page, sectionName) {
    const btn = page.locator(`nav[aria-label="Settings sections"] button:has-text("${sectionName}")`);
    await btn.click();
    await page.waitForTimeout(300);
  }

  test('General section has all expected controls', async ({ page }) => {
    await scrollToSection(page, 'General');
    await expect(page.locator('#settings-general')).toBeVisible();
    
    // Theme select
    await expect(page.locator('#settings-general select').first()).toBeVisible();
    
    // Toggles
    await expect(page.locator('#settings-general label:has-text("Start minimized")')).toBeVisible();
    await expect(page.locator('#settings-general label:has-text("Launch at login")')).toBeVisible();
    await expect(page.locator('#settings-general label:has-text("Keep popover ready")')).toBeVisible();
    
    // Tray badge basis
    await expect(page.locator('#settings-general select:has(option[value="attention"])')).toBeVisible();
    
    // Number fields
    await expect(page.locator('#settings-general input[type="number"]').first()).toBeVisible();
  });

  test('Repositories section shows add/scan buttons', async ({ page }) => {
    await scrollToSection(page, 'Repositories');
    await expect(page.locator('#settings-repositories')).toBeVisible();
    await expect(page.locator('#settings-repositories button:has-text("Add")')).toBeVisible();
    await expect(page.locator('#settings-repositories button:has-text("Scan")')).toBeVisible();
  });

  test('Notifications section has enable toggle', async ({ page }) => {
    await scrollToSection(page, 'Notifications');
    await expect(page.locator('#settings-notifications')).toBeVisible();
    await expect(page.locator('#settings-notifications label:has-text("Enable notifications")')).toBeVisible();
  });

  test('Data section has retention and export', async ({ page }) => {
    await scrollToSection(page, 'Data & history');
    await expect(page.locator('#settings-data')).toBeVisible();
    await expect(page.locator('#settings-data button:has-text("Export diagnostics")')).toBeVisible();
  });

  test('About section shows version and shortcuts', async ({ page }) => {
    await scrollToSection(page, 'About');
    await expect(page.locator('#settings-about')).toBeVisible();
    await expect(page.locator('#settings-about text=Version')).toBeVisible();
    await expect(page.locator('#settings-about text=⌘/Ctrl+K')).toBeVisible();
    await expect(page.locator('#settings-about text=⌘/Ctrl+R')).toBeVisible();
  });
});

test.describe('Repo Detail View', () => {
  test.skip('Repo detail shows changes, diff, commits, branches', async ({ page }) => {
    // This test requires a repo to be added first
  });
});