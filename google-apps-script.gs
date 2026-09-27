/**
 * CashTrack — google-apps-script.gs
 * =============================================================
 * Google Apps Script Web App Backend
 *
 * SETUP:
 *   1. Go to script.google.com → New project
 *   2. Paste this entire file
 *   3. Change SPREADSHEET_ID and EXPECTED_TOKEN below
 *   4. Run setupSheet() once manually to create headers
 *   5. Deploy as Web App (see README for full steps)
 *
 * ENDPOINTS:
 *   POST /exec  → Save new expense row
 *   GET  /exec  → Health check
 * =============================================================
 */

/* ─────────────────────────────────────────────────────────────
   CONFIGURATION
   Replace these values before deploying.
───────────────────────────────────────────────────────────── */
const SPREADSHEET_ID  = '1nt5I7KH-D4NU9BhJnuNe75PsP-VI5RBc7bSDkVKEX6M';
const SHEET_NAME      = 'Expenses';
const EXPECTED_TOKEN  = 'NurHananSafiya04';  // must match app.js CONFIG.API_TOKEN

/* ─────────────────────────────────────────────────────────────
   COLUMN SCHEMA
   Order here must match the headers in the sheet.
   Do not rearrange without updating setupSheet() too.
───────────────────────────────────────────────────────────── */
const COLUMNS = [
  'Timestamp',        // A  — ISO timestamp of submission
  'Date',             // B  — Trip date (YYYY-MM-DD)
  'Driver',           // C  — Driver name
  'Lori',             // D  — Lori
  'Kilang',           // E  — Kilang / factory
  'Opening Cash',     // F  — Wang awal
  'Topup Received',   // G  — Topup received
  'Available Cash',   // H  — Opening + Topup
  'Upah Naik',        // I  — Upah naik dedak
  'Upah Turun',       // J  — Upah turun dedak
  'Upah Forklift',    // K  — Upah forklift
  'Air',              // L  — Air (minum)
  'Makan',            // M  — Makan
  'Lain-lain',        // N  — Other expenses
  'Lain-lain Reason', // O  — Reason for other expenses
  'Total Expenses',   // P  — Sum of all expenses
  'Closing Balance',  // Q  — Available - Total Expenses
];

/* ─────────────────────────────────────────────────────────────
   CORS HEADERS
   Required for browser fetch() calls.
───────────────────────────────────────────────────────────── */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/* ─────────────────────────────────────────────────────────────
   ENTRY POINTS
───────────────────────────────────────────────────────────── */

/**
 * Handle HTTP GET requests — used as health check.
 * @param {GoogleAppsScript.Events.DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doGet(e) {
  return buildJsonResponse({
    status:  'ok',
    message: 'CashTrack API is running.',
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
}

/**
 * Handle HTTP POST requests — save expense data.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  // Handle preflight OPTIONS (some browsers send this)
  if (!e || !e.postData) {
    return buildJsonResponse({ status: 'error', message: 'Empty request body.' }, 400);
  }

  try {
    // ── 1. Parse JSON body ──────────────────────────────────
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return buildJsonResponse({ status: 'error', message: 'Invalid JSON body.' }, 400);
    }

    // ── 2. Validate API token ───────────────────────────────
    if (!payload.apiToken || payload.apiToken !== EXPECTED_TOKEN) {
      Logger.log('[CashTrack] Unauthorized attempt. Token: ' + payload.apiToken);
      return buildJsonResponse({ status: 'error', message: 'Unauthorized.' }, 401);
    }

    // ── 3. Validate required fields ────────────────────────
    const validationError = validatePayload(payload);
    if (validationError) {
      return buildJsonResponse({ status: 'error', message: validationError }, 422);
    }

    // ── 4. Sanitize & write to sheet ───────────────────────
    const sanitized = sanitizePayload(payload);
    writeToSheet(sanitized);

    // ── 5. Return success ───────────────────────────────────
    Logger.log('[CashTrack] Row written for driver: ' + sanitized.driverName + ' on ' + sanitized.date);
    return buildJsonResponse({
      status:  'success',
      message: 'Expense recorded successfully.',
      driver:  sanitized.driverName,
      date:    sanitized.date,
    });

  } catch (err) {
    Logger.log('[CashTrack] Unexpected error: ' + err.toString());
    return buildJsonResponse({
      status:  'error',
      message: 'Server error: ' + err.message,
    }, 500);
  }
}

/* ─────────────────────────────────────────────────────────────
   VALIDATION
───────────────────────────────────────────────────────────── */

