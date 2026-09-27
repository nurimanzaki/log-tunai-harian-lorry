/**
 * CashTrack — app.js
 * =============================================================
 * Driver Cash Expense Tracking System
 * Pure vanilla JS — no frameworks, no dependencies
 *
 * Features:
 *   - Live calculated fields (available cash, totals, closing balance)
 *   - Full frontend validation
 *   - LocalStorage draft saving & restoration
 *   - Duplicate submit prevention
 *   - POST to Google Apps Script endpoint
 *   - Toast notification system
 *   - Success overlay with summary
 *   - Network error handling
 *   - Loading state management
 * =============================================================
 */

'use strict';

/* ─────────────────────────────────────────────────────────────
   CONFIG
   ─────────────────────────────────────────────────────────────
   Replace APPS_SCRIPT_URL with your deployed Google Apps Script
   web app URL. Replace API_TOKEN with a shared secret you set
   in the Apps Script code (must match EXPECTED_TOKEN there).
───────────────────────────────────────────────────────────── */
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw22su5rOlJdnEgtdANLilxjm79SNs7oNdo80XM1mlSLplcb8BFDShasZlBhaBjazkQ5w/exec',
  API_TOKEN: 'NurHananSafiya04',   // must match Apps Script
  DRAFT_STORAGE_KEY: 'cashtrack_draft_v1',
  SUBMISSION_LOCK_KEY: 'cashtrack_submitting',
  TOAST_DURATION_MS: 4000,
  DRAFT_SAVE_DEBOUNCE_MS: 800,
};

/* ─────────────────────────────────────────────────────────────
   DOM REFERENCES
───────────────────────────────────────────────────────────── */
const DOM = {
  // Trip fields
  driverName:      () => document.getElementById('driver-name'),
  tripDate:        () => document.getElementById('trip-date'),
  kilang:          () => document.getElementById('kilang'),
  lori:            () => document.getElementById('lori'),

  // Cash fields
  openingCash:     () => document.getElementById('opening-cash'),
  topup:           () => document.getElementById('topup'),
  availableCashHidden: () => document.getElementById('available-cash'),
  availableCashValue:  () => document.getElementById('available-cash-value'),

  // Expense fields
  upahNaik:        () => document.getElementById('upah-naik'),
  upahTurun:       () => document.getElementById('upah-turun'),
  upahForklift:    () => document.getElementById('upah-forklift'),
  air:             () => document.getElementById('air'),
  makan:           () => document.getElementById('makan'),
  lainLain:        () => document.getElementById('lain-lain'),
  lainLainReason:  () => document.getElementById('lain-lain-reason'),
  lainLainGroup:   () => document.getElementById('lain-lain-reason-group'),

  // Calculated hidden
  totalExpenses:   () => document.getElementById('total-expenses'),
  closingBalance:  () => document.getElementById('closing-balance'),

  // Summary display
  summaryAvailable:   () => document.getElementById('summary-available'),
  summaryTotalExp:    () => document.getElementById('summary-total-exp'),
  summaryCLosing:     () => document.getElementById('summary-closing'),
  overspendWarning:   () => document.getElementById('overspend-warning'),

  // UI elements
  submitBtn:       () => document.getElementById('submit-btn'),
  btnText:         () => document.querySelector('.btn-text'),
  btnSpinner:      () => document.querySelector('.btn-spinner'),
  btnIcon:         () => document.querySelector('.btn-icon'),
  draftBadge:      () => document.getElementById('draft-badge'),
  toastContainer:  () => document.getElementById('toast-container'),
  successOverlay:  () => document.getElementById('success-overlay'),
  newEntryBtn:     () => document.getElementById('new-entry-btn'),
  successDetail:   () => document.getElementById('success-detail'),
};

/* ─────────────────────────────────────────────────────────────
   STATE
───────────────────────────────────────────────────────────── */
let state = {
  isSubmitting: false,
  draftSaveTimer: null,
};

/* ─────────────────────────────────────────────────────────────
   INITIALISATION
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setDefaultDate();
  restoreDraft();
  recalculate();
  bindEvents();
});

/**
 * Set the date field to today's date in YYYY-MM-DD format.
 */
function setDefaultDate() {
  const today = new Date();
  const yyyy  = today.getFullYear();
  const mm    = String(today.getMonth() + 1).padStart(2, '0');
  const dd    = String(today.getDate()).padStart(2, '0');
  DOM.tripDate().value = `${yyyy}-${mm}-${dd}`;
}

