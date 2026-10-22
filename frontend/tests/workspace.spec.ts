import { expect, test, type Page } from '@playwright/test';

const password = 'ProjectDocumentAI-test-password-123';
async function createAccount(page: Page, name = 'Alex Morgan') {
  const email = `browser-${crypto.randomUUID()}@example.com`;
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Create an account' }).click();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drop files to get started', exact: true })).toBeVisible();
  return email;
}

async function createProject(page: Page, name = 'Website Redesign') {
  await page.locator('.studio-empty-workspace').getByRole('button', { name: 'Create a project instead', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Project name', { exact: true }).fill(name);
  await page.getByRole('dialog').getByLabel('Description').fill('A project saved in the local database.');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return page.url().split('/').at(-1)!;
}

test('uploading the first document creates the first project automatically', async ({ page }) => {
  await createAccount(page);
  await page.getByLabel('Upload your first documents').setInputFiles({
    name: 'Project Notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('The first uploaded document starts this workspace.'),
  });
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByRole('heading', { name: 'Project Notes', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Project Notes.txt', exact: true })).toBeVisible();
});

test('registration, database project CRUD, reload, logout, and login work end to end', async ({ page }) => {
  const email = await createAccount(page);
  const id = await createProject(page, 'Local Design Sprint');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Local Design Sprint', level: 1 })).toBeVisible();
  await page.locator('.project-studio-sidebar').getByLabel('More project actions').click();
  await page.locator('.project-studio-sidebar').getByRole('button', { name: 'Edit project', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Project name').fill('Reviewed Design Sprint');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reviewed Design Sprint', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto(`/projects/${id}`);
  await expect(page).toHaveURL(/login/);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('email or password is incorrect');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reviewed Design Sprint', level: 1 })).toBeVisible();
  await page.locator('.project-studio-sidebar').getByLabel('More project actions').click();
  await page.locator('.project-studio-sidebar').getByRole('button', { name: 'Delete project', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/workspace/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Drop files to get started', exact: true })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storage).not.toContain(password);
  const cookie = (await page.context().cookies()).find(item => item.name === 'projectdocumentai_session');
  expect(cookie?.httpOnly).toBe(true);
});

test('switching accounts hides previous projects and tasks', async ({ page }) => {
  await createAccount(page, 'First Person');
  const id = await createProject(page, 'Private First Project');
  await page.locator('.project-studio-sidebar').getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Task title').fill('Private project task');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page.getByRole('button', { name: 'Close tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await createAccount(page, 'Second Person');
  await expect(page.getByRole('heading', { name: 'Drop files to get started', exact: true })).toBeVisible();
  await page.goto(`/projects/${id}`);
  await expect(page.getByRole('heading', { name: 'Drop files to get started', exact: true })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.locator('main')).not.toContainText('Private project task');
});

test('failed project saves keep the form and display an error', async ({ page }) => {
  await createAccount(page);
  await page.route('**/api/projects', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Database is temporarily unavailable.' }) });
    else await route.continue();
  });
  await page.locator('.studio-empty-workspace').getByRole('button', { name: 'Create a project instead', exact: true }).click();
  await page.getByLabel('Project name', { exact: true }).fill('Unsaved project');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Database is temporarily unavailable');
  await expect(page.getByLabel('Project name')).toHaveValue('Unsaved project');
  await expect(page).toHaveURL(/workspace/);
});

test('tasks and documents persist and AI clearly indicates missing configuration', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const email = await createAccount(page);
  await createProject(page);
  await page.locator('.project-studio-sidebar').getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Task title').fill('Review the navigation');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page.getByLabel('Status of Review the navigation').selectOption('Done');
  await expect(page.locator('.tasks-table')).toContainText('Review the navigation');
  await page.reload();
  await expect(page.locator('.tasks-table')).toContainText('Review the navigation');
  await page.getByRole('button', { name: 'Close tasks', exact: true }).click();
  await page.getByLabel('Upload documents from library').setInputFiles({ name: 'Notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Saved document text.') });
  await expect(page.locator('.studio-upload')).toHaveClass(/is-compact/);
  await expect(page.locator('.studio-upload')).toContainText('Add documents');
  await expect(page.getByRole('button', { name: 'View Notes.txt', exact: true })).toBeVisible();
  await expect(page.locator('.studio-document').filter({ hasText: 'Notes.txt' }).locator('.document-index-state')).toContainText(/Ready to index|AI setup needed|AI ready/);
  await page.reload();
  await page.getByRole('button', { name: 'View Notes.txt', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Saved document text.');
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  await page.getByRole('button', { name: 'Close preview', exact: true }).click();
  const secondContext = await page.context().browser()!.newContext();
  try {
    const secondPage = await secondContext.newPage();
    await secondPage.goto('/login');
    await secondPage.getByLabel('Email address').fill(email);
    await secondPage.getByLabel('Password', { exact: true }).fill(password);
    await secondPage.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(secondPage.getByRole('heading', { name: 'Website Redesign', level: 1 })).toBeVisible();
    await secondPage.locator('.project-studio-sidebar').getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(secondPage.locator('.tasks-table')).toContainText('Review the navigation');
    await expect(secondPage.getByRole('button', { name: 'View Notes.txt', exact: true })).toBeVisible();
  } finally { await secondContext.close(); }
  await expect(page.locator('.info-banner')).toContainText('Connect AI to ask questions');
  await page.getByLabel('Message ProjectDocumentAI').fill('What are the next steps?');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.screenshot({ path: '.tmp/connected-workspace.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('mobile login and the one-page workspace remain within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAccount(page);
  const id = await createProject(page);
  for (const path of ['/workspace', `/projects/${id}`, '/settings', `/projects/${id}?tab=tasks`, `/projects/${id}?library=open`]) {
    await page.goto(path);
    await expect(page.locator('.workspace-loading')).toHaveCount(0);
    const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    expect(widths.document, path).toBeLessThanOrEqual(widths.viewport);
  }
  await page.goto(`/projects/${id}`);
  await page.getByRole('button', { name: 'Open document library', exact: true }).click();
  await page.getByLabel('Upload documents from library').setInputFiles({ name: 'Mobile.txt', mimeType: 'text/plain', buffer: Buffer.from('Mobile document actions.') });
  await expect(page.getByRole('button', { name: 'Delete Mobile.txt', exact: true })).toContainText('Delete');
  await page.locator('.project-studio-sidebar').getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tasks' })).toBeVisible();
  await page.getByRole('button', { name: 'Close tasks', exact: true }).click();
  await expect(page.getByLabel('Message ProjectDocumentAI')).toBeVisible();
  const chatWidths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(chatWidths.document).toBeLessThanOrEqual(chatWidths.viewport);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
  await page.screenshot({ path: '.tmp/connected-login-mobile.png', fullPage: true });
});


test('legacy standalone routes redirect into the one-page workspace', async ({ page }) => {
  await createAccount(page);
  const id = await createProject(page, 'Redirected Workspace');
  await page.goto('/tasks');
  await expect(page).toHaveURL(new RegExp(`/projects/${id}\\?tab=tasks`));
  await expect(page.getByRole('dialog', { name: 'Tasks' })).toBeVisible();
  await page.goto('/documents');
  await expect(page).toHaveURL(new RegExp(`/projects/${id}\\?library=open`));
  await page.goto('/chat');
  await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
  await expect(page.getByLabel('Message ProjectDocumentAI')).toBeVisible();
  await page.goto('/projects');
  await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
  await page.goto('/dashboard');
  await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));
});


test('minimal workspace controls, task drawer, and profile edits are connected', async ({ page }) => {
  await createAccount(page);
  const id = await createProject(page, 'Workspace Sections');
  await expect(page.locator('.studio-upload')).toContainText('Drop files here');
  await expect(page.locator('.studio-documents-empty')).toHaveCount(0);
  await expect(page.locator('.studio-account').getByRole('button', { name: 'Open tasks', exact: true })).toHaveCount(0);
  await expect(page.locator('.studio-title').getByRole('heading', { name: 'Workspace Sections', level: 1 })).toBeVisible();
  await expect(page.locator('.studio-title')).toContainText('Ask your documents');
  await expect(page.locator('.assistant-mode-description')).toHaveText('Searches your uploaded documents.');
  await page.locator('.project-studio-sidebar').getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page).toHaveURL(/tab=tasks/);
  await expect(page.getByRole('dialog', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Select project')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close tasks', exact: true }).click();
  await expect(page.getByLabel('Upload project documents')).toHaveCount(0);
  await expect(page.getByLabel('Upload documents from library')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Project sections' })).toHaveCount(0);
  await expect(page.getByLabel('Message ProjectDocumentAI')).toBeVisible();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Project name', { exact: true }).fill('Second Workspace');
  await page.getByRole('dialog').getByLabel('Description').fill('Created without a dashboard.');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Second Workspace', level: 1 })).toBeVisible();
  await page.getByLabel('Select project').selectOption(id);
  await expect(page).toHaveURL(new RegExp('/projects/' + id));
  await page.getByRole('button', { name: 'Profile and settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Profile / Settings' })).toBeVisible();
  await page.getByLabel('Full name', { exact: true }).fill('Alex Updated');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.locator('.studio-account')).toContainText('Alex Updated');
  await page.reload();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Alex Updated');
  await expect(page.locator('.connection-list')).toContainText('Gemini');
  await expect(page.locator('.connection-list')).toContainText('gemini-embedding-001');
  await page.screenshot({ path: '.tmp/profile-settings.png', fullPage: true });
});

test('assistant handles provider errors, source cards, saved history, and modes', async ({ page }) => {
  await createAccount(page);
  const id = await createProject(page, 'AI Integration');
  await page.getByLabel('Upload documents from library').setInputFiles({ name: 'Brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Launch is October 12.') });
  await expect(page.getByRole('button', { name: 'View Brief.txt', exact: true })).toBeVisible();
  await expect(page.getByLabel('Assistant mode').locator('option[value="agent"]')).toHaveText('Everything');
  const docs = await (await page.request.get('/api/documents')).json();
  let history: unknown[] = [];
  let failed = false;
  const requestIds: string[] = [];
  const modes: string[] = [];
  await page.route('**/api/ai/status', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/api/ai/projects/*/messages', async route => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ json: history });
    if (method === 'DELETE') { history = []; return route.fulfill({ status: 204 }); }
    const body = route.request().postDataJSON();
    requestIds.push(body.requestId); modes.push(body.mode);
    if (!failed) { failed = true; return route.fulfill({ status: 503, json: { detail: 'Provider temporarily unavailable.' } }); }
    const pair = [{ id: crypto.randomUUID(), projectId: id, role: 'user', text: body.message, createdAt: new Date().toISOString() },
      { id: crypto.randomUUID(), projectId: id, role: 'assistant', text: '### Launch date\n\n**Launch** is October 12 [S1].\n\n- Confirm the venue\n- Notify the team', createdAt: new Date().toISOString(),
        citations: [{ sourceId: 'S1', documentId: docs[0].id, name: 'Brief.txt', location: 'Page 1, chunk 1', excerpt: 'Launch is October 12.' }] }];
    history = [...history, ...pair];
    return route.fulfill({ json: pair });
  });
  await page.goto(`/projects/${id}?assistant=open`);
  await page.getByLabel('Message ProjectDocumentAI').fill('When is launch?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Provider temporarily unavailable');
  await expect(page.getByLabel('Message ProjectDocumentAI')).toHaveValue('When is launch?');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.message-assistant')).toContainText('October 12');
  await expect(page.locator('.message-assistant').first().locator('.message-text h3')).toHaveText('Launch date');
  await expect(page.locator('.message-assistant').first().locator('.message-text li')).toHaveCount(2);
  await expect(page.locator('.message-assistant .message-meta')).toContainText('Document Assistant');
  await expect(page.locator('.citation-card').first()).toContainText('Page 1 · Chunk 1');
  expect(requestIds[0]).toBe(requestIds[1]);
  await page.locator('.citation-card').click();
  await expect(page.getByRole('dialog', { name: 'Brief.txt' })).toContainText('Page 1 · Chunk 1');
  await expect(page.getByRole('dialog', { name: 'Brief.txt' })).toContainText('Launch is October 12');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await expect(page.locator('.message-assistant')).toHaveCount(1);
  await page.getByLabel('Assistant mode').selectOption('summary');
  await expect(page.locator('.assistant-mode-description')).toHaveText('Creates a summary of one document.');
  await page.getByLabel('Document', { exact: true }).selectOption(docs[0].id);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.message-assistant')).toHaveCount(2);
  expect(modes.at(-1)).toBe('summary');
  for (const [mode, explanation] of [
    ['data', 'Answers questions about tasks, deadlines, and progress.'],
    ['agent', 'Uses both documents and project information.'],
  ] as const) {
    await page.getByLabel('Assistant mode').selectOption(mode);
    await expect(page.locator('.assistant-mode-description')).toHaveText(explanation);
    await page.getByLabel('Message ProjectDocumentAI').fill('Project progress?');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByLabel('Message ProjectDocumentAI')).toHaveValue('');
    expect(modes.at(-1)).toBe(mode);
  }
  await page.getByRole('button', { name: 'Delete Brief.txt', exact: true }).click();
  await page.getByRole('dialog', { name: 'Remove this document?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('.citation-card-unavailable').first()).toContainText('Removed');
  await page.locator('.citation-card-unavailable').first().click();
  await expect(page.getByRole('dialog', { name: 'Brief.txt' })).toContainText('Document removed');
  await expect(page.getByRole('dialog', { name: 'Brief.txt' }).getByRole('button', { name: 'View document', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({ path: '.tmp/ai-assistant.png', fullPage: true });
  await page.getByRole('button', { name: 'Clear conversation', exact: true }).click();
  await page.getByRole('dialog', { name: 'Clear this conversation?' }).getByRole('button', { name: 'Clear conversation', exact: true }).click();
  await expect(page.locator('.message-assistant')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.message-assistant')).toHaveCount(0);
});