/**
 * Validate required fields in the payload.
 * @param {object} p  — raw payload
 * @returns {string|null}  error message or null if valid
 */
function validatePayload(p) {
  // Required string fields
  const requiredStrings = ['driverName', 'date', 'lori', 'kilang'];
  for (const field of requiredStrings) {
    if (!p[field] || String(p[field]).trim() === '') {
      return 'Missing required field: ' + field;
    }
  }

  // Validate driver name against whitelist
  const ALLOWED_DRIVERS = [
    'Faizal Soberi',
    'Sarizal Johari',
    'Fadli Tasu',
    'Amirul Asyraf'
    ];
  if (!ALLOWED_DRIVERS.includes(p.driverName)) {
    return 'Invalid driver name: ' + p.driverName;
  }

  // Validate lorries against whitelist
  const ALLOWED_LORRIES = [
    'PQS754',
    'KDL5459',
    'AMT8246',  
    'AMA3999'
    ];
  if (!ALLOWED_LORRIES.includes(p.lori)) {
    return 'Invalid lorry: ' + p.lori;
  }

  // Validate kilang against whitelist
  const ALLOWED_KILANG = [
    'Bismi_Farm 01_Kg Barokhas',
    'Bismi_Farm 02_Kg Lamdin',
    'Bismi_Farm 03_Kg Rambutan',
    'Bismi_Farm 07_Kg Tok Nak',
    'Bismi_Farm 08_Kg Pong Utara',
    'Bismi_Farm 09_Kg Pong Selatan',
    'Bismi_Farm 10_Kg Wan Tepus',
    'Bismi_Farm 12_Kg Durian',
    'Bismi_Farm 15_Kg Nami',
    'Bismi_Farm A_Kg Chang Deng',
    'Bismi_Farm B_Kg Lampam',
    'Bismi_Farm BR_Kg Bendang Raja',
    'Bismi_Farm BTS 1',
    'Bismi_Farm BTS 2',
    'Bismi_Farm Pak Hassan',
    'CP_Bukit Payung_Deza Agro',
    'CP_Changlon_Ayam Gemok',
    'CP_Kubang Lintah_Asraria',
    'CP_Kubang Lintah_Halim Ismail',
    'CP_Kubang Lintah_Izham',
    'CP_Merbok_Famox',
    'CP_Sungai Kap_Ting Agro'
    ];
  if (!ALLOWED_KILANG.includes(p.kilang)) {
    return 'Invalid kilang: ' + p.kilang;
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    return 'Invalid date format. Expected YYYY-MM-DD.';
  }

// Validate numeric fields: must be >= 0
const numericFields = [
  'openingCash',
  'topupReceived',
  'availableCash',
  'upahNaik',
  'upahTurun',
  'upahForklift',
  'air',
  'makan',
  'lainLain',
  'totalExpenses'
];

for (const field of numericFields) {
  const val = parseFloat(p[field]);
  if (isNaN(val) || val < 0) {
    return 'Invalid numeric value for: ' + field;
  }
}

// Closing balance can be negative (payables allowed)
const closing = parseFloat(p.closingBalance);
if (isNaN(closing)) {
  return 'Closing balance invalid.';
}

  // Lain-lain reason required if lain-lain > 0
  if (parseFloat(p.lainLain) > 0 && (!p.lainLainReason || String(p.lainLainReason).trim() === '')) {
    return 'Reason is required when lain-lain > 0.';
  }

  // Verify available cash = opening + topup
  const computedAvailable = parseFloat(p.openingCash) + parseFloat(p.topupReceived);
  if (Math.abs(computedAvailable - parseFloat(p.availableCash)) > 0.01) {
    return 'Available cash mismatch. Expected: ' + computedAvailable;
  }

  // Verify total expenses = sum of items
  const computedTotal = ['upahNaik','upahTurun','upahForklift','air','makan','lainLain']
    .reduce((sum, f) => sum + (parseFloat(p[f]) || 0), 0);
  if (Math.abs(computedTotal - parseFloat(p.totalExpenses)) > 0.01) {
    return 'Total expenses mismatch. Expected: ' + computedTotal.toFixed(2);
  }

  // Verify closing balance = available - total
  const computedClosing = computedAvailable - computedTotal;
  if (Math.abs(computedClosing - parseFloat(p.closingBalance)) > 0.01) {
    return 'Closing balance mismatch. Expected: ' + computedClosing.toFixed(2);
  }

  return null; // all valid
}

