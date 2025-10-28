const express = require('express');
const path = require('path');
const { chromium } = require('playwright');

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
    // Si estás en producción (Render, Vercel, etc.) => headless: true
    const isProd = process.env.NODE_ENV === 'production';
  
    browser = await chromium.launch({
      headless: isProd, // ✅ Evita error "Missing X server" en Render
      slowMo: isProd ? 0 : 50 // Suaviza animaciones solo en local
    });
  
    const context = await browser.newContext();
    page = await context.newPage();
  
    console.log('📡 Iniciando sesión...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  
    // Algunos entornos no muestran el botón Sign in inmediatamente
    await page.click('button:has-text("Sign in")').catch(() => {});
    await page.waitForSelector('#identifier', { timeout: 90000 });
  
    await page.fill('#identifier', USER);
    await page.fill('#password', PASS);
  
    await page.click('.login100-form-btn');

    // Esperar hasta que desaparezca el formulario de login o se cargue un elemento clave del dashboard
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('nav, #main-content, .dashboard, .menu', { timeout: 30000 }).catch(() => {});
    
    console.log('✅ Login exitoso y sesión persistente!');

// 🔧 Masking functions: exact 2 first + 2 last, middle as **
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
    
    // Esperar a que cargue el menú del panel o un elemento del dashboard
    await page.waitForSelector('body', { timeout: 20000 });
    
    const manageLink = await page.$('a[href="#manage-access-codes"]');
    
    if (manageLink) {
      console.log('✅ Enlace "Manage Access Codes" encontrado.');
      await manageLink.click();
    } else {
      console.warn('⚠️ No se encontró enlace, intentando abrir sección manualmente...');
      // En algunos casos se puede acceder directamente
      await page.goto(`${ADMIN_URL}#manage-access-codes`, { waitUntil: 'networkidle' });
    }
    
    // Esperar a que cargue la sección
    await page.waitForSelector('#manage-access-codes', { timeout: 15000 }).catch(() => {
      console.warn('⚠️ Sección "Manage Access Codes" no visible, continuando de todas formas...');
    });

    await page.fill('#token_input_token', accessCode);
    console.log('✅ Código ingresado en input');

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

    // ✅ Aplicar smart masking
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
const PORT = 3000;
app.listen(PORT, async () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  await initBrowser();
});