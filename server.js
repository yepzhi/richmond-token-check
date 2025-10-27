// ... (lo anterior permanece igual)

app.post('/api/check-access-code', async (req, res) => {
    const { accessCode } = req.body;
    if (!accessCode) return res.status(400).json({ valid: false, message: 'No access code provided' });
  
    let context;
    let page;
    try {
      if (!browser) {
        return res.status(500).json({ valid: false, message: 'Browser not initialized' });
      }
  
      // Nuevo contexto y página por request
      context = await browser.newContext();
      page = await context.newPage();
  
      // Login
      await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
      await page.click('button:has-text("Sign in")').catch(() => {});
      await page.waitForSelector('#identifier', { timeout: 15000 });
      await page.fill('#identifier', USER);
      await page.fill('#password', PASS);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('.login100-form-btn')
      ]);
  
      // Ir a Admin
      await page.goto(ADMIN_URL, { waitUntil: 'networkidle' });
  
      // 🔹 Seleccionar el tab "Manage Access Codes"
      const tabLocator = page.locator('text=Manage Access Codes'); // busca el texto exacto
      await tabLocator.waitFor({ state: 'visible', timeout: 60000 });
      await tabLocator.click();
  
      // Esperar input del access code
      await page.waitForSelector('#token_input_token', { timeout: 30000 });
      await page.fill('#token_input_token', accessCode);
      await page.click('#check-token-button');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
  
      // Extraer resultados
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
  
      // Aplicar smart masking
      const maskedRows = resultInfo.rows.map(row => row.map((cell, i) => smartMaskCell(resultInfo.headers[i], cell)));
      const results = maskedRows.map(row => {
        const obj = {};
        resultInfo.headers.forEach((h, i) => (obj[h] = row[i]));
        return obj;
      });
  
      res.json({
        valid: true,
        message: 'Access code found successfully ✅',
        data: { accessCode, headers: resultInfo.headers, results }
      });
  
    } catch (err) {
      console.error('❌ Error en check-access-code:', err);
      if (page && !page.isClosed()) {
        const filePath = `debug_${Date.now()}.png`;
        await page.screenshot({ path: filePath, fullPage: true });
        console.log(`🖼 Screenshot guardado: ${filePath}`);
      }
      res.status(500).json({ valid: false, message: err.message });
    } finally {
      if (context) await context.close();
    }
  });
  
  // ... (resto del server.js igual)