/* ─────────────────────────────────────────────────────────────
   EVENT BINDING
───────────────────────────────────────────────────────────── */
function bindEvents() {

  // Live recalculation: cash fields
  DOM.openingCash().addEventListener('input', () => { recalculate(); scheduleDraftSave(); });
  DOM.topup().addEventListener('input',        () => { recalculate(); scheduleDraftSave(); });

  // Live recalculation: expense fields
  const expenseInputs = document.querySelectorAll('.expense-input');
  expenseInputs.forEach(input => {
    input.addEventListener('input', () => { recalculate(); scheduleDraftSave(); });
  });

  // Show/hide lain-lain reason field
  DOM.lainLain().addEventListener('input', handleLainLainChange);

  // Draft saving for text/select fields
  const draftFields = [
    DOM.driverName(), DOM.tripDate(), DOM.kilang(),
    DOM.lori(), DOM.lainLainReason()
  ];
  draftFields.forEach(el => {
    el.addEventListener('change', scheduleDraftSave);
    el.addEventListener('input',  scheduleDraftSave);
  });

  // Remove error state on focus
  const allInputs = document.querySelectorAll('input, select');
  allInputs.forEach(el => {
    el.addEventListener('focus', () => clearFieldError(el));
  });

  // Submit button
  DOM.submitBtn().addEventListener('click', handleSubmit);

  // New entry button (inside success overlay)
  DOM.newEntryBtn().addEventListener('click', resetForm);
}

/* ─────────────────────────────────────────────────────────────
   CALCULATIONS
───────────────────────────────────────────────────────────── */

/**
 * Recalculate available cash, total expenses, and closing balance.
 * Updates display and hidden inputs for form submission.
 */
function recalculate() {
  const opening  = parseFloat(DOM.openingCash().value)  || 0;
  const topup    = parseFloat(DOM.topup().value)         || 0;
  const available = opening + topup;

  // Update available cash display
  DOM.availableCashValue().textContent = formatRM(available);
  DOM.availableCashHidden().value = available.toFixed(2);

  // Sum all expense fields
  const upahNaik     = parseFloat(DOM.upahNaik().value)   || 0;
  const upahTurun    = parseFloat(DOM.upahTurun().value)  || 0;
  const upahForklift = parseFloat(DOM.upahForklift().value)  || 0;
  const air          = parseFloat(DOM.air().value)        || 0;
  const makan        = parseFloat(DOM.makan().value)      || 0;
  const lainLain     = parseFloat(DOM.lainLain().value)   || 0;

  const totalExp   = upahNaik + upahTurun + upahForklift + air + makan + lainLain;
  const closingBal = available - totalExp;

  // Update hidden inputs
  DOM.totalExpenses().value  = totalExp.toFixed(2);
  DOM.closingBalance().value = closingBal.toFixed(2);

  // Update summary display
  DOM.summaryAvailable().textContent = 'RM ' + formatRM(available);
  DOM.summaryTotalExp().textContent  = 'RM ' + formatRM(totalExp);
  DOM.summaryCLosing().textContent   = 'RM ' + formatRM(closingBal);

// Overspend allowed (payables)
DOM.overspendWarning().classList.add('hidden');

if (closingBal < 0) {
  DOM.summaryCLosing().style.color = '#fca5a5';
} else {
  DOM.summaryCLosing().style.color = '';
}
}

/**
 * Format a number to 2 decimal places with commas.
 * @param {number} num
 * @returns {string}
 */
