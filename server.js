const express = require('express');
const path = require('path');
const cors = require('cors'); // Import CORS
// Use vanilla playwright - stealth plugin removed to fix TypeError
const { firefox } = require('playwright');

const app = express();

// Enable CORS for ANY origin (since we want yepzhi.com and others to access it)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false // Disable credentials to allow wildcard origin
}));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let browser;
let page;
let logBuffer = []; // Buffer para guardar logs
let isSystemReady = false; // Flag para indicar si el sistema está listo
let lastActivityTime = Date.now();
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// --- Request Queue Implementation ---
// This ensures that even if 5 users search at once, they form a line
// and are processed one by one by the single browser instance.
class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async enqueue(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const { fn, resolve, reject } = this.queue.shift();

    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.processNext();
    }
  }
}

const browserQueue = new RequestQueue();
// ------------------------------------

// Función para guardar logs
function addLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = `${timestamp} ${message}`;
  logBuffer.push(logEntry);
  // Mantener solo los últimos 100 logs
  if (logBuffer.length > 100) {
    logBuffer.shift();
  }
}

// Guardar el console.log original ANTES de sobrescribirlo
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

// Override console methods sin crear loops
console.log = function (...args) {
  const message = args.join(' ');
  originalLog.apply(console, args);
  addLog(message);
};

console.error = function (...args) {
  const message = args.join(' ');
  originalError.apply(console, args);
  addLog(message);
};

console.warn = function (...args) {
  const message = args.join(' ');
  originalWarn.apply(console, args);
  addLog(message);
};

// Configuración dinámica
const LOGIN_URL = 'https://richmondlp.com/login';
const ADMIN_URL = 'https://richmondlp.com/admin';
const USER = 'mramirez@richmondelt.com';
const PASS = 'Pass2026*';

// Detectar entorno
const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true' || !!process.env.SPACE_ID;
console.log(`🔧 Entorno: ${isProd ? 'PRODUCCIÓN (Cloud/HF)' : 'LOCAL'}`);

// Check if session is expired
async function checkSessionTimeout() {
  const now = Date.now();
  if (browser && (now - lastActivityTime > SESSION_TIMEOUT_MS)) {
    console.log('⏱️ Session timed out (15m inactivity). Restarting browser...');
    try {
      await browser.close();
    } catch (e) { }
    browser = null;
    page = null;
    isSystemReady = false;

    // Auto-restart immediately to keep system ready
    initBrowser().catch(e => console.error('❌ Error restarting browser after timeout:', e));

    return true; // Timeout occurred
  }
  return false;
}

// 🚀 Inicializa navegador y hace login con retry automático
async function initBrowser(retryCount = 0) {
  const MAX_RETRIES = 3;
  if (isSystemReady && page && !page.isClosed()) return; // Already ready

  isSystemReady = false; // Reset ready flag on init
  lastActivityTime = Date.now();

  try {
    console.log('🌐 Iniciando Chromium (Stealth Mode)...');

    if (browser) {
      try {
        await browser.close();
      } catch (e) { }
    }

    const launchOptions = {
      headless: isProd,
      slowMo: isProd ? 100 : 50,
      args: []
    };

    browser = await firefox.launch(launchOptions);

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Referer': 'https://richmondlp.com/'
      }
    });

    page = await context.newPage();

    console.log('📡 Navegando a HOME (Warmup)...');
    try {
      await page.goto('https://richmondlp.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
    } catch (e) { console.log('   Warmup error (non-fatal):', e.message); }

    console.log('📡 Navegando a login...');
    // Use goto or click if a login link exists
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000 + Math.random() * 1000);

    console.log('📍 Esperando campo de usuario...');
    await page.waitForSelector('#identifier', { timeout: 90000 });
    await page.waitForTimeout(1000 + Math.random() * 1000);

    console.log('📍 Llenando correo...');
    await page.click('#identifier');
    await page.waitForTimeout(300);
    await page.type('#identifier', USER, { delay: 100 + Math.random() * 100 });
    await page.waitForTimeout(800 + Math.random() * 400);

    console.log('📍 Llenando contraseña...');
    await page.click('#password');
    await page.waitForTimeout(300);
    await page.type('#password', PASS, { delay: 100 + Math.random() * 100 });
    await page.waitForTimeout(1000 + Math.random() * 500);

    // HUMANIZATION: Move mouse randomly
    await page.mouse.move(100 + Math.random() * 200, 200 + Math.random() * 200);

    console.log('📍 Iniciando sesión (Estrategia: Enter Key)...');
    try {
      await page.keyboard.press('Enter');
    } catch (e) {
      console.log('   Enter falló, intentando click...');
      await page.click('button:has-text("Sign in")');
    }

    console.log('📍 Esperando que cargue el dashboard...');
    // Increased timeout for slow redirects
    await page.waitForLoadState('networkidle', { timeout: 90000 });
    await page.waitForTimeout(5000);

    const currentUrl = page.url();
    console.log(`📍 URL actual después de login: ${currentUrl}`);

    if (currentUrl.includes('login') || currentUrl.includes('error')) {
      // 📸 CAPTURE ERROR STATE
      console.log('❌ Login seemingly failed. Taking screenshot...');
      await page.screenshot({ path: 'login_failed.png', fullPage: true });

      // 📝 DUMP PAGE CONTENT TO LOGS (Critical for debugging on HF)
      const pageText = await page.innerText('body');
      console.log('📄 CONTENIDO DEL TEXTO DE LA PÁGINA (Ultimos 500 chars):');
      console.log(pageText.slice(-500));

      const pageHTML = await page.content();
      console.log('📄 HTML SNIPPET (Title & H1):');
      const title = await page.title();
      console.log(`Title: ${title}`);

      // Check for specific on-screen errors
      const errorEl = await page.$('.alert-danger, .error-message, div[class*="error"]');
      if (errorEl) {
        const errorText = await errorEl.innerText();
        console.error(`⚠️ Mensaje de error en pantalla: ${errorText}`);
        throw new Error(`Login Error Visible: ${errorText}`);
      }

      throw new Error('Login falló - sin error visible, pero seguimos en login.');
    }

    console.log('✅ Login exitoso!');
    await page.waitForTimeout(3000 + Math.random() * 1000);

    console.log('📍 Validando sesión en Admin...');
    try {
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);

      const adminUrl = page.url();
      if (adminUrl.includes('login') || adminUrl.includes('error')) {
        await page.screenshot({ path: 'admin_session_failed.png', fullPage: true });
        throw new Error('Sesión no válida en Admin (Redirigido a Login)');
      }

      console.log('✅ Sesión persistente validada en Admin');
      isSystemReady = true;
      lastActivityTime = Date.now();
    } catch (e) {
      console.warn('⚠️ Error validando sesión:', e.message);
      throw e;
    }

  } catch (error) {
    console.error(`❌ Error en initBrowser (intento ${retryCount + 1}/${MAX_RETRIES}):`, error.message);

    // Final Screenshot on Crash
    if (page && !page.isClosed()) {
      try { await page.screenshot({ path: `crash_attempt_${retryCount}.png` }); } catch (err) { }
    }

    try { if (browser) await browser.close(); } catch (e) { }
    browser = null;
    page = null;

    if (retryCount < MAX_RETRIES) {
      const waitTime = (retryCount + 1) * 5000;
      console.log(`🔄 Reintentando en ${waitTime / 1000} segundos...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return initBrowser(retryCount + 1);
    }
    throw error;
  }
}

// 🔧 Masking function
function maskName(name) {
  if (!name) return name;
  return name.split(' ').map(part => {
    if (part.length <= 4) return part[0] + '**' + part.slice(-1);
    return part.slice(0, 2) + '**' + part.slice(-2);
  }).join(' ');
}

function smartMaskCell(header, value) {
  if (!value) return value;
  const lower = header.toLowerCase();
  if (lower.includes('name') && !lower.includes('institution')) {
    return maskName(value);
  }
  return value;
}

// Helper search function to reuse across frames
const findButtonInScope = async (scope, scopeName) => {
  console.log(`🔍 Buscando en ${scopeName}...`);

  // 1. Check strict ID/Selector
  let btn = await scope.$('#check-token-button');
  if (btn) return { btn, method: 'ID' };

  btn = await scope.$('a[href*="#check-token"]');
  if (btn) return { btn, method: 'href' };

  // 2. Check all button/a tag texts
  const elements = await scope.$$('button, a, input[type="submit"], div[role="button"]');

  for (const el of elements) {
    try {
      const isVisible = await el.isVisible();
      if (!isVisible) continue;

      const text = (await el.innerText()).trim().toLowerCase();
      if (text.includes('check') || text.includes('verify') || text.includes('validar') || text.includes('access')) {
        return { btn: el, method: `textMatch: "${text}"` };
      }
    } catch (e) { }
  }
  return null;
};

// 🔍 Endpoint principal: buscar access code (QUEUED)
app.post('/api/check-access-code', async (req, res) => {
  const { accessCode } = req.body;
  if (!accessCode) {
    return res.status(400).json({ valid: false, message: 'No access code provided' });
  }

  // Wrap the entire logic in the queue
  try {
    const result = await browserQueue.enqueue(async () => {
      return await processAccessCodeCheck(accessCode);
    });
    res.json(result);
  } catch (err) {
    console.error('❌ Error general en queue:', err.message);
    res.status(500).json({ valid: false, message: err.message || 'Internal Server Error' });
  }
});

// The core logic, now separated for the queue
async function processAccessCodeCheck(accessCode) {
  // 1. Check timeout / Validar sesión
  await checkSessionTimeout();
  lastActivityTime = Date.now();

  if (!page || page.isClosed()) {
    console.log('🔄 Sesión inactiva o cerrada. Iniciando nueva...');
    await initBrowser();
  }

  // 2. Navegación inteligente
  console.log(`🔍 Buscando Access Code: ${accessCode}`);
  const currentUrl = page.url();

  if (!currentUrl.includes('/admin')) {
    console.log('📍 Navegando a Admin...');
    await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } else {
    console.log('📍 Ya estamos en Admin, reutilizando sesión...');
  }

  // 3. Resetear UI si es necesario (Manage Access Codes)
  let input = await page.$('#token_input_token');
  let isInputVisible = input ? await input.isVisible() : false;

  if (!isInputVisible) {
    console.log('📍 Input no visible, asegurando pestaña Manage Access Codes...');
    const links = await page.$$('a[href="#manage-access-codes"]');
    if (links.length > 0) {
      console.log('   Clicking Manage Access Codes tab...');
      try {
        await links[0].click({ timeout: 5000 });
        await page.waitForTimeout(1000);
      } catch (e) {
        console.log('   Click failed, trying JS click');
        await page.evaluate(l => l.click(), links[0]);
      }
    } else {
      console.log('   Tab not found, forcing URL navigation...');
      await page.goto(`${ADMIN_URL}#manage-access-codes`, { waitUntil: 'networkidle', timeout: 60000 });
    }
    await page.waitForTimeout(2000);
  }

  // 4. Buscar input nuevamente
  console.log('📍 Buscando campo de entrada...');
  input = await page.$('#token_input_token');
  if (input && !(await input.isVisible())) input = null;

  if (!input) {
    console.log('   Input ID hidden/missing, searching alternatives...');
    const allInputs = await page.$$('input[type="text"]');
    for (let i = allInputs.length - 1; i >= 0; i--) {
      if (await allInputs[i].isVisible()) {
        input = allInputs[i];
        console.log('   Found visible input alternative');
        break;
      }
    }
  }

  if (!input) throw new Error('No se encontró el input');

  try { await input.scrollIntoViewIfNeeded(); } catch (e) { }

  // 5. Llenar form
  console.log('📍 Ingresando código...');
  await input.fill('');
  await page.waitForTimeout(300);
  await input.fill(accessCode);
  await page.waitForTimeout(300);

  // 6. Buscar botón de Check
  console.log('📍 Buscando botón de verificación...');
  let button = null;
  let searchResult = await findButtonInScope(page, 'Main Page');
  if (!searchResult) {
    const frames = page.frames();
    for (let i = 0; i < frames.length; i++) {
      searchResult = await findButtonInScope(frames[i], `Frame[${i}]`);
      if (searchResult) break;
    }
  }

  if (searchResult) {
    button = searchResult.btn;
  } else {
    throw new Error('Botón NO encontrado.');
  }

  await button.click({ timeout: 15000 });
  console.log('📍 Esperando resultados...');
  await page.waitForTimeout(3000);

  // 7. Extraer resultados
  try {
    await page.waitForSelector('#manage-access-codes table tbody tr', { timeout: 10000 });
  } catch (e) { }

  const resultInfo = await page.evaluate(() => {
    const table = document.querySelector('#manage-access-codes table');
    const targetTable = table || Array.from(document.querySelectorAll('table')).reverse().find(t => t.getBoundingClientRect().height > 0);

    if (!targetTable) return { found: false, rows: [], headers: [] };

    const headers = Array.from(targetTable.querySelectorAll('thead th, tr:first-child th'))
      .map(th => th.innerText.trim()).filter(h => h.length > 0);

    const rows = Array.from(targetTable.querySelectorAll('tbody tr'))
      .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()))
      .filter(row => row.length > 0 && !row.some(cell => cell.toLowerCase().includes('no result')));

    return { found: rows.length > 0, headers: headers.length ? headers : ['Data'], rows };
  });

  lastActivityTime = Date.now();

  if (!resultInfo.found || resultInfo.rows.length === 0) {
    return {
      valid: false,
      message: 'No se encontraron resultados (Código inválido o no usado)',
      data: { accessCode }
    };
  }

  const results = resultInfo.rows.map(row => {
    const obj = {};
    resultInfo.headers.forEach((h, i) => {
      const val = row[i];
      obj[h] = smartMaskCell(h, val);
    });
    return obj;
  });

  console.log('✅ Búsqueda finalizada. Sesión mantenida activa.');
  return {
    valid: true,
    message: 'Access code found successfully ✅',
    data: { accessCode, headers: resultInfo.headers, results }
  };
}