/* ─────────────────────────────────────────────────────────────
   SANITIZATION
───────────────────────────────────────────────────────────── */

/**
 * Strip dangerous characters and normalize values.
 * @param {object} p — raw payload
 * @returns {object} clean payload
 */
function sanitizePayload(p) {
  return {
    timestamp:      p.timestamp || new Date().toISOString(),
    date:           String(p.date).trim(),
    driverName:     cleanString(p.driverName, 50),
    lori:           cleanString(p.lori, 150),
    kilang:         cleanString(p.kilang, 50),
    openingCash:    toFixed2(p.openingCash),
    topupReceived:  toFixed2(p.topupReceived),
    availableCash:  toFixed2(p.availableCash),
    upahNaik:       toFixed2(p.upahNaik),
    upahTurun:      toFixed2(p.upahTurun),
    upahForklift:   toFixed2(p.upahForklift),
    air:            toFixed2(p.air),
    makan:          toFixed2(p.makan),
    lainLain:       toFixed2(p.lainLain),
    lainLainReason: cleanString(p.lainLainReason || '', 300),
    totalExpenses:  toFixed2(p.totalExpenses),
    closingBalance: toFixed2(p.closingBalance),
  };
}

/**
 * Clean a string: remove HTML, trim, cap length.
 * @param {*} val
 * @param {number} maxLen
 * @returns {string}
 */
function cleanString(val, maxLen) {
  return String(val || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"']/g, '')
    .trim()
    .substring(0, maxLen);
}

/**
 * Parse a number and return it rounded to 2 decimal places.
 * @param {*} val
 * @returns {number}
 */
function toFixed2(val) {
  return Math.round((parseFloat(val) || 0) * 100) / 100;
}

/* ─────────────────────────────────────────────────────────────
   SHEET WRITE
───────────────────────────────────────────────────────────── */

/**
 * Append a new row to the Expenses sheet.
 * @param {object} d — sanitized payload
 */
function writeToSheet(d) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('Sheet "' + SHEET_NAME + '" not found. Run setupSheet() first.');
  }

  // Build the row in exact column order
  const row = [
    d.timestamp,       // A: Timestamp
    d.date,            // B: Date
    d.driverName,      // C: Driver
    d.lori,            // D: Lori
    d.kilang,          // E: Kilang
    d.openingCash,     // F: Opening Cash
    d.topupReceived,   // G: Topup Received
    d.availableCash,   // H: Available Cash
    d.upahNaik,        // I: Upah Naik
    d.upahTurun,       // J: Upah Turun
    d.upahForklift,    // J: Upah Forklift
    d.air,             // K: Air
    d.makan,           // L: Makan
    d.lainLain,        // M: Lain-lain
    d.lainLainReason,  // N: Lain-lain Reason
    d.totalExpenses,   // O: Total Expenses
    d.closingBalance,  // P: Closing Balance
  ];

  sheet.appendRow(row);
}

/* ─────────────────────────────────────────────────────────────
   SHEET SETUP (run once manually)
───────────────────────────────────────────────────────────── */

/**
 * One-time setup: create the Expenses sheet with headers,
 * column formatting, frozen row, and alternating row colors.
 *
 * RUN MANUALLY: In Apps Script editor → select setupSheet → Run.
 */
function setupSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Create or clear the sheet
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log('[CashTrack] Created sheet: ' + SHEET_NAME);
  }

  // ── Write header row ──────────────────────────────────────
  const headerRange = sheet.getRange(1, 1, 1, COLUMNS.length);
  headerRange.setValues([COLUMNS]);

  // Style header row
  headerRange
    .setBackground('#0f4c3a')
    .setFontColor('#ffffff')
    .setFontFamily('Arial')
    .setFontSize(10)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setWrap(true);

  // ── Freeze header row ─────────────────────────────────────
  sheet.setFrozenRows(1);

  // ── Column widths ─────────────────────────────────────────
  const widths = [180, 100, 80, 80, 180, 90, 90, 90, 80, 80, 60, 60, 80, 200, 100, 100];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  // ── Format numeric columns (F–P, indices 6–16) ───────────
  const numFormat = '#,##0.00';
  sheet.getRange(2, 6, sheet.getMaxRows() - 1, 11).setNumberFormat(numFormat);

  // ── Auto alternating row banding ─────────────────────────
  const existingBandings = sheet.getBandings();
  existingBandings.forEach(b => b.remove());

  const dataRange = sheet.getRange(1, 1, sheet.getMaxRows(), COLUMNS.length);
  dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY)
    .setHeaderRowColor('#0f4c3a')
    .setFirstRowColor('#ffffff')
    .setSecondRowColor('#f5f3ef');

  Logger.log('[CashTrack] Sheet setup complete. ' + COLUMNS.length + ' columns created.');
  SpreadsheetApp.flush();
}

/* ─────────────────────────────────────────────────────────────
   DASHBOARD SHEET SETUP (run once manually)
   Creates a second sheet with summary formulas.
───────────────────────────────────────────────────────────── */

/**
 * Create a Dashboard sheet with aggregation formulas.
 * RUN MANUALLY after setupSheet().
 */