function formatRM(num) {
  return num.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─────────────────────────────────────────────────────────────
   LAIN-LAIN CONDITIONAL FIELD
───────────────────────────────────────────────────────────── */

/**
 * Show or hide the lain-lain reason field depending on value.
 */
function handleLainLainChange() {
  recalculate();
  scheduleDraftSave();

  const val = parseFloat(DOM.lainLain().value) || 0;
  if (val > 0) {
    DOM.lainLainGroup().style.display = '';
    DOM.lainLainReason().setAttribute('required', 'true');
    DOM.lainLainReason().setAttribute('aria-required', 'true');
    // animate in
    DOM.lainLainGroup().style.animation = 'card-enter 0.25s ease both';
  } else {
    DOM.lainLainGroup().style.display = 'none';
    DOM.lainLainReason().removeAttribute('required');
    DOM.lainLainReason().removeAttribute('aria-required');
    DOM.lainLainReason().value = '';
    clearFieldError(DOM.lainLainReason());
  }
}

/* ─────────────────────────────────────────────────────────────
   VALIDATION
───────────────────────────────────────────────────────────── */

/**
 * Run all validations. Returns true if form is valid.
 * Marks invalid fields with error messages.
 * @returns {boolean}
 */
function validateForm() {
  let isValid = true;

  // Helper: mark field invalid
  const markError = (fieldEl, errId, msg) => {
    fieldEl.classList.add('is-invalid');
    fieldEl.classList.remove('is-valid');
    const errEl = document.getElementById(errId);
    if (errEl) errEl.textContent = msg;
    isValid = false;
  };

  // Helper: mark field valid
  const markValid = (fieldEl, errId) => {
    fieldEl.classList.remove('is-invalid');
    fieldEl.classList.add('is-valid');
    const errEl = document.getElementById(errId);
    if (errEl) errEl.textContent = '';
  };

  /* ── Required text/select fields ── */
  const requiredFields = [
    { el: DOM.driverName(), id: 'err-driver',    msg: 'Sila pilih nama pemandu.' },
    { el: DOM.tripDate(),   id: 'err-date',      msg: 'Sila masukkan tarikh.' },
    { el: DOM.kilang(),     id: 'err-kilang',    msg: 'Sila pilih kilang.' },
    { el: DOM.lori(),  id: 'err-lori', msg: 'Sila pilih lori.' },
  ];

  requiredFields.forEach(({ el, id, msg }) => {
    if (!el.value.trim()) {
      markError(el, id, msg);
    } else {
      markValid(el, id);
    }
  });

  /* ── Opening cash: required, must be >= 0 ── */
  const openingRaw = DOM.openingCash().value;
  const opening    = parseFloat(openingRaw);
  if (openingRaw === '' || openingRaw === null || isNaN(opening)) {
    markError(DOM.openingCash(), 'err-opening', 'Sila masukkan wang awal (boleh 0).');
  } else if (opening < 0) {
    markError(DOM.openingCash(), 'err-opening', 'Wang awal tidak boleh negatif.');
  } else {
    markValid(DOM.openingCash(), 'err-opening');
  }

  /* ── Topup: must be >= 0 if filled ── */
  const topupRaw = DOM.topup().value;
  const topup    = parseFloat(topupRaw) || 0;
  if (topup < 0) {
    markError(DOM.topup(), 'err-topup', 'Topup tidak boleh negatif.');
  } else {
    markValid(DOM.topup(), 'err-topup');
  }

  /* ── Expense fields: must be >= 0 ── */
  const expenseMap = [
    { el: DOM.upahNaik(),  id: 'err-upah-naik',  name: 'Upah Naik' },
    { el: DOM.upahTurun(), id: 'err-upah-turun',  name: 'Upah Turun' },
    { el: DOM.upahForklift(), id: 'err-upah-forklift',  name: 'Upah Forklift' },
    { el: DOM.air(),       id: 'err-air',          name: 'Air' },
    { el: DOM.makan(),     id: 'err-makan',        name: 'Makan' },
    { el: DOM.lainLain(),  id: 'err-lain-lain',   name: 'Lain-lain' },
  ];

  expenseMap.forEach(({ el, id, name }) => {
    const val = parseFloat(el.value) || 0;
    if (val < 0) {
      markError(el, id, `${name} tidak boleh negatif.`);
    } else {
      markValid(el, id);
    }
  });

  /* ── Lain-lain reason: required when lain-lain > 0 ── */
  const lainLainVal = parseFloat(DOM.lainLain().value) || 0;
  if (lainLainVal > 0) {
    if (!DOM.lainLainReason().value.trim()) {
      markError(DOM.lainLainReason(), 'err-lain-lain-reason', 'Sila masukkan sebab perbelanjaan lain-lain.');
    } else {
      markValid(DOM.lainLainReason(), 'err-lain-lain-reason');
    }
  }


  /* ── Scroll to first invalid field ── */
  if (!isValid) {
    const firstInvalid = document.querySelector('.is-invalid');
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => firstInvalid.focus(), 400);
    }
  }

  return isValid;
}

/**
 * Clear a single field's error state.
 * @param {HTMLElement} el
 */
function clearFieldError(el) {
  if (!el) return;
  el.classList.remove('is-invalid');
}

/* ─────────────────────────────────────────────────────────────
   FORM SUBMISSION
───────────────────────────────────────────────────────────── */

/**
 * Handle form submit button click.
 * Validates, packages data, sends to Apps Script.
 */
async function handleSubmit() {
  // Prevent duplicate submissions
  if (state.isSubmitting) {
    showToast('Sila tunggu, penghantaran sedang diproses...', 'warning');
    return;
  }

  // Validate
  if (!validateForm()) {
    showToast('Sila betulkan ralat sebelum menghantar.', 'error');
    return;
  }

  // Lock submission
  state.isSubmitting = true;
  setLoadingState(true);

  // Build payload
  const payload = buildPayload();

  try {
    const response = await sendToAppsScript(payload);

    if (response.status === 'success') {
      // Clear draft on success
      clearDraft();
showSuccessOverlay(payload);

setTimeout(() => {
  openWhatsAppSummary(payload);
}, 5000);
    } else {
      throw new Error(response.message || 'Ralat tidak diketahui dari pelayan.');
    }

  } catch (err) {
    console.error('[CashTrack] Submission error:', err);

    // Handle specific error types
    if (!navigator.onLine) {
      showToast('Tiada sambungan internet. Data draf disimpan tempatan.', 'warning');
    } else if (err.name === 'TypeError' || err.message.includes('fetch')) {
      showToast('Tidak dapat menghubungi pelayan. Cuba semula.', 'error');
    } else {
      showToast(`Ralat: ${err.message}`, 'error');
    }
  } finally {
    state.isSubmitting = false;
    setLoadingState(false);
  }
}

/**
 * Package all form data into a clean JSON object.
 * @returns {object}
 */
function buildPayload() {
  return {
    // Meta
    apiToken:        CONFIG.API_TOKEN,
    timestamp:       new Date().toISOString(),

    // Trip info
    driverName:      DOM.driverName().value.trim(),
    date:            DOM.tripDate().value,
    kilang:          DOM.kilang().value.trim(),
    lori:            DOM.lori().value,

    // Cash summary
    openingCash:     parseFloat(DOM.openingCash().value)  || 0,
    topupReceived:   parseFloat(DOM.topup().value)         || 0,
    availableCash:   parseFloat(DOM.availableCashHidden().value) || 0,

    // Expenses
    upahNaik:        parseFloat(DOM.upahNaik().value)  || 0,
    upahTurun:       parseFloat(DOM.upahTurun().value)  || 0,
    upahForklift:    parseFloat(DOM.upahForklift().value) || 0,
    air:             parseFloat(DOM.air().value)        || 0,
    makan:           parseFloat(DOM.makan().value)      || 0,
    lainLain:        parseFloat(DOM.lainLain().value)   || 0,
    lainLainReason:  sanitizeText(DOM.lainLainReason().value),

    // Calculated totals
    totalExpenses:   parseFloat(DOM.totalExpenses().value)  || 0,
    closingBalance:  parseFloat(DOM.closingBalance().value) || 0,
  };
}

/**
 * Send payload to Google Apps Script via POST.
 * @param {object} payload
 * @returns {Promise<object>} parsed JSON response
 */
async function sendToAppsScript(payload) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      mode:   'no-cors',    // Google Apps Script requires no-cors for cross-origin POST
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // NOTE: With mode:'no-cors', response is "opaque" — we can't read it.
    // We treat any non-aborted fetch as success and rely on the sheet being written.
    // If you use a proxy or redirect approach you can remove no-cors and read the response.
    return { status: 'success', message: 'Data dihantar.' };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Masa tamat. Sambungan terlalu lambat atau URL tidak betul.');
    }
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────────
   LOADING STATE
───────────────────────────────────────────────────────────── */

/**
 * Toggle button loading state.
 * @param {boolean} loading
 */
function setLoadingState(loading) {
  const btn     = DOM.submitBtn();
  const text    = DOM.btnText();
  const spinner = DOM.btnSpinner();
  const icon    = DOM.btnIcon();

  if (loading) {
    btn.disabled = true;
    text.textContent = 'Menghantar...';
    spinner.classList.remove('hidden');
    icon.classList.add('hidden');
  } else {
    btn.disabled = false;
    text.textContent = 'Hantar Perbelanjaan';
    spinner.classList.add('hidden');
    icon.classList.remove('hidden');
  }
}

/* ─────────────────────────────────────────────────────────────
   SUCCESS OVERLAY
───────────────────────────────────────────────────────────── */

/**
 * Show the success overlay with a summary of what was submitted.
 * @param {object} payload
 */
