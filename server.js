const express = require('express');
const path = require('path');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let browser;
let page;
let logBuffer = []; // Buffer para guardar logs

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
console.log = function(...args) {
  const message = args.join(' ');
  originalLog.apply(console, args);
  addLog(message);
};

console.error = function(...args) {
  const message = args.join(' ');
  originalError.apply(console, args);
  addLog(message);
};

console.warn = function(...args) {
  const message = args.join(' ');
  originalWarn.apply(console, args);
  addLog(message);
};

// Configuración dinámica
const LOGIN_URL = 'https://richmondlp.com/login';
const ADMIN_URL = 'https://richmondlp.com/admin';
const USER = 'mramirez@richmondelt.com';
const PASS = 'Pass2025#';

// Detectar entorno
const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
console.log(`🔧 Entorno: ${isProd ? 'PRODUCCIÓN (Render)' : 'LOCAL'}`);

// 🚀 Inicializa navegador y hace login una vez
async function initBrowser() {
  try {
    console.log('🌐 Iniciando Chromium...');
    
    const launchOptions = {
      headless: isProd,
      slowMo: isProd ? 0 : 50,
      args: isProd ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ] : []
    };
    
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    page = await context.newPage();
    
    console.log('📡 Navegando a login...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    console.log('📍 Esperando campo de usuario...');
    await page.waitForSelector('#identifier', { timeout: 90000 });
    
    console.log('📍 Llenando correo...');
    await page.fill('#identifier', USER);
    await page.waitForTimeout(500);
    
    console.log('📍 Llenando contraseña...');
    await page.fill('#password', PASS);
    await page.waitForTimeout(500);
    
    console.log('📍 Haciendo click en botón Sign in...');
    await page.click('button:has-text("Sign in")');
    
    console.log('📍 Esperando que cargue el dashboard...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    console.log('✅ Login exitoso!');
    console.log(`📍 URL actual: ${page.url()}`);
    
    // Esperar a que se cargue completamente la sesión
    await page.waitForTimeout(3000);
    
    // Navegar al admin directamente para validar que la sesión persiste
    console.log('📍 Validando sesión en Admin...');
    try {
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log('✅ Sesión persistente validada en Admin');
    } catch (e) {
      console.warn('⚠️  Sesión posiblemente expirada');
    }
    
  } catch (error) {
    console.error('❌ Error en initBrowser:', error.message);
    throw error;
  }
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
  // Solo enmascarar nombres, NO emails
  if (lower.includes('name') && !lower.includes('institution')) {
    return maskName(value);
  }
  // Retornar todo lo demás sin cambios (incluyendo emails)
  return value;
}

// 🔍 Endpoint principal: buscar access code
app.post('/api/check-access-code', async (req, res) => {
  const { accessCode } = req.body;
  
  if (!accessCode) {
    return res.status(400).json({ valid: false, message: 'No access code provided' });
  }

  try {
    // Validar que la sesión esté activa
    if (!page || page.isClosed()) {
      console.error('❌ Página cerrada o no inicializada');
      return res.status(500).json({ valid: false, message: 'Browser session not initialized' });
    }

    console.log(`🔍 Buscando Access Code: ${accessCode}`);
    
    // PASO 1: Navegar a Admin
    console.log('📍 Paso 1: Navegando a Admin...');
    try {
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      console.warn('⚠️  Timeout navegando a Admin, intentando reiniciar sesión...');
      await initBrowser();
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }
    
    await page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    // PASO 2: Hacer scroll y buscar el link de Manage Access Codes
    console.log('📍 Paso 2: Buscando enlace Manage Access Codes...');
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(1000);
    
    let clicked = false;
    const links = await page.$$('a[href="#manage-access-codes"]');
    
    if (links.length > 0) {
      console.log('✅ Enlace encontrado, haciendo click...');
      try {
        await links[0].click({ timeout: 15000 });
        clicked = true;
        await page.waitForTimeout(2000);
      } catch (e) {
        console.log('⚠️  Click falló, intentando navegación directa...');
      }
    }
    
    // Si el click no funcionó, navega directamente
    if (!clicked) {
      console.log('📍 Navegación directa a manage-access-codes...');
      await page.goto(`${ADMIN_URL}#manage-access-codes`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForTimeout(2000);
    }
    
    // PASO 3: Scroll down para ver el formulario de búsqueda
    console.log('📍 Paso 3: Scrolling down para ver el formulario...');
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
    
    // PASO 4: Buscar el input de manera robusta
    console.log('📍 Paso 4: Buscando campo de entrada...');
    let input = null;
    
    // Intento 1: Por ID exacto
    input = await page.$('#token_input_token');
    if (input) {
      console.log('✅ Input encontrado por ID');
    }
    
    // Intento 2: Dentro de manage-access-codes
    if (!input) {
      const section = await page.$('#manage-access-codes');
      if (section) {
        input = await section.$('input[type="text"]');
        if (input) console.log('✅ Input encontrado en sección');
      }
    }
    
    // Intento 3: Todos los inputs visibles (toma el último)
    if (!input) {
      const allInputs = await page.$$('input[type="text"]');
      for (let i = allInputs.length - 1; i >= 0; i--) {
        try {
          const isVisible = await allInputs[i].isVisible();
          if (isVisible) {
            input = allInputs[i];
            console.log('✅ Input visible encontrado');
            break;
          }
        } catch (e) {
          // Continuar si hay error
        }
      }
    }
    
    if (!input) {
      console.error('❌ No se encontró el input');
      return res.status(500).json({ valid: false, message: 'Input field not found' });
    }
    
    // PASO 5: Llenar el input
    console.log('📍 Paso 5: Ingresando código...');
    await input.fill(accessCode);
    await page.waitForTimeout(1500);
    
    // PASO 6: Buscar y hacer click en el botón
    console.log('📍 Paso 6: Buscando botón de verificación...');
    let button = null;
    
    // Intento 1: Por ID
    button = await page.$('#check-token-button');
    
    // Intento 2: Por texto (button o a[role="button"])
    if (!button) {
      const allButtons = await page.$$('button, a[role="button"]');
      for (let btn of allButtons) {
        try {
          const text = await btn.innerText();
          if (text.toLowerCase().includes('check')) {
            button = btn;
            console.log('✅ Botón encontrado por texto');
            break;
          }
        } catch (e) {
          // Continuar
        }
      }
    }
    
    if (!button) {
      console.error('❌ Botón de verificación no encontrado');
      return res.status(500).json({ valid: false, message: 'Check button not found' });
    }
    
    console.log('✅ Botón encontrado, haciendo click...');
    await button.click({ timeout: 15000 });
    await page.waitForTimeout(3000);
    
    // Esperar a que carguen los resultados
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2000);
    
    // PASO 7: Extraer datos
    console.log('📍 Paso 7: Extrayendo datos...');
    const resultInfo = await page.evaluate(() => {
      const table = document.querySelector('#manage-access-codes table');
      if (!table) {
        console.log('No table found');
        return { found: false, rows: [], headers: [] };
      }

      const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th'))
        .map(th => th.innerText.trim())
        .filter(h => h.length > 0);
      
      console.log('Headers found:', headers.length);
      
      const rows = Array.from(table.querySelectorAll('tbody tr'))
        .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()))
        .filter(row => row.length > 0 && !row.some(cell => cell.includes('No results')));

      console.log('Rows found:', rows.length);
      
      return { 
        found: rows.length > 0, 
        headers: headers.length > 0 ? headers : ['No headers'], 
        rows 
      };
    });

    console.log(`📊 Tabla extraída - Headers: ${resultInfo.headers.length}, Filas: ${resultInfo.rows.length}`);

    if (!resultInfo.found || resultInfo.rows.length === 0) {
      console.log('⚠️  No se encontraron resultados');
      return res.json({ 
        valid: false, 
        message: 'Este código no ha sido utilizado, favor de proceder a registrarse ó agregar el producto en el boton +ADD ACESSS CODE dentro de su sesión', 
        data: { accessCode } 
      });
    }

    console.log('✅ Datos encontrados, aplicando masking...');
    
    // Aplicar masking
    const maskedRows = resultInfo.rows.map(row => 
      row.map((cell, i) => smartMaskCell(resultInfo.headers[i], cell))
    );

    const results = maskedRows.map(row => {
      const obj = {};
      resultInfo.headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      return obj;
    });

    console.log('✅ Datos procesados correctamente');
    console.log(`📊 Resultados encontrados: ${results.length} registro(s)`);
    
    res.json({
      valid: true,
      message: 'Access code found successfully ✅',
      data: {
        accessCode,
        headers: resultInfo.headers,
        results: results
      }
    });

  } catch (err) {
    console.error('❌ Error en check-access-code:', err.message);
    res.status(500).json({ 
      valid: false, 
      message: err.message,
      error: isProd ? 'Server error' : err.stack
    });
  }
});

// Endpoint para obtener logs en tiempo real
app.get('/api/logs', (req, res) => {
  res.json({ logs: logBuffer });
});

// Health check
app.get('/api/status', async (req, res) => {
  const status = {
    server: 'OK ✅',
    environment: isProd ? 'PRODUCCIÓN' : 'LOCAL',
    browser: browser ? 'Initialized ✅' : 'Not initialized ❌',
    page: page && !page.isClosed() ? 'Active ✅' : 'Closed ❌',
    url: page && !page.isClosed() ? await page.url() : 'N/A'
  };
  res.json(status);
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Cerrar navegador al terminar
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando navegador...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📍 Entorno: ${isProd ? '🔴 PRODUCCIÓN (Render)' : '🟢 LOCAL'}\n`);
  
  try {
    await initBrowser();
    console.log('✅ Sistema listo para recibir peticiones\n');
  } catch (error) {
    console.error('❌ Error fatal al inicializar:', error.message);
    process.exit(1);
  }
});