function setupDashboard() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const DASH = 'Dashboard';
  let dash = ss.getSheetByName(DASH);
  if (!dash) {
    dash = ss.insertSheet(DASH);
  }

  dash.clearContents();
  dash.clearFormats();

  // ── Title ────────────────────────────────────────────────
  dash.getRange('A1').setValue('CashTrack — Dashboard');
  dash.getRange('A1')
    .setFontFamily('Arial').setFontSize(16).setFontWeight('bold')
    .setFontColor('#0f4c3a');

  dash.getRange('A2').setValue('Auto-updated. Do not edit manually.');
  dash.getRange('A2').setFontColor('#888888').setFontSize(9);

  dash.getRange('A3').setValue('Last Refreshed:');
  dash.getRange('B3').setFormula('=NOW()');
  dash.getRange('B3').setNumberFormat('dd/mm/yyyy hh:mm');

  /* ──────────────────────────────────────────────────────────
     SECTION 1: OVERALL TOTALS
  ────────────────────────────────────────────────────────── */
  const sec1Row = 5;
  writeSectionHeader(dash, sec1Row, 'A', 'RINGKASAN KESELURUHAN');

  const overallHeaders = ['Metrik', 'Nilai'];
  const overallData = [
    ['Jumlah Rekod',          '=COUNTA(Expenses!B:B)-1'],
    ['Jumlah Wang Awal',      '=SUM(Expenses!F:F)'],
    ['Jumlah Topup',          '=SUM(Expenses!G:G)'],
    ['Jumlah Upah Naik',      '=SUM(Expenses!H:H)'],
    ['Jumlah Upah Turun',     '=SUM(Expenses!I:I)'],
    ['Jumlah Upah Forklift',  '=SUM(Expenses!J:J)'],
    ['Jumlah Air',            '=SUM(Expenses!K:K)'],
    ['Jumlah Makan',          '=SUM(Expenses!L:L)'],
    ['Jumlah Lain-lain',      '=SUM(Expenses!M:M)'],
    ['JUMLAH PERBELANJAAN',   '=SUM(Expenses!O:O)'],
    ['Baki Akhir Keseluruhan','=SUM(Expenses!P:P)'],
  ];

  dash.getRange(sec1Row + 1, 1, 1, 2).setValues([overallHeaders])
    .setBackground('#e8f5e9').setFontWeight('bold');
  dash.getRange(sec1Row + 2, 1, overallData.length, 2).setValues(overallData);
  dash.getRange(sec1Row + 2, 2, overallData.length, 1).setNumberFormat('#,##0.00');

  /* ──────────────────────────────────────────────────────────
     SECTION 2: MONTHLY BREAKDOWN (current month)
  ────────────────────────────────────────────────────────── */
  const sec2Row = sec1Row + overallData.length + 4;
  writeSectionHeader(dash, sec2Row, 'A', 'PERBELANJAAN BULAN INI');

  // Using SUMPRODUCT with MONTH/YEAR matching
  const monthlyHeaders = ['Bulan', 'Tahun', 'Jumlah Perbelanjaan', 'Baki Akhir'];
  const monthlyFormula = [
    ['=TEXT(TODAY(),"mmmm")', '=YEAR(TODAY())',
     '=SUMPRODUCT((MONTH(Expenses!B2:B)=MONTH(TODAY()))*(YEAR(Expenses!B2:B)=YEAR(TODAY()))*Expenses!O2:O)',
     '=SUMPRODUCT((MONTH(Expenses!B2:B)=MONTH(TODAY()))*(YEAR(Expenses!B2:B)=YEAR(TODAY()))*Expenses!P2:P)'],
  ];

  dash.getRange(sec2Row + 1, 1, 1, 4).setValues([monthlyHeaders])
    .setBackground('#e8f5e9').setFontWeight('bold');
  dash.getRange(sec2Row + 2, 1, 1, 4).setValues(monthlyFormula);
  dash.getRange(sec2Row + 2, 3, 1, 2).setNumberFormat('#,##0.00');

  /* ──────────────────────────────────────────────────────────
     SECTION 3: SPENDING BY DRIVER
  ────────────────────────────────────────────────────────── */
  const sec3Row = sec2Row + 6;
  writeSectionHeader(dash, sec3Row, 'A', 'PERBELANJAAN MENGIKUT PEMANDU');

  const drivers = ['Ali', 'Abu', 'Mat', 'Din', 'Rahman'];
  const driverHeaders = ['Pemandu', 'Bil. Trip', 'Jumlah Perbelanjaan', 'Purata / Trip', 'Baki Akhir'];
  dash.getRange(sec3Row + 1, 1, 1, driverHeaders.length).setValues([driverHeaders])
    .setBackground('#e8f5e9').setFontWeight('bold');

  const driverRows = drivers.map(d => [
    d,
    `=COUNTIF(Expenses!C:C,"${d}")`,
    `=SUMIF(Expenses!C:C,"${d}",Expenses!O:O)`,
    `=IFERROR(SUMIF(Expenses!C:C,"${d}",Expenses!O:O)/COUNTIF(Expenses!C:C,"${d}"),0)`,
    `=SUMIF(Expenses!C:C,"${d}",Expenses!P:P)`,
  ]);

  dash.getRange(sec3Row + 2, 1, driverRows.length, driverHeaders.length).setValues(driverRows);
  dash.getRange(sec3Row + 2, 3, driverRows.length, 3).setNumberFormat('#,##0.00');

  // Total row
  const driverTotalRow = sec3Row + 2 + driverRows.length;
  dash.getRange(driverTotalRow, 1).setValue('JUMLAH');
  dash.getRange(driverTotalRow, 2).setFormula(`=SUM(B${sec3Row+2}:B${driverTotalRow-1})`);
  dash.getRange(driverTotalRow, 3).setFormula(`=SUM(C${sec3Row+2}:C${driverTotalRow-1})`);
  dash.getRange(driverTotalRow, 4).setValue('—');
  dash.getRange(driverTotalRow, 5).setFormula(`=SUM(E${sec3Row+2}:E${driverTotalRow-1})`);
  dash.getRange(driverTotalRow, 1, 1, 5).setFontWeight('bold').setBackground('#d1fae5');
  dash.getRange(driverTotalRow, 3, 1, 1).setNumberFormat('#,##0.00');
  dash.getRange(driverTotalRow, 5, 1, 1).setNumberFormat('#,##0.00');

  /* ──────────────────────────────────────────────────────────
     SECTION 4: SPENDING BY KILANG
  ────────────────────────────────────────────────────────── */
  const sec4Row = driverTotalRow + 4;
  writeSectionHeader(dash, sec4Row, 'A', 'PERBELANJAAN MENGIKUT KILANG');

  const kilangList = ['CP', 'PWF', 'Others'];
  const kilangHeaders = ['Kilang', 'Bil. Trip', 'Jumlah Perbelanjaan', 'Purata / Trip'];
  dash.getRange(sec4Row + 1, 1, 1, kilangHeaders.length).setValues([kilangHeaders])
    .setBackground('#e8f5e9').setFontWeight('bold');

  const kilangRows = kilangList.map(k => [
    k,
    `=COUNTIF(Expenses!D:D,"${k}")`,
    `=SUMIF(Expenses!D:D,"${k}",Expenses!O:O)`,
    `=IFERROR(SUMIF(Expenses!D:D,"${k}",Expenses!O:O)/COUNTIF(Expenses!D:D,"${k}"),0)`,
  ]);

  dash.getRange(sec4Row + 2, 1, kilangRows.length, kilangHeaders.length).setValues(kilangRows);
  dash.getRange(sec4Row + 2, 3, kilangRows.length, 2).setNumberFormat('#,##0.00');

  /* ──────────────────────────────────────────────────────────
     SECTION 5: DAILY TOTALS (last 10 days)
  ────────────────────────────────────────────────────────── */
  const sec5Row = sec4Row + kilangRows.length + 5;
  writeSectionHeader(dash, sec5Row, 'A', 'PERBELANJAAN HARIAN (10 HARI TERKINI)');

  const dailyHeaders = ['Tarikh', 'Bil. Trip', 'Jumlah Perbelanjaan'];
  dash.getRange(sec5Row + 1, 1, 1, dailyHeaders.length).setValues([dailyHeaders])
    .setBackground('#e8f5e9').setFontWeight('bold');

  // Formulas for the last 10 days relative to today
  for (let i = 0; i < 10; i++) {
    const rowNum = sec5Row + 2 + i;
    const dateFormula = `=TODAY()-${i}`;
    dash.getRange(rowNum, 1).setFormula(dateFormula).setNumberFormat('dd/mm/yyyy');
    dash.getRange(rowNum, 2).setFormula(
      `=COUNTIF(Expenses!B:B,A${rowNum})`
    );
    dash.getRange(rowNum, 3).setFormula(
      `=SUMIF(Expenses!B:B,A${rowNum},Expenses!O:O)`
    ).setNumberFormat('#,##0.00');
  }

  /* ──────────────────────────────────────────────────────────
     COLUMN WIDTHS FOR DASHBOARD
  ────────────────────────────────────────────────────────── */
  dash.setColumnWidth(1, 200);
  dash.setColumnWidth(2, 100);
  dash.setColumnWidth(3, 160);
  dash.setColumnWidth(4, 140);
  dash.setColumnWidth(5, 140);

  Logger.log('[CashTrack] Dashboard sheet created successfully.');
  SpreadsheetApp.flush();
}

/**
 * Helper: write a styled section header.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} row
 * @param {string} col
 * @param {string} title
 */
function writeSectionHeader(sheet, row, col, title) {
  const cell = sheet.getRange(col + row);
  cell.setValue(title);
  cell.setBackground('#0f4c3a')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(11);
  // Merge across 5 columns for section headers
  sheet.getRange(row, 1, 1, 5).merge();
}

/* ─────────────────────────────────────────────────────────────
   RESPONSE BUILDER
───────────────────────────────────────────────────────────── */

/**
 * Build a JSON ContentService response with CORS headers.
 * @param {object} data
 * @param {number} [statusCode]  (informational only — Apps Script doesn't set HTTP status)
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function buildJsonResponse(data, statusCode) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  // Note: Apps Script Web Apps don't support custom HTTP status codes.
  // Errors are communicated through the JSON body (status: 'error').
  return output;
}