function showSuccessOverlay(payload) {
  const detail = DOM.successDetail();

  const rows = [
    { key: 'Pemandu',         val: payload.driverName },
    { key: 'Tarikh',          val: formatDisplayDate(payload.date) },
    { key: 'Kilang',          val: payload.kilang },
    { key: 'Lori',            val: payload.lori },
    { key: 'Wang Tersedia',   val: 'RM ' + formatRM(payload.availableCash) },
    { key: 'Jumlah Perbelanjaan', val: 'RM ' + formatRM(payload.totalExpenses) },
    { key: 'Baki Akhir',      val: 'RM ' + formatRM(payload.closingBalance) },
  ];

  detail.innerHTML = rows.map(r => `
    <div class="success-detail-row">
      <span class="success-detail-key">${escapeHtml(r.key)}</span>
      <span class="success-detail-val">${escapeHtml(String(r.val))}</span>
    </div>
  `).join('');

  DOM.successOverlay().classList.remove('hidden');
  DOM.newEntryBtn().focus();
}

/**
 * Format a YYYY-MM-DD date to a more readable form.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDisplayDate(isoDate) {
  if (!isoDate) return '-';
  const [yyyy, mm, dd] = isoDate.split('-');
  const months = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];
  return `${dd} ${months[parseInt(mm, 10) - 1]} ${yyyy}`;
}

/* ─────────────────────────────────────────────────────────────
   OPEN WHATSAPP
───────────────────────────────────────────────────────────── */

function openWhatsAppSummary(payload) {
  const phone = '60164554844';

  const msg = `
✅ *PERBELANJAAN DRIVER*

Tarikh: ${formatDisplayDate(payload.date)}
Driver: ${payload.driverName}
Lori: ${payload.lori}
Kilang: ${payload.kilang}

Opening Cash: RM ${formatRM(payload.openingCash)}
Topup: RM ${formatRM(payload.topupReceived)}
Available Cash: RM ${formatRM(payload.availableCash)}

Upah Naik: RM ${formatRM(payload.upahNaik)}
Upah Turun: RM ${formatRM(payload.upahTurun)}
Upah Forklift: RM ${formatRM(payload.upahForklift)}
Air: RM ${formatRM(payload.air)}
Makan: RM ${formatRM(payload.makan)}
Lain-lain: RM ${formatRM(payload.lainLain)}
Sebab: ${payload.lainLainReason || '-'}

Jumlah Perbelanjaan: RM ${formatRM(payload.totalExpenses)}
Baki Cash: RM ${formatRM(payload.closingBalance)}
`;

  const encoded = encodeURIComponent(msg);
  const waUrl = `https://wa.me/${phone}?text=${encoded}`;

  window.location.href = waUrl;
}

/* ─────────────────────────────────────────────────────────────
   FORM RESET
───────────────────────────────────────────────────────────── */

/**
 * Reset the form to initial state and hide the success overlay.
 */
function resetForm() {
  // Hide overlay
  DOM.successOverlay().classList.add('hidden');

  // Reset all inputs
  const allInputs = document.querySelectorAll('input:not([type="hidden"]), select');
  allInputs.forEach(el => {
    if (el.type === 'date') {
      // Re-default date to today
    } else if (el.type === 'number') {
      el.value = '0';
    } else {
      el.value = '';
    }
    el.classList.remove('is-invalid', 'is-valid');
  });
	
  // Reset selects to placeholder
  DOM.driverName().selectedIndex = 0;
  DOM.kilang().selectedIndex     = 0;
  DOM.lori().selectedIndex       = 0;

  // Re-set date to today
  setDefaultDate();

  // Hide lain-lain reason
  DOM.lainLainGroup().style.display = 'none';
  DOM.lainLainReason().removeAttribute('required');

  // Clear all error messages
  document.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });

  // Recalculate
  recalculate();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
  DOM.driverName().focus();
}

/* ─────────────────────────────────────────────────────────────
   LOCAL STORAGE DRAFT
───────────────────────────────────────────────────────────── */

/**
 * Schedule a draft save after user stops typing.
 */
function scheduleDraftSave() {
  clearTimeout(state.draftSaveTimer);
  state.draftSaveTimer = setTimeout(saveDraft, CONFIG.DRAFT_SAVE_DEBOUNCE_MS);
}

/**
 * Save current form values to localStorage as a draft.
 */
