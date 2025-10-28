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
    const isProd = process.env.NODE_ENV === 'production';
  
    browser = await chromium.launch({
      headless: isProd,
      slowMo: isProd ? 0 : 50
    });
  
    const context = await browser.newContext();
    page = await context.newPage();
  
    console.log('📡 Iniciando sesión...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  
    await page.click('button:has-text("Sign in")').catch(() => {});
    await page.waitForSelector('#identifier', { timeout: 90000 });
  
    await page.fill('#identifier', USER);
    await page.fill('#password', PASS);
  
    await page.click('.login100-form-btn');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('nav, #main-content, .dashboard, .menu', { timeout: 90000 }).catch(() => {});
    
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
    
<<<<<<< HEAD
    // Esperar a que el contenido principal cargue
    await page.waitForSelector('body', { timeout: 90000 });
=======
    // Navegar al admin
    await page.goto(ADMIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('✅ Navegó a Admin');
>>>>>>> e1c6675 (fix: stable login and manage-access-codes handling 2)
    
    // Esperar a que la página cargue completamente
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Hacer scroll down para asegurar que los elementos estén visibles
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
    
    // Método 1: Intentar encontrar y hacer click en el link
    console.log('🔎 Buscando enlace Manage Access Codes...');
    let clicked = false;
    
    try {
      const links = await page.$$('a[href="#manage-access-codes"]');
      if (links.length > 0) {
        console.log('✅ Enlace encontrado, haciendo click...');
        await links[0].click({ timeout: 10000 });
        clicked = true;
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('⚠️  No se pudo hacer click en el enlace, intentando navegación directa...');
    }
    
<<<<<<< HEAD
    // Esperar a que la sección cargue
    await page.waitForSelector('#manage-access-codes', { timeout: 95000 }).catch(() => {
      console.warn('⚠️ Sección "Manage Access Codes" no visible, continuando de todas formas...');
    });
=======
    // Método 2: Si no funcionó, navegar directamente a la sección
    if (!clicked) {
      console.log('📜 Navegando directamente a manage-access-codes...');
      await page.goto(`${ADMIN_URL}#manage-access-codes`, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);
    }
>>>>>>> e1c6675 (fix: stable login and manage-access-codes handling 2)
    
    // Hacer scroll down para ver el formulario de búsqueda
    console.log('📜 Scrolling down...');
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
    
    // Buscar el input - intenta múltiples selectores
    console.log('🔎 Buscando campo de entrada para el código...');
    let inputFound = false;
    
    // Intento 1: Buscar por ID
    let input = await page.$('#token_input_token');
    if (input) {
      console.log('✅ Input encontrado por ID');
      inputFound = true;
    }
    
    // Intento 2: Buscar dentro de manage-access-codes
    if (!inputFound) {
      const section = await page.$('#manage-access-codes');
      if (section) {
        input = await section.$('input[type="text"]');
        if (input) {
          console.log('✅ Input encontrado dentro de manage-access-codes');
          inputFound = true;
        }
      }
    }
    
    // Intento 3: Buscar todos los inputs y usar el visible
    if (!inputFound) {
      const allInputs = await page.$$('input[type="text"]');
      for (let i = allInputs.length - 1; i >= 0; i--) {
        const isVisible = await allInputs[i].isVisible();
        if (isVisible) {
          input = allInputs[i];
          console.log('✅ Input visible encontrado en posición:', i);
          inputFound = true;
          break;
        }
      }
    }
    
    if (!inputFound || !input) {
      return res.status(500).json({ valid: false, message: 'Input field not found' });
    }
    
    // Llenar el input
    console.log('✅ Ingresando código:', accessCode);
    await input.fill(accessCode);
    await page.waitForTimeout(1000);
    
    // Buscar y hacer click en el botón
    console.log('🔘 Buscando botón de verificación...');
    let button = null;
    
    // Intento 1: Por ID
    button = await page.$('#check-token-button');
    if (!button) {
      // Intento 2: Por texto
      const buttons = await page.$$('button, a[role="button"]');
      for (let btn of buttons) {
        const text = await btn.innerText();
        if (text.toLowerCase().includes('check')) {
          button = btn;
          break;
        }
      }
    }
    
    if (!button) {
      return res.status(500).json({ valid: false, message: 'Check button not found' });
    }
    
    console.log('✅ Botón encontrado, haciendo click...');
    await button.click({ timeout: 10000 });
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Extraer datos
    console.log('📊 Extrayendo datos...');
    const resultInfo = await page.evaluate(() => {
      const table = document.querySelector('#manage-access-codes table');
      if (!table) return { found: false, rows: [], headers: [] };

      const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map(th => th.innerText.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
      );

      return { found: rows.length > 0 && !rows[0].some(cell => cell.includes('No results')), headers, rows };
    });

    if (!resultInfo.found || resultInfo.rows.length === 0) {
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
    res.status(500).json({ valid: false, message: err.message, stack: err.stack });
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