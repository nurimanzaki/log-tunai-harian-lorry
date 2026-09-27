# 🌾 CashTrack — Driver Cash Expense Tracker

> A mobile-first web app for logistics/agriculture businesses to track driver cash expenses digitally — replacing messy WhatsApp messages with a clean, structured form that writes directly to Google Sheets.

---

## 📁 Project Structure

```
cashtrack/
├── index.html              # Main form UI
├── styles.css              # All styling (mobile-first)
├── app.js                  # Frontend logic, validation, API calls
├── google-apps-script.gs   # Google Apps Script backend (copy to GAS editor)
└── README.md               # This file
```

---

## ⚙️ Setup Guide (Step-by-Step)

### STEP 1 — Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a **new blank spreadsheet**.
2. Name it something like `CashTrack Expenses`.
3. From the URL bar, copy the **Spreadsheet ID** — it's the long string between `/d/` and `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_ID/edit
   ```
4. Keep this tab open.

---

### STEP 2 — Deploy the Google Apps Script backend

1. In your Google Sheet, click **Extensions → Apps Script**.
2. A new script editor opens. **Delete all existing code** in `Code.gs`.
3. **Copy and paste the entire contents of `google-apps-script.gs`** into the editor.
4. Update the two configuration values near the top:
   ```javascript
   const SPREADSHEET_ID = 'YOUR_GOOGLE_SPREADSHEET_ID_HERE'; // from Step 1
   const EXPECTED_TOKEN = 'your-shared-secret-token-here';   // make this unique!
   ```
   > ⚠️ **Token tip:** Make it something hard to guess, like `cashtrack-2024-xK9mP`. You'll copy this same token into `app.js` in Step 4.

5. **Save** the project (Ctrl+S or File → Save). Name the project `CashTrack`.

6. **Run the sheet setup function:**
   - In the function dropdown (top toolbar), select `setupSheet`
   - Click the **▶ Run** button
   - Accept permissions when prompted (this allows the script to edit your Sheet)
   - You should see `[CashTrack] Sheet setup complete.` in the Execution log

7. **Run the dashboard setup function:**
   - Select `setupDashboard` from the dropdown
   - Click **▶ Run**
   - This creates a second `Dashboard` sheet with auto-formula summaries

8. **Deploy as a Web App:**
   - Click **Deploy → New deployment**
   - Click the ⚙️ gear icon next to "Type" → select **Web app**
   - Fill in:
     - Description: `CashTrack v1`
     - Execute as: **Me** (your Google account)
     - Who has access: **Anyone** *(required so drivers can submit)*
   - Click **Deploy**
   - **Copy the Web App URL** — it looks like:
     ```
     https://script.google.com/macros/s/AKfycb.../exec
     ```
   - Keep this URL — you'll need it in Step 4.

> ⚠️ **Important:** Every time you edit the Apps Script code and want changes to take effect, you must create a **New deployment** (not just save). The URL changes with each deployment — update `app.js` accordingly.

---

### STEP 3 — Configure the Frontend

Open **`app.js`** and update the `CONFIG` object at the top:

```javascript
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec', // ← Paste URL from Step 2
  API_TOKEN: 'your-shared-secret-token-here', // ← Must match EXPECTED_TOKEN in Apps Script
  ...
};
```

Save `app.js`.

---

### STEP 4 — Deploy the Frontend

Choose one of these free hosting options:

#### Option A: Netlify (Recommended — easiest)

1. Go to [netlify.com](https://netlify.com) and sign up free.
2. Drag and drop the **entire `cashtrack/` folder** onto the Netlify dashboard.
3. Netlify gives you a URL like `https://cashtrack-abc123.netlify.app`.
4. Share this link with your drivers.

**Or via Netlify CLI:**
```bash
npm install -g netlify-cli
netlify deploy --dir ./cashtrack --prod
```

#### Option B: GitHub Pages

1. Create a new GitHub repository (can be private).
2. Upload `index.html`, `styles.css`, and `app.js` to the repo root.
3. Go to **Settings → Pages → Source → Deploy from branch → main → / (root)**
4. Your URL will be `https://yourusername.github.io/reponame/`

#### Option C: Vercel

1. Go to [vercel.com](https://vercel.com).
2. Click **Add New → Project → import your GitHub repo** (or drag & drop).
3. No build config needed — it deploys static files automatically.
4. Share the generated URL with drivers.

---

### STEP 5 — Test the Setup

#### A. Test the Apps Script backend (health check)
Open this URL in your browser (replace with your deployment URL):
```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```
You should see:
```json
{"status":"ok","message":"CashTrack API is running.","version":"1.0.0","time":"..."}
```

#### B. Test form submission
1. Open the frontend URL in a mobile browser.
2. Fill in all fields:
   - Pilih **Nama Pemandu** → Ali
   - **Tarikh** → today (auto-filled)
   - **Kilang** → CP
   - **Destinasi** → Ladang Test
   - **Opening Cash** → 200
   - **Upah Naik** → 50
   - **Makan** → 15
3. Check that **Available Cash** = 200 and **Total Expenses** = 65, **Closing Balance** = 135.
4. Click **Hantar Perbelanjaan**.
5. Success overlay should appear.
6. Open your Google Sheet — a new row should appear in the `Expenses` tab.

#### C. Test validation
- Try submitting with empty **Destinasi** → error should appear.
- Enter **Lain-lain** = 20 without a reason → error should appear.
- Enter expenses > Opening Cash → overspend warning and block.

---

## 📊 Google Sheet Structure

The `Expenses` sheet has these 16 columns:

| Col | Field               | Type    | Notes                        |
|-----|---------------------|---------|------------------------------|
| A   | Timestamp           | Text    | ISO 8601 datetime            |
| B   | Date                | Date    | Trip date (YYYY-MM-DD)       |
| C   | Driver              | Text    | Driver name from dropdown    |
| D   | Kilang              | Text    | CP / PWF / Others            |
| E   | Destinasi           | Text    | Destination farm/place       |
| F   | Opening Cash        | Number  | Cash at start of trip        |
| G   | Topup Received      | Number  | Additional cash received     |
| H   | Available Cash      | Number  | F + G                        |
| I   | Upah Naik           | Number  | Upah naik dedak              |
| J   | Upah Turun          | Number  | Upah turun dedak             |
| K   | Air                 | Number  | Water expense                |
| L   | Makan               | Number  | Food expense                 |
| M   | Lain-lain           | Number  | Other expenses               |
| N   | Lain-lain Reason    | Text    | Reason (if M > 0)            |
| O   | Total Expenses      | Number  | Sum of I:M                   |
| P   | Closing Balance     | Number  | H − O                        |

---

## 📈 Dashboard Sheet Formulas

The `Dashboard` sheet (auto-created by `setupDashboard()`) includes:

| Section                         | Formulas Used                         |
|---------------------------------|---------------------------------------|
| Overall totals                  | `SUM()` per column                    |
| This month's spending           | `SUMPRODUCT()` with `MONTH()`/`YEAR()`|
| Spending by driver (all 5)      | `SUMIF()` + `COUNTIF()` + average     |
| Spending by kilang (CP/PWF/etc) | `SUMIF()` + `COUNTIF()` + average     |
| Daily totals (last 10 days)     | `SUMIF()` + `COUNTIF()` per date      |

Refresh timestamp auto-updates with `=NOW()`.

---

## 🔒 Security Notes

| Layer         | Mechanism                                              |
|---------------|--------------------------------------------------------|
| Frontend      | Input validation, type checks, sanitization, no-negative |
| Transport     | HTTPS (enforced by Netlify/Vercel/GitHub Pages + GAS)  |
| API Token     | Shared secret in payload; checked server-side          |
| Backend       | Whitelist validation for driver names and kilang       |
| Backend       | Math verification (totals recalculated server-side)    |
| Backend       | String sanitization (HTML tag stripping, length caps)  |

> 🔐 **Token rotation:** If you suspect the token is compromised, update `EXPECTED_TOKEN` in Apps Script (redeploy) and `CONFIG.API_TOKEN` in `app.js` (redeploy frontend).

---

## 📱 Mobile Features

- **Mobile-first layout** — optimized for 360px+ screens
- **Sticky submit button** — always visible at bottom
- **LocalStorage draft** — form auto-saves every 800ms; restores on revisit (expires after 24h)
- **Duplicate submit prevention** — button locks while request is in flight
- **Toast notifications** — success, error, and warning messages
- **Success overlay** — shows a summary of what was submitted
- **Auto date** — defaults to today, editable

---

## 🛠️ Customisation Guide

### Add a new driver
1. In `index.html`, add an `<option>` inside `#driver-name`:
   ```html
   <option value="Salleh">Salleh</option>
   ```
2. In `google-apps-script.gs`, add to `ALLOWED_DRIVERS`:
   ```javascript
   const ALLOWED_DRIVERS = ['Ali', 'Abu', 'Mat', 'Din', 'Rahman', 'Salleh'];
   ```
3. Redeploy the Apps Script (new deployment).

### Add a new kilang
1. In `index.html`, add an `<option>` inside `#kilang`.
2. In `google-apps-script.gs`, add to `ALLOWED_KILANG`.
3. Redeploy.

### Add a new expense category
1. In `index.html`, add a new `<div class="field-group">` with an `<input class="expense-input">`.
2. In `app.js → buildPayload()`, add the new field.
3. In `app.js → recalculate()`, include it in the sum.
4. In `google-apps-script.gs`:
   - Add to `COLUMNS` array
   - Add to `writeToSheet()` row array
   - Add to `validatePayload()` numeric fields list
   - Add to `sanitizePayload()`

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| Form submits but no data in Sheet | Check that `SPREADSHEET_ID` is correct in `.gs`; check execution logs in Apps Script editor |
| "Unauthorized" error in GAS logs | Token in `app.js` doesn't match `EXPECTED_TOKEN` in `.gs` |
| Sheet not found error | Run `setupSheet()` function manually in Apps Script editor |
| CORS error in browser console | Ensure the Web App is deployed with "Anyone" access |
| Draft not saving | Some browsers block localStorage in private/incognito mode — expected behaviour |
| Form shows wrong date | Verify device date is correct; the app uses `new Date()` |
| GAS deployment URL stops working | Apps Script requires a **new deployment** for code changes — old URL still works unless you archived it |

---

## 📦 Tech Stack

| Layer        | Technology              |
|---|---|
| Frontend     | HTML5 + CSS3 + Vanilla JS (ES2020) |
| Fonts        | Google Fonts: Syne + DM Sans |
| Backend      | Google Apps Script (V8 runtime) |
| Database     | Google Sheets |
| Hosting      | Netlify / GitHub Pages / Vercel |
| Storage      | Browser localStorage (drafts only) |

No npm, no build step, no frameworks. Works everywhere.

---

## 📄 Licence

MIT — free for personal and commercial use. Attribution appreciated.

---

*Built for small logistics & agriculture businesses. Replace the WhatsApp chaos with structured data. 🌾*