// Endpoint para obtener logs en tiempo real
app.get('/api/logs', (req, res) => {
  res.json({ logs: logBuffer });
});

app.get('/api/status', (req, res) => {
  // Return status immediately without blocking on browser actions
  const queueLength = browserQueue.queue.length;

  // Optional: Trigger a background check if seemingly idle but expired
  // but do NOT await it here.
  if (isSystemReady && (Date.now() - lastActivityTime > SESSION_TIMEOUT_MS)) {
    // Trigger background cleanup if needed, but don't block response
    checkSessionTimeout().catch(err => console.error('Background timeout check failed:', err));
  }

  const status = {
    server: 'OK ✅',
    browser: browser ? 'Initialized ✅' : 'Not initialized ❌',
    page: page && !page.isClosed() ? 'Active ✅' : 'Closed ❌',
    ready: isSystemReady,
    queue: queueLength
  };
  res.json(status);
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Cerrar navegador al terminar proceso
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando navegador...');
  if (browser) await browser.close();
  process.exit(0);
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Servidor ejecutándose en http://localhost:${PORT}`);
});

// Inicializar navegador al inicio
server.on('listening', async () => {
  console.log('✅ Servidor HTTP listo, iniciando navegador...');
  // Initialize in queue to avoid concurrency race conditions on startup
  browserQueue.enqueue(initBrowser).catch(console.error);
});