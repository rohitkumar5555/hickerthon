import { expect, test } from '@playwright/test';

test.describe('Civic Air Quality Briefing Studio Full End-to-End Flow', () => {
  test('role -> baseline fixture -> parse -> messy dataset -> review -> real Gemini brief -> Row citation -> advisory -> task approve/complete -> targeted alert -> QA -> wipe', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('tile.openstreetmap.org')) {
          consoleErrors.push(text);
        }
      }
    });

    const nav = page.getByRole('navigation', { name: 'Primary Workspace Navigation' });

    await page.goto('/');

    // 1. Compact Role Entry -> opens Command Center empty state
    await expect(page.getByRole('heading', { name: /Civic Air Quality Briefing Studio/i })).toBeVisible();
    await page.getByRole('button', { name: /Enter workspace/i }).first().click();
    await expect(page.getByRole('heading', { name: /No analyzed air-quality data yet\./i })).toBeVisible();

    // 2. Data Ingestion: load Baseline Fixture #1, Parse Preview, Review and Analyze Data
    await nav.getByRole('button', { name: /^Data Ingestion$/i }).click();
    await expect(page.getByRole('heading', { name: /^Data Ingestion$/i })).toBeVisible();

    await page.getByLabel('Select labelled test fixture').selectOption('fixture_1_baseline');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('button', { name: /Parse Preview/i }).click();
    await page.getByRole('button', { name: /Review and Analyze Data/i }).click();
    await expect(page.getByText(/Normalized & Audited Rows/i)).toBeVisible();

    // 3. Generate baseline briefing first so Previous vs Current brief comparison has a real prior brief
    await nav.getByRole('button', { name: /^Briefing Studio$/i }).click();
    await page.getByRole('button', { name: /Analyze with Gemini AI/i }).click();
    await expect(page.getByText(/Immediate Action \(0–4h\)/i)).toBeVisible({ timeout: 120000 });

    // 4. Load Messy Next Dataset (Fixture #2), Parse, Commit, and Review/Override a row
    await nav.getByRole('button', { name: /^Data Ingestion$/i }).click();
    await page.getByLabel('Select labelled test fixture').selectOption('fixture_2_messy_current');
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByText(/TEST FIXTURE — NOT LIVE DATA/i).first()).toBeVisible();
    await page.getByRole('button', { name: /Review and Analyze Data/i }).click();
    await expect(page.getByText(/Missing data/i).first()).toBeVisible();

    await page.getByRole('button', { name: /^Review$/i }).first().click();
    await expect(page.getByRole('heading', { name: /Review Override/i })).toBeVisible();
    await page.getByLabel(/Verification Reason/i).fill('Verified sensor cross-check');
    await page.getByRole('button', { name: /Save Review/i }).click();
    await expect(page.getByRole('heading', { name: /Review Override/i })).toHaveCount(0);

    // 5. Briefing Studio: analyze current dataset vs previous brief with real Gemini, open Row citation, view Internal Brief
    await nav.getByRole('button', { name: /^Briefing Studio$/i }).click();
    await expect(page.getByRole('heading', { name: /^Briefing Studio$/i })).toBeVisible();
    await expect(page.getByText(/Previous vs\. Current Changes/i)).toBeVisible();

    await page.getByRole('button', { name: /Analyze with Gemini AI/i }).click();
    await expect(page.getByText(/Baseline: BRF-/i)).toBeVisible({ timeout: 120000 });
    await expect(page.getByText(/gemini-/i).first()).toBeVisible();

    // Open Row #1 CitationDrawer
    await page.getByRole('button', { name: /Row #1/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/Source Evidence · Row #1/i)).toBeVisible();
    await page.getByRole('button', { name: /Close source evidence drawer/i }).click();

    // Toggle Internal Brief
    await page.getByRole('button', { name: /Generate Internal Brief/i }).click();
    await expect(page.getByText(/Internal Civic Briefing Note/i)).toBeVisible();

    // Approve & Dispatch one draft action
    const approveDraftBtn = page.getByRole('button', { name: /Approve & Dispatch/i }).first();
    if (await approveDraftBtn.isVisible()) {
      await approveDraftBtn.click();
    }

    // 6. Citizen Advisory: generate multilingual plain-language advisory with real Gemini
    await nav.getByRole('button', { name: /^Citizen Advisory$/i }).click();
    await expect(page.getByRole('heading', { name: /^Citizen Advisory$/i })).toBeVisible();
    await page.getByLabel('Language').selectOption('Hindi (हिन्दी)');
    await page.getByRole('button', { name: /Generate Advisory/i }).click();
    await expect(page.getByText(/Children/i).first()).toBeVisible({ timeout: 120000 });
    await expect(page.getByText(/Older Adults/i).first()).toBeVisible();
    await expect(page.getByText(/Sensitive Groups/i).first()).toBeVisible();

    // 7. Action Board: approve a pending task (if any), then complete a task with proof
    await nav.getByRole('button', { name: /^Action Board$/i }).click();
    await expect(page.getByRole('heading', { name: /^Action Board$/i })).toBeVisible();
    const approveTaskBtn = page.getByRole('button', { name: /^Approve$/i }).first();
    if (await approveTaskBtn.isVisible()) {
      await approveTaskBtn.click();
    }
    await page.getByRole('button', { name: /^Complete$/i }).first().click();
    await page.getByPlaceholder(/Wet sweeping done/i).fill('Wet sweeping and tarpaulin check verified');
    await page.getByPlaceholder(/Field Log/i).fill('Ward Log #804');
    await page.getByRole('button', { name: /Save Update/i }).click();
    await expect(page.getByText(/COMPLETED/i).first()).toBeVisible();

    // 8. Evidence Map & Targeted Alerts: approve alert -> mark outcome reviewed
    await nav.getByRole('button', { name: /^Evidence Map & Alerts$/i }).click();
    await expect(page.getByRole('heading', { name: /Evidence Map & Targeted Alerts/i })).toBeVisible();
    const approveAlertBtn = page.getByRole('button', { name: /Approve & Prepare Alert/i }).first();
    if (await approveAlertBtn.isVisible()) {
      await approveAlertBtn.click();
      await expect(page.getByText(/targeted recipient/i).first()).toBeVisible();
      await page.getByRole('button', { name: /Mark Outcome Reviewed/i }).first().click();
    }

    // 9. Command Center: verify dynamic situation banner, 3 panels, and Previous vs Current table
    await nav.getByRole('button', { name: /^Command Center$/i }).click();
    await expect(page.getByRole('heading', { name: /What happened\?/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /What must happen now\?/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Who is affected\?/i })).toBeVisible();
    await expect(page.getByText(/Previous vs\. Current Change/i).first()).toBeVisible();

    // 10. Evaluator QA & Audit -> Run 12-point self-check -> Wipe workspace -> verify true 0-state
    await nav.getByRole('button', { name: /^Evaluator QA & Audit$/i }).click();
    await page.getByRole('button', { name: /Run Operational Self-Check Suite/i }).click();
    await expect(page.getByText(/Passed: 12\/12/i)).toBeVisible({ timeout: 120000 });

    await page.getByRole('button', { name: /Wipe Local Workspace/i }).click();
    await page.getByRole('button', { name: /Confirm Wipe/i }).click();

    await nav.getByRole('button', { name: /^Command Center$/i }).click();
    await expect(page.getByRole('heading', { name: /No analyzed air-quality data yet\./i })).toBeVisible();

    expect(pageErrors, `Unexpected page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });
});
