const express = require('express');
const path = require('path');
const { chromium } = require('playwright');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let browser;
let page;

const LOGIN_URL = 'https://richmondlp.com/login';
const ADMIN_URL = 'https://richmondlp.com/admin';
const USER = 'mramirez@richmondelt.com';
const PASS = 'Pass2025#';

// 🚀 Inicializa navegador y hace login una vez
async function initBrowser() {
  browser = await chromium.launch({ headless: true, slowMo: 50 });
  const context = await browser.newContext();
  page = await context.newPage();

  console.log('📡 Iniciando sesión...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });

  await page.click('button:has-text("Sign in")').catch(() => {});
  await page.waitForSelector('#identifier', { timeout: 15000 });

  await page.fill('#identifier', USER);
  await page.fill('#password', PASS);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('.login100-form-btn')
  ]);

  // Verificar que login fue exitoso
  const manageLink = await page.$('a[href="#manage-access-codes"]');
  if (!manageLink) {
    throw new Error('❌ Login failed: manage-access-codes link not found');
  }

  console.log('✅ Login exitoso y sesión persistente!');
}

// 🔧 Masking functions
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 4) return local[0] + '**' + local.slice(-1) + '@' + domain;
  return local.slice(0, 2) + '**' + local.slice(-2) + '@' + domain;
}

function maskName(name) {
  if (!name) return name;
  return name
    .split(' ')
    .map(part => {
      if (part.length <= 4) return part[0] + '**' + part.slice(-1);
      return part.slice(0, 2) + '**' + part.slice(-2);
    })
    .join(' ');
}

function smartMaskCell(header, value) {
  if (!value) return value;
  const lower = header.toLowerCase();
  if (lower.includes('email')) return maskEmail(value);
  if (lower.includes('name')) return maskName(value);
  if (lower.includes('product')) return value;
  return value;
}

// 🔍 Endpoint principal: buscar access code
app.post('/api/check-access-code', async (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode) return res.status(400).json({ valid: false, message: 'No access code provided' });

  try {
    if (!page || page.isClosed()) {
      return res.status(500).json({ valid: false, message: 'Browser session not initialized' });
    }

    console.log(`🔍 Buscando Access Code: ${accessCode}`);
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle' });

    // Espera dinámica y robusta
    const manageLocator = page.locator('a[href="#manage-access-codes"]').first();
    await manageLocator.waitFor({ state: 'visible', timeout: 60000 });
    await manageLocator.click();

    const tableLocator = page.locator('#manage-access-codes table').first();
    await tableLocator.waitFor({ state: 'visible', timeout: 30000 });

    await page.fill('#token_input_token', accessCode);
    await page.click('#check-token-button');

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Extraer datos
    const resultInfo = await page.evaluate(() => {
      const table = document.querySelector('#manage-access-codes table');
      if (!table) return { found: false, rows: [], headers: [] };

      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
      );

      return { found: rows.length > 0, headers, rows };
    });

    if (!resultInfo.found) {
      return res.json({ valid: false, message: 'No results found for this access code', data: { accessCode } });
    }

    const maskedRows = resultInfo.rows.map(row => row.map((cell, i) => smartMaskCell(resultInfo.headers[i], cell)));

    const results = maskedRows.map(row => {
      const obj = {};
      resultInfo.headers.forEach((h, i) => (obj[h] = row[i]));
      return obj;
    });

    res.json({
      valid: true,
      message: 'Access code found successfully ✅',
      data: {
        accessCode,
        headers: resultInfo.headers,
        results
      }
    });

  } catch (err) {
    console.error('❌ Error en check-access-code:', err);

    // Guardar screenshot para depuración
    if (page && !page.isClosed()) {
      const filePath = `debug_${Date.now()}.png`;
      await page.screenshot({ path: filePath, fullPage: true });
      console.log(`🖼 Screenshot guardado: ${filePath}`);
    }

    res.status(500).json({ valid: false, message: err.message });
  }
});

// Health check
app.get('/api/status', async (req, res) => {
  const status = {
    server: 'OK',
    browser: browser ? 'Initialized' : 'Not initialized',
    page: page && !page.isClosed() ? 'Active' : 'Closed',
    url: page && !page.isClosed() ? await page.url() : 'N/A'
  };
  res.json(status);
});

// Ruta principal
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Cerrar navegador al terminar
process.on('SIGINT', async () => {
  console.log('\n🛑 Closing browser...');
  if (browser) await browser.close();
  process.exit(0);
});

// Iniciar servidor + login persistente
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  await initBrowser();
});