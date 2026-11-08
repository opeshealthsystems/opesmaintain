// End-to-end check of the technician app (React Native code rendered via react-native-web):
// sign in, open an in-progress job, record a task while OFFLINE, reconnect, sync, verify on server.
// Usage: node tools/validation/mobile-e2e.js http://localhost:3100 http://localhost:8081 [screenshotDir]
const { chromium } = require('playwright');
(async () => {
  const [app, api, shots] = process.argv.slice(2);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const step = async (n) => { if (shots) await page.screenshot({ path: `${shots}/mobile-${n}.png` }); };
  await page.goto(app, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('tech@opes.demo');
  await page.getByLabel('Password').fill('OpesDemo2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('My work').first().waitFor();
  await page.getByText('ICU ventilator VEN-ICU-04', { exact: false }).first().waitFor();
  await step('1-jobs');
  await page.getByText('ICU ventilator VEN-ICU-04', { exact: false }).first().click();
  await page.getByText('Checklist').waitFor();
  await step('2-job');
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  page.once('dialog', (d) => d.accept());
  const pending = page.getByRole('button', { name: 'Done' });
  const before = await pending.count();
  await pending.first().click();
  await page.waitForTimeout(800);
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('op') || '[]'));
  await step('3-offline-queued');
  await ctx.setOffline(false);
  await page.getByRole('button', { name: 'Sync' }).first().click();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('op') || '[]'));
  await step('4-synced');
  const login = await (await fetch(api + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'tech@opes.demo', password: 'OpesDemo2026' }) })).json();
  const taskId = JSON.parse(queued[0].payload).taskId;
  const task = await (await fetch(`${api}/api/v1/work-tasks/${taskId}`, { headers: { Authorization: 'Bearer ' + login.token } })).json();
  const ok = before > 0 && queued.length === 1 && queued[0].state === 'QUEUED' && after[0].state === 'ACCEPTED' && task.status === 'DONE' && errors.length === 0;
  console.log(JSON.stringify({ pendingTasks: before, queuedWhileOffline: queued.map((q) => q.state), afterSync: after.map((q) => q.state), serverTaskStatus: task.status, pageErrors: errors }));
  console.log(ok ? 'MOBILE E2E PASSED' : 'MOBILE E2E FAILED');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