function saveDraft() {
  try {
    const draft = {
      savedAt:        new Date().toISOString(),
      driverName:     DOM.driverName().value,
      tripDate:       DOM.tripDate().value,
      kilang:         DOM.kilang().value,
      lori:           DOM.lori().value,
      openingCash:    DOM.openingCash().value,
      topup:          DOM.topup().value,
      upahNaik:       DOM.upahNaik().value,
      upahTurun:      DOM.upahTurun().value,
      upahForklift:   DOM.upahForklift().value,
      air:            DOM.air().value,
      makan:          DOM.makan().value,
      lainLain:       DOM.lainLain().value,
      lainLainReason: DOM.lainLainReason().value,
    };

    // Only save if there's something meaningful
    const hasMeaningfulData = draft.driverName || draft.kilang || draft.lori ||
      parseFloat(draft.openingCash) > 0;

    if (hasMeaningfulData) {
      localStorage.setItem(CONFIG.DRAFT_STORAGE_KEY, JSON.stringify(draft));
      showDraftBadge(true);
    }
  } catch (e) {
    // localStorage may be unavailable in some contexts
    console.warn('[CashTrack] Draft save failed:', e.message);
  }
}

/**
 * Restore draft data from localStorage if available.
 */
function restoreDraft() {
  try {
    const raw = localStorage.getItem(CONFIG.DRAFT_STORAGE_KEY);
    if (!raw) return;

    const draft = JSON.parse(raw);
    if (!draft || !draft.savedAt) return;

    // Only restore drafts less than 24 hours old
    const savedAge = Date.now() - new Date(draft.savedAt).getTime();
    if (savedAge > 24 * 60 * 60 * 1000) {
      clearDraft();
      return;
    }

    // Apply values
    if (draft.driverName)     DOM.driverName().value     = draft.driverName;
    if (draft.tripDate)       DOM.tripDate().value        = draft.tripDate;
    if (draft.kilang)         DOM.kilang().value          = draft.kilang;
    if (draft.lori)           DOM.lori().value            = draft.lori;
    if (draft.openingCash)    DOM.openingCash().value     = draft.openingCash;
    if (draft.topup)          DOM.topup().value            = draft.topup;
    if (draft.upahNaik)       DOM.upahNaik().value        = draft.upahNaik;
    if (draft.upahTurun)      DOM.upahTurun().value       = draft.upahTurun;
    if (draft.upahForklift)   DOM.upahForklift().value       = draft.upahForklift;
    if (draft.air)            DOM.air().value              = draft.air;
    if (draft.makan)          DOM.makan().value            = draft.makan;
    if (draft.lainLain)       DOM.lainLain().value         = draft.lainLain;
    if (draft.lainLainReason) DOM.lainLainReason().value   = draft.lainLainReason;

    // Trigger conditional field
    handleLainLainChange();

    showDraftBadge(true);
    showToast('Draf tersimpan dipulihkan.', 'info');

  } catch (e) {
    console.warn('[CashTrack] Draft restore failed:', e.message);
  }
}

/**
 * Clear saved draft from localStorage.
 */
function clearDraft() {
  try {
    localStorage.removeItem(CONFIG.DRAFT_STORAGE_KEY);
  } catch (e) { /* ignore */ }
  showDraftBadge(false);
}

/**
 * Show or hide the draft indicator badge.
 * @param {boolean} show
 */
function showDraftBadge(show) {
  const badge = DOM.draftBadge();
  if (!badge) return;
  if (show) {
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

/* ─────────────────────────────────────────────────────────────
   TOAST NOTIFICATION SYSTEM
───────────────────────────────────────────────────────────── */

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} [duration]
 */
function showToast(message, type = 'info', duration = CONFIG.TOAST_DURATION_MS) {
  const container = DOM.toastContainer();
  if (!container) return;

  const icons = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Auto-remove
  const removeToast = () => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  };

  const timerId = setTimeout(removeToast, duration);

  // Click to dismiss early
  toast.addEventListener('click', () => {
    clearTimeout(timerId);
    removeToast();
  });
}

/* ─────────────────────────────────────────────────────────────
   SANITIZATION HELPERS
───────────────────────────────────────────────────────────── */

/**
 * Strip potentially dangerous characters from free-text input.
 * Removes script tags, angle brackets, and excess whitespace.
 * @param {string} str
 * @returns {string}
 */
function sanitizeText(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')          // remove HTML tags
    .replace(/[<>"'`]/g, '')          // remove dangerous chars
    .replace(/\s+/g, ' ')             // normalize whitespace
    .trim()
    .substring(0, 300);               // cap at 300 chars
}

/**
 * Escape HTML entities for safe DOM insertion.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}
