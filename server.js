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

// 🚀 Inicializa navegador y hace login con retry automático
async function initBrowser(retryCount = 0) {
  const MAX_RETRIES = 3;
  
  try {
    console.log('🌐 Iniciando Chromium...');
    
    const launchOptions = {
      headless: isProd,
      slowMo: isProd ? 100 : 50, // Más lento para parecer humano
      args: isProd ? [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled' // Ocultar automatización
      ] : []
    };
    
    browser = await chromium.launch(launchOptions);
    
    // Crear contexto con user agent real y permisos
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation']
    });
    
    // Inyectar script para ocultar webdriver
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // Ocultar otras señales de automatización
      window.chrome = {
        runtime: {}
      };
      
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });
      
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en']
      });
    });
    
    page = await context.newPage();
    
    console.log('📡 Navegando a login...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
    
    // Esperar de forma más "humana"
    await page.waitForTimeout(2000 + Math.random() * 1000);
    
    console.log('📍 Esperando campo de usuario...');
    await page.waitForSelector('#identifier', { timeout: 90000 });
    
    // Espera random para simular lectura
    await page.waitForTimeout(1000 + Math.random() * 1000);
    
    console.log('📍 Llenando correo...');
    await page.click('#identifier'); // Click antes de escribir
    await page.waitForTimeout(300);
    await page.type('#identifier', USER, { delay: 100 + Math.random() * 100 }); // Tipear con delay
    await page.waitForTimeout(800 + Math.random() * 400);
    
    console.log('📍 Llenando contraseña...');
    await page.click('#password');
    await page.waitForTimeout(300);
    await page.type('#password', PASS, { delay: 100 + Math.random() * 100 });
    await page.waitForTimeout(1000 + Math.random() * 500);
    
    console.log('📍 Haciendo click en botón Sign in...');
    await page.click('button:has-text("Sign in")');
    
    console.log('📍 Esperando que cargue el dashboard...');
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await page.waitForTimeout(3000);
    
    // Verificar si el login fue exitoso revisando la URL
    const currentUrl = page.url();
    console.log(`📍 URL actual después de login: ${currentUrl}`);
    
    if (currentUrl.includes('login') || currentUrl.includes('error')) {
      throw new Error('Login falló - redirigido a página de login o error');
    }
    
    console.log('✅ Login exitoso!');
    
    // Esperar a que se cargue completamente la sesión
    await page.waitForTimeout(3000 + Math.random() * 1000);
    
    // Navegar al admin directamente para validar que la sesión persiste
    console.log('📍 Validando sesión en Admin...');
    try {
      await page.goto(ADMIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2000);
      
      const adminUrl = page.url();
      if (adminUrl.includes('login') || adminUrl.includes('error')) {
        throw new Error('Sesión no válida en Admin');
      }
      
      console.log('✅ Sesión persistente validada en Admin');
    } catch (e) {
      console.warn('⚠️ Error validando sesión:', e.message);
      throw e;
    }
    
  } catch (error) {
    console.error(`❌ Error en initBrowser (intento ${retryCount + 1}/${MAX_RETRIES}):`, error.message);
    
    // Cerrar navegador si existe
    try {
      if (browser) {
        await browser.close();
      }
    } catch (e) {
      // Ignorar errores al cerrar
    }
    
    browser = null;
    page = null;
    
    // Reintentar si no hemos llegado al límite
    if (retryCount < MAX_RETRIES) {
      const waitTime = (retryCount + 1) * 5000; // 5s, 10s, 15s (más tiempo entre intentos)
      console.log(`🔄 Reintentando en ${waitTime/1000} segundos...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return initBrowser(retryCount + 1);
    }
    
    throw error;
  }
}

// 🔧 Masking function
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
      console.error('❌ Página cerrada o no inicializada, reiniciando...');
      await initBrowser();
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
    await input.fill(''); // Limpiar primero
    await page.waitForTimeout(500);
    await input.fill(accessCode);
    await page.waitForTimeout(500);
    
    // Verificar que el código se ingresó correctamente
    const inputValue = await input.inputValue();
    console.log(`✅ Código ingresado: ${inputValue}`);
    
    if (inputValue !== accessCode) {
      console.warn('⚠️ El código ingresado no coincide, reintentando...');
      await input.fill('');
      await page.waitForTimeout(300);
      await input.type(accessCode, { delay: 50 });
      await page.waitForTimeout(500);
    }
    
    // Hacer scroll hacia arriba para ver el botón check
    console.log('📍 Scrolling hacia arriba para ver el botón...');
    await page.evaluate(() => window.scrollBy(0, -400));
    await page.waitForTimeout(1000);
    
    // PASO 6: Buscar y hacer click en el botón
    console.log('📍 Paso 6: Buscando botón de verificación...');
    let button = null;
    
    // Intento 1: Por ID exacto
    button = await page.$('#check-token-button');
    if (button) {
      console.log('✅ Botón encontrado por ID');
    }
    
    // Intento 2: Por selector a[href] que contenga check
    if (!button) {
      button = await page.$('a[href="#check-token"]');
      if (button) console.log('✅ Botón encontrado por href');
    }
    
    // Intento 3: Por clase
    if (!button) {
      button = await page.$('.button--cta');
      if (button) console.log('✅ Botón encontrado por clase');
    }
    
    // Intento 4: Por el span interno "check access code"
    if (!button) {
      console.log('📍 Buscando por span.button__text...');
      // Buscar el span y luego su padre
      const spans = await page.$('span.button__text');
      for (let span of spans) {
        try {
          const text = await span.textContent();
          if (text && text.toLowerCase().includes('check')) {
            button = await span.evaluateHandle(el => el.closest('button, a'));
            console.log('✅ Botón encontrado por span interno:', text);
            break;
          }
        } catch (e) {
          // Continuar
        }
      }
    }
    
    // Intento 5: Buscar botón que esté cerca del input (mismo formulario/sección)
    if (!button) {
      console.log('📍 Buscando botón en la misma sección del input...');
      const section = await page.$('#manage-access-codes');
      if (section) {
        const sectionButtons = await section.$('button, a.button, input[type="submit"]');
        for (let btn of sectionButtons) {
          try {
            const isVisible = await btn.isVisible();
            if (isVisible) {
              const text = await btn.textContent();
              if (text && text.toLowerCase().includes('check')) {
                button = btn;
                console.log('✅ Botón encontrado en sección:', text);
                break;
              }
            }
          } catch (e) {
            // Continuar
          }
        }
      }
    }
    
    // Intento 6: Por texto en cualquier botón/link (más estricto)
    if (!button) {
      console.log('📍 Búsqueda general por texto...');
      const allButtons = await page.$('button, a[role="button"], a.button, a');
      for (let btn of allButtons) {
        try {
          const text = await btn.textContent();
          if (text && text.toLowerCase().includes('check') && text.toLowerCase().includes('access')) {
            const isVisible = await btn.isVisible();
            if (isVisible) {
              button = btn;
              console.log('✅ Botón encontrado por texto completo:', text.trim());
              break;
            }
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
    
    console.log('📍 Esperando a que carguen los resultados...');
    await page.waitForTimeout(3000);
    
    // Esperar a que carguen los resultados de múltiples formas
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(3000);
    
    // Intentar esperar a que aparezca la tabla con datos
    try {
      await page.waitForSelector('#manage-access-codes table tbody tr', { timeout: 10000 });
      console.log('✅ Tabla de resultados detectada');
    } catch (e) {
      console.log('⚠️ Tabla no detectada, continuando...');
    }
    
    await page.waitForTimeout(2000);
    
    // PASO 7: Extraer datos
    console.log('📍 Paso 7: Extrayendo datos...');
    
    // Hacer scroll para asegurarse que la tabla esté visible
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(1000);
    
    const resultInfo = await page.evaluate(() => {
      const table = document.querySelector('#manage-access-codes table');
      if (!table) {
        // Intentar buscar cualquier tabla visible
        const allTables = document.querySelectorAll('table');
        console.log('Tablas encontradas:', allTables.length);
        
        if (allTables.length === 0) {
          return { found: false, rows: [], headers: [] };
        }
        
        // Usar la última tabla visible
        const visibleTable = Array.from(allTables).reverse().find(t => {
          const rect = t.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        
        if (!visibleTable) {
          return { found: false, rows: [], headers: [] };
        }
        
        const headers = Array.from(visibleTable.querySelectorAll('thead th, tr:first-child th'))
          .map(th => th.innerText.trim())
          .filter(h => h.length > 0);
        
        const rows = Array.from(visibleTable.querySelectorAll('tbody tr'))
          .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()))
          .filter(row => row.length > 0 && !row.some(cell => cell.toLowerCase().includes('no result')));
        
        console.log('Tabla alternativa - Headers:', headers.length, 'Rows:', rows.length);
        
        return { 
          found: rows.length > 0, 
          headers: headers.length > 0 ? headers : ['No headers'], 
          rows 
        };
      }

      const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th'))
        .map(th => th.innerText.trim())
        .filter(h => h.length > 0);
      
      console.log('Headers found:', headers.length);
      
      const rows = Array.from(table.querySelectorAll('tbody tr'))
        .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim()))
        .filter(row => row.length > 0 && !row.some(cell => cell.toLowerCase().includes('no result')));

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
        message: 'No se encontraron resultados, si el código es válido, es probable que este código no ha sido utilizado ó bien este mal escrito. En caso de ser válido favor de proceder a registrarse ó agregar el producto en el boton +ADD ACESSS CODE dentro de su sesión', 
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
    
    // 🔄 Cerrar sesión y reiniciar para siguiente búsqueda
    console.log('🔄 Cerrando sesión para reiniciar...');
    try {
      if (browser) {
        await browser.close();
      }
      browser = null;
      page = null;
      console.log('✅ Sesión cerrada, lista para nueva búsqueda');
      // Reiniciar navegador en background
      setTimeout(() => {
        initBrowser().catch(err => console.error('Error reiniciando navegador:', err));
      }, 2000);
    } catch (e) {
      console.warn('⚠️  Error cerrando sesión:', e.message);
    }

  } catch (err) {
    console.error('❌ Error en check-access-code:', err.message);
    
    // También cerrar sesión en caso de error
    try {
      if (browser) {
        await browser.close();
      }
      browser = null;
      page = null;
      setTimeout(() => {
        initBrowser().catch(err => console.error('Error reiniciando navegador:', err));
      }, 2000);
    } catch (e) {
      console.warn('⚠️  Error cerrando sesión:', e.message);
    }
    
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
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📍 Entorno: ${isProd ? '🔴 PRODUCCIÓN (Render)' : '🟢 LOCAL'}\n`);
});

// Inicializar navegador DESPUÉS de que el servidor esté arriba
server.on('listening', async () => {
  console.log('✅ Servidor HTTP listo, iniciando navegador...');
  
  try {
    await initBrowser();
    console.log('✅ Sistema completamente listo para recibir peticiones\n');
  } catch (error) {
    console.error('❌ Error al inicializar navegador:', error.message);
    console.warn('⚠️  El servidor HTTP sigue funcionando. El navegador se iniciará en el primer request.\n');
    // No cerrar el servidor, permitir que continúe
  }
});