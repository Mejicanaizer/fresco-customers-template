import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { formatMoney, parseStorefront } from '../../src/lib/contracts';

test('real catalog matches fresh owner projections on load, reload and reopening', async ({ page, context }) => {
  let mutations = 0;
  // No mocks or request routing: retain ordinary browser cache behavior.
  const observe = (target: Page) => target.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/storefront/v1/') && request.method() !== 'GET') mutations++;
  });
  async function verify(target: Page, action: () => Promise<unknown>) {
    const bootstrap = target.waitForResponse(response => new URL(response.url()).pathname === '/api/storefront/v1/bootstrap');
    await action();
    const response = await bootstrap;
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    const site = parseStorefront(await response.json());
    await expect(target.getByRole('heading', { level: 1 })).toContainText(site.name);
    await expect(target.getByRole('article')).toHaveCount(site.services.length);
    for (const service of site.services) {
      const card = target.getByRole('article').filter({ has: target.getByRole('heading', { name: service.name, exact: true }) });
      // Duplicate service names can be legitimate: match their public fields as a group.
      const matching = card.filter({ hasText: service.description })
        .filter({ hasText: formatMoney(service.priceMinor, site) })
        .filter({ hasText: `${service.durationMinutes} minutos` });
      await expect(matching.first()).toBeVisible();
    }
    if (!site.services.length) await expect(target.getByText('No hay servicios publicados en esta categoría.')).toBeVisible();
    return site;
  }
  observe(page);
  await verify(page, async () => {
    const document = await page.goto('/');
    // Vite revalidates HTML with no-cache; built Node pages use no-store.
    expect(document?.headers()['cache-control']).toMatch(/^(no-store|no-cache)$/);
  });
  await verify(page, () => page.reload());
  const reopened = await context.newPage();
  try {
    observe(reopened);
    await verify(reopened, () => reopened.goto('http://127.0.0.1:5373/'));
  } finally { await reopened.close(); }
  expect(mutations).toBe(0);
});
