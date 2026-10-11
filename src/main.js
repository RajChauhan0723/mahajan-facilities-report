import './style.css';
import { 
  saveDraft, 
  loadDraft, 
  clearDraft, 
  getLastActiveDate,
  saveReportToHistory, 
  getReportHistory, 
  deleteReportFromHistory, 
  clearAllReportHistory 
} from './db.js';
import { processImageFile, formatBytes } from './imageProcessor.js';
import { generateDailyReportPDF, formatDisplayDate } from './pdfGenerator.js';

// Configuration & 12 Building Floor Definitions (Ground to 11th Floor)
const FLOORS_CONFIG = [
  { id: 'ground', name: 'Ground Floor' },
  { id: '1st', name: '1st Floor' },
  { id: '2nd', name: '2nd Floor' },
  { id: '3rd', name: '3rd Floor' },
  { id: '4th', name: '4th Floor' },
  { id: '5th', name: '5th Floor' },
  { id: '6th', name: '6th Floor' },
  { id: '7th', name: '7th Floor' },
  { id: '8th', name: '8th Floor' },
  { id: '9th', name: '9th Floor' },
  { id: '10th', name: '10th Floor' },
  { id: '11th', name: '11th Floor' }
];

const MAX_PHOTOS_PER_SECTION = 20;

/**
 * Reconciles saved draft floors to current 12 building floors (Ground to 11th)
 */
function reconcileFloors(savedFloors) {
  if (!Array.isArray(savedFloors)) return null;
  return FLOORS_CONFIG.map((cfg) => {
    const found = savedFloors.find((f) => f.id === cfg.id);
    return found ? { ...found, name: cfg.name } : { id: cfg.id, name: cfg.name, generalPhotos: [], washroomPhotos: [] };
  });
}

// Application State
const state = {
  reportDate: getTodayYMD(),
  floors: FLOORS_CONFIG.map((f) => ({
    id: f.id,
    name: f.name,
    generalPhotos: [],
    washroomPhotos: []
  })),
  expandedFloors: new Set([FLOORS_CONFIG[0].id]), // Ground floor open by default
  lastGeneratedPdf: null,
  isGenerating: false,
  activeLightboxImg: null,
  reportHistory: [], // Stored past days' reports
  historyFilterDate: '' // Filter for past reports modal
};

// PWA Install State
let deferredInstallPrompt = null;
const isStandaloneApp = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btnInstall = document.getElementById('btn-install-app');
  if (btnInstall) {
    btnInstall.style.display = 'inline-flex';
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showToast('App installed to your phone home screen!', 'success');
  const btnInstall = document.getElementById('btn-install-app');
  if (btnInstall) btnInstall.style.display = 'none';
});

/**
 * Returns today's date in YYYY-MM-DD
 */
function getTodayYMD() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Shows a brief toast notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Recalculates stats from state
 */
function getStats() {
  let totalGeneral = 0;
  let totalWashroom = 0;
  let floorsWithPhotos = 0;

  state.floors.forEach((f) => {
    const gen = f.generalPhotos.length;
    const wash = f.washroomPhotos.length;
    totalGeneral += gen;
    totalWashroom += wash;
    if (gen > 0 || wash > 0) {
      floorsWithPhotos++;
    }
  });

  return {
    totalFloors: state.floors.length,
    floorsWithPhotos,
    totalGeneral,
    totalWashroom,
    grandTotal: totalGeneral + totalWashroom
  };
}

/**
 * Auto-saves current date's state to IndexedDB
 */
async function autoSaveState() {
  try {
    await saveDraft(state.reportDate, state.floors);
    updateAutosaveIndicator();
  } catch (err) {
    console.error('Error auto-saving:', err);
  }
}

function updateAutosaveIndicator() {
  const el = document.getElementById('autosave-text');
  if (el) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.textContent = `Draft for ${formatDisplayDate(state.reportDate)} saved locally (${time})`;
  }
}

function updateHistoryBadge() {
  const badge = document.getElementById('history-badge-count');
  if (badge) {
    badge.textContent = state.reportHistory.length;
  }
}

/**
 * Main Render Application Shell
 */
function renderApp() {
  const app = document.getElementById('app');
  const stats = getStats();
  const displayDate = formatDisplayDate(state.reportDate);

  app.innerHTML = `
    <!-- Top Header Banner -->
    <header class="app-header">
      <div class="container">
        <div class="header-inner">
          <div class="brand-section">
            <img src="/logo.png" alt="Mahajan Facilities" class="brand-logo-img" width="54" height="54" fetchpriority="high" decoding="sync" />
            <div class="brand-titles">
              <h1>Mahajan Facilities</h1>
              <p>Daily Housekeeping Cleaning Report</p>
            </div>
          </div>
          
          <div class="header-actions">
            <!-- Past Reports History Button -->
            <button id="btn-open-history" class="btn-header-gold">
              <span>📜</span> Past Reports (<span id="history-badge-count">${state.reportHistory.length}</span>)
            </button>

            <!-- PWA Mobile App Install Controls -->
            ${
              isStandaloneApp
                ? `<span class="badge-standalone">📱 App Installed</span>`
                : `<button id="btn-install-app" class="btn-install-app">
                    <span>📲</span> Install on Phone
                   </button>`
            }

            <button id="btn-cloud-guide" class="btn-header-outline">
              <span>🌐</span> Access Anywhere
            </button>

            <!-- Date Picker Card -->
            <div class="date-picker-card">
              <label for="report-date-input">Report Date:</label>
              <div class="date-input-wrapper">
                <input 
                  type="date" 
                  id="report-date-input" 
                  class="date-input" 
                  value="${state.reportDate}"
                  max="2099-12-31"
                  required
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="container">
      <!-- KPI Stats Bar -->
      <section class="dashboard-kpis">
        <div class="kpi-grid">
          <div class="kpi-card">
            <span class="kpi-label">Report Date</span>
            <span class="kpi-value" id="kpi-date-val">${displayDate}</span>
            <span class="kpi-sub">Inspection Day</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Total Floors</span>
            <span class="kpi-value">12</span>
            <span class="kpi-sub">Ground to 11th Floor</span>
          </div>

          <div class="kpi-card kpi-accent-blue">
            <span class="kpi-label">General Photos</span>
            <span class="kpi-value" id="kpi-general-val">${stats.totalGeneral}</span>
            <span class="kpi-sub">Max 240 total</span>
          </div>

          <div class="kpi-card kpi-accent-teal">
            <span class="kpi-label">Washroom Photos</span>
            <span class="kpi-value" id="kpi-washroom-val">${stats.totalWashroom}</span>
            <span class="kpi-sub">Max 240 total</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">Total Uploaded</span>
            <span class="kpi-value" id="kpi-total-val">${stats.grandTotal}</span>
            <span class="kpi-sub">Cap: 480 photos</span>
          </div>
        </div>
      </section>

      <!-- Progress Tracking Banner -->
      <section class="progress-container">
        <div class="progress-header">
          <span>Inspection Progress: <strong id="progress-floor-count">${stats.floorsWithPhotos} of 12 Floors Documented</strong></span>
          <span id="progress-percent">${Math.round((stats.floorsWithPhotos / 12) * 100)}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" id="progress-fill-bar" style="width: ${(stats.floorsWithPhotos / 12) * 100}%;"></div>
        </div>
      </section>

      <!-- Autosave Notice & Date Reset Tools -->
      <div class="autosave-bar">
        <div class="autosave-status">
          <div class="status-dot"></div>
          <span id="autosave-text">Draft for ${displayDate} saved locally</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="btn-start-fresh" class="btn-ghost-sm" style="color: var(--navy-800); border-color: var(--gold-500); font-weight: 800;">➕ Start New Sheet</button>
          <button id="btn-clear-all" class="btn-ghost-sm" style="color: var(--danger); font-weight: 700;">Clear This Day</button>
        </div>
      </div>

      <!-- Quick Jump Navigation -->
      <section class="quick-nav-container">
        <div class="quick-nav-header">
          <h2 class="section-heading">Floor Navigation (12 Levels)</h2>
          <div class="nav-actions">
            <button id="btn-expand-all" class="btn-ghost-sm">Expand All</button>
            <button id="btn-collapse-all" class="btn-ghost-sm">Collapse All</button>
          </div>
        </div>
        <div class="floor-pills-scroll" id="floor-pills-container">
          ${renderQuickNavPills()}
        </div>
      </section>

      <!-- Floor Cards List -->
      <section id="floor-cards-container">
        ${renderFloorCards()}
      </section>

      <!-- Field Instructions Card -->
      <section class="guide-card">
        <h3 class="guide-title">📱 Field Instructions for Cleaning Managers</h3>
        <div class="guide-steps">
          <div class="guide-step-item">
            <strong>1. Select Report Date</strong>
            Date change karte hi us din ki alag sheet khulegi. Pichle din ka data mix nahi hoga!
          </div>
          <div class="guide-step-item">
            <strong>2. Snap or Pick Photos</strong>
            Use "Camera" to take live site photos or "Upload Photos" from gallery. Up to 20 photos per section.
          </div>
          <div class="guide-step-item">
            <strong>3. Automatic Draft Safe</strong>
            Har date ka draft alag se phone storage me auto-save hota hai.
          </div>
          <div class="guide-step-item">
            <strong>4. Past Reports History</strong>
            Generate hote hi report "Past Reports" drawer me save ho jati hai, jaha se kabhi bhi purani date ka data khol sakte hain.
          </div>
        </div>
      </section>
    </main>

    <!-- Sticky Bottom Action Bar -->
    <div class="sticky-action-bar">
      <div class="action-bar-inner">
        <div class="action-bar-stats">
          <span class="stat-chip" id="bar-total-chip">📸 ${stats.grandTotal} Photos</span>
          <span class="stat-chip" id="bar-floors-chip">🏢 ${stats.floorsWithPhotos}/12 Floors</span>
        </div>
        <div class="action-bar-buttons">
          <button id="btn-generate-pdf" class="btn-primary-generate" ${stats.grandTotal === 0 ? 'title="Upload at least 1 photo to generate PDF"' : ''}>
            <span>📄</span> Generate Daily PDF
          </button>
          <button id="btn-download-pdf" class="btn-download-pdf" style="display: ${state.lastGeneratedPdf ? 'inline-flex' : 'none'};">
            <span>📥</span> Download PDF
          </button>
        </div>
      </div>
    </div>

    <!-- Past Reports History Modal with Date Filter & Loader -->
    <div id="modal-history" class="modal-overlay">
      <div class="modal-dialog history-modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">📜 Past Cleaning Reports & Date History</h3>
          <button class="modal-close-btn" id="btn-close-history-modal">&times;</button>
        </div>
        <div class="modal-body">
          <!-- Date Filter / Quick Selection Bar -->
          <div class="history-filter-bar" style="background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-sm); padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <label for="history-filter-date" style="font-size: 13px; font-weight: 700; color: var(--navy-800);">📅 Select Date to View:</label>
              <input type="date" id="history-filter-date" class="date-input" value="${state.historyFilterDate || ''}" style="padding: 5px 10px; font-size: 13px;" />
            </div>
            <button id="btn-history-show-all" class="btn-ghost-sm" style="font-size: 12px; padding: 5px 12px;">Show All Dates</button>
          </div>

          <div id="history-list-container" class="history-list">
            ${renderHistoryList(state.historyFilterDate)}
          </div>
        </div>
        <div class="modal-footer" style="justify-content: space-between;">
          <span style="font-size: 11px; color: var(--slate-500);">Tap "Open Date Data" to view uploaded photos or "Download" for PDF</span>
          <button id="btn-close-history" class="btn-ghost-sm" style="padding: 8px 16px;">Close</button>
        </div>
      </div>
    </div>

    <!-- Generation Progress Modal -->
    <div id="modal-generation" class="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-body gen-progress-box">
          <div class="spinner"></div>
          <h3 id="gen-modal-status" class="gen-status-text">Preparing Daily Cleaning Report...</h3>
          <p id="gen-modal-sub" class="gen-sub-text">Compressing high-resolution images & assembling A4 grid pages</p>
        </div>
      </div>
    </div>

    <!-- Clear Day Confirmation Modal -->
    <div id="modal-clear-confirm" class="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">Clear Photos For ${displayDate}?</h3>
          <button class="modal-close-btn" id="btn-close-clear-modal">&times;</button>
        </div>
        <div class="modal-body">
          <p>This will permanently remove photos for <strong>${displayDate}</strong> across all 12 floors and reset today's sheet.</p>
          <p style="margin-top: 10px; font-weight: 700; color: #b91c1c;">Are you sure you want to proceed?</p>
        </div>
        <div class="modal-footer">
          <button id="btn-cancel-clear" class="btn-ghost-sm" style="padding: 8px 16px;">Cancel</button>
          <button id="btn-confirm-clear" class="btn-danger-outline" style="background: #ef4444; color: white;">Yes, Clear This Day</button>
        </div>
      </div>
    </div>

    <!-- PWA Install Guide Modal -->
    <div id="modal-install-guide" class="modal-overlay">
      <div class="modal-dialog" style="max-width: 520px;">
        <div class="modal-header">
          <h3 class="modal-title">📲 Install App on Phone Home Screen</h3>
          <button class="modal-close-btn" id="btn-close-install-modal">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 12px; font-weight: 600; color: var(--navy-800);">Phone par bina store ke App icon lagane ka tarika:</p>
          
          <div style="background: #f8fafc; border: 1px solid var(--slate-200); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 12px;">
            <h4 style="font-size: 14px; color: var(--navy-800); margin-bottom: 8px; font-weight: 800;">🤖 Android (Chrome):</h4>
            <ol style="margin-left: 18px; font-size: 13px; color: var(--slate-700); line-height: 1.7;">
              <li>Chrome me upar right corner me <strong>3 dots (⋮)</strong> par tap karein.</li>
              <li>Menu me <strong>"Install app"</strong> ya <strong>"Add to Home screen"</strong> par tap karein.</li>
              <li>Confirm karein! <strong>Mahajan Facilities</strong> ka app icon seedha aapke phone ki home screen par aa jayega.</li>
            </ol>
          </div>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-sm); padding: 10px; font-size: 12px; color: #1e40af;">
            💡 <strong>Note:</strong> Agar aap abhi Wi-Fi IP (http://...) se test kar rahe hain, to Chrome automatic popup block karta hai. Par jab aap <strong>Vercel (https://...)</strong> par live karenge to automatic popup bhi aa jayega!
          </div>
        </div>
        <div class="modal-footer">
          <button id="btn-trigger-native-install" class="btn-install-app" style="display: none;">
            <span>⚡</span> Install Directly
          </button>
          <button id="btn-close-install-guide" class="btn-ghost-sm" style="padding: 8px 16px;">Got It</button>
        </div>
      </div>
    </div>

    <!-- Cloud / Access Anywhere Modal -->
    <div id="modal-cloud-guide" class="modal-overlay">
      <div class="modal-dialog" style="max-width: 560px;">
        <div class="modal-header">
          <h3 class="modal-title">🌐 Run Anywhere (Permanent Public URL)</h3>
          <button class="modal-close-btn" id="btn-close-cloud-modal">&times;</button>
        </div>
        <div class="modal-body" style="font-size: 13px; line-height: 1.6;">
          <p style="margin-bottom: 12px; font-weight: 600; color: var(--navy-800);">
            Aapka code aapke GitHub repository (<strong>RajChauhan0723/mahajan-facilities-report</strong>) par live hai!
          </p>

          <div style="background: #f8fafc; border: 1px solid var(--slate-200); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
            <strong style="color: var(--navy-800); display: block; margin-bottom: 4px;">🚀 1 Click Me Vercel Par Deploy Karein:</strong>
            <p style="font-size: 12px; color: var(--slate-600);">
              1. <strong>vercel.com</strong> par RajChauhan0723 GitHub se login karein.<br>
              2. <strong>mahajan-facilities-report</strong> ko Import karke Deploy dabayein.<br>
              3. Permanent free link mil jayega jo phone par 24/7 chalega!
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button id="btn-close-cloud-guide" class="btn-ghost-sm" style="padding: 8px 16px;">Close</button>
        </div>
      </div>
    </div>

    <!-- Image Lightbox Modal -->
    <div id="modal-lightbox" class="modal-overlay">
      <div class="lightbox-dialog">
        <div class="modal-header">
          <h3 class="modal-title" id="lightbox-title">Photo Preview</h3>
          <button class="modal-close-btn" id="btn-close-lightbox">&times;</button>
        </div>
        <div class="lightbox-img-container">
          <img id="lightbox-img" src="" alt="Photo Preview" />
        </div>
      </div>
    </div>

    <!-- PDF Success / Preview Modal -->
    <div id="modal-pdf-success" class="modal-overlay">
      <div class="modal-dialog" style="max-width: 600px;">
        <div class="modal-header">
          <h3 class="modal-title">🎉 Report PDF Generated Successfully!</h3>
          <button class="modal-close-btn" id="btn-close-pdf-success">&times;</button>
        </div>
        <div class="modal-body" style="text-align: center; padding: 24px 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">📄</div>
          <h4 id="pdf-success-filename" style="font-size: 16px; color: var(--navy-800); margin-bottom: 6px; word-break: break-all;"></h4>
          <p id="pdf-success-details" style="font-size: 13px; color: var(--slate-500); margin-bottom: 20px;"></p>
          
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
            <button id="btn-modal-download" class="btn-download-pdf" style="font-size: 14px; padding: 10px 20px;">
              <span>📥</span> Download PDF Now
            </button>
            <button id="btn-modal-open" class="btn-upload" style="background: var(--navy-800); font-size: 14px; padding: 10px 20px;">
              <span>👁️</span> Open in New Tab
            </button>
            <button id="btn-modal-new-day" class="btn-ghost-sm" style="font-size: 14px; padding: 10px 20px; border-color: var(--slate-300); color: var(--navy-800);">
              <span>➕</span> Start New Day
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  attachEventListeners();
}

/**
 * Renders Past Reports History Cards (with optional date filtering)
 */
function renderHistoryList(filterDate = '') {
  let list = state.reportHistory || [];

  if (filterDate) {
    list = list.filter((item) => item.reportDate === filterDate);
  }

  if (list.length === 0) {
    if (filterDate) {
      return `
        <div class="empty-history-box">
          <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
          <p style="font-weight: 700; color: var(--navy-800); margin-bottom: 4px;">No report found for ${formatDisplayDate(filterDate)}</p>
          <p style="font-size: 12px; color: var(--slate-500);">Try selecting another date or click "Show All Dates".</p>
        </div>
      `;
    }
    return `
      <div class="empty-history-box">
        <div style="font-size: 40px; margin-bottom: 10px;">📋</div>
        <p style="font-weight: 700; color: var(--navy-800); margin-bottom: 4px;">No past reports saved yet</p>
        <p style="font-size: 12px; color: var(--slate-500);">Whenever you generate a Daily PDF Report, it will automatically be stored here with its date and full download file!</p>
      </div>
    `;
  }

  return list
    .map((item) => {
      const timeStr = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateDisplay = item.formattedDate || item.reportDate;
      const sizeStr = item.pdfBlob ? formatBytes(item.pdfBlob.size) : '';

      return `
        <div class="history-card" data-history-id="${item.id}">
          <div class="history-info">
            <div class="history-date-row">
              <span class="history-date-badge" style="font-size: 15px; color: var(--navy-800);">📅 Date: ${dateDisplay}</span>
              <span class="history-time-tag">${timeStr}</span>
            </div>
            <div class="history-stats-row">
              <span class="history-stat-tag">📸 ${item.totalPhotos} Photos</span>
              <span class="history-stat-tag">🏢 ${item.floorsDocumented} Floors</span>
              <span class="history-stat-tag">📄 ${item.totalPages} Pages</span>
              ${sizeStr ? `<span class="history-stat-tag">${sizeStr}</span>` : ''}
            </div>
          </div>
          <div class="history-actions">
            <button class="btn-history-load" data-action="history-load" data-history-id="${item.id}" title="Open this date's data & photos in the dashboard">
              <span>📂</span> Open Date Data
            </button>
            <button class="btn-history-dl" data-action="history-download" data-history-id="${item.id}" title="Download Saved PDF">
              <span>📥</span> Download PDF
            </button>
            <button class="btn-ghost-sm" data-action="history-view" data-history-id="${item.id}" title="View in New Tab" style="padding: 6px 10px;">
              <span>👁️</span>
            </button>
            <button class="btn-history-del" data-action="history-delete" data-history-id="${item.id}" title="Delete this saved report">
              &times;
            </button>
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Renders Quick Nav Pills
 */
function renderQuickNavPills() {
  return state.floors
    .map((floor) => {
      const genCount = floor.generalPhotos.length;
      const washCount = floor.washroomPhotos.length;
      const total = genCount + washCount;
      const hasPhotos = total > 0;

      return `
        <div class="floor-pill ${hasPhotos ? 'has-photos' : ''}" data-target-floor="${floor.id}">
          <span>${floor.name}</span>
          <span class="pill-count">${total}</span>
        </div>
      `;
    })
    .join('');
}

/**
 * Renders all 13 Floor Cards
 */
function renderFloorCards() {
  return state.floors
    .map((floor, index) => {
      const isExpanded = state.expandedFloors.has(floor.id);
      const genCount = floor.generalPhotos.length;
      const washCount = floor.washroomPhotos.length;
      const total = genCount + washCount;

      return `
        <div class="floor-card ${isExpanded ? 'expanded' : ''}" id="floor-card-${floor.id}" data-floor-id="${floor.id}">
          <!-- Floor Card Header -->
          <div class="floor-card-header" data-toggle-floor="${floor.id}">
            <div class="floor-header-left">
              <span class="floor-num-badge">LEVEL ${index + 1}</span>
              <h3 class="floor-title">${floor.name}</h3>
              <div class="floor-header-badges">
                <span class="badge-pill ${genCount > 0 ? 'badge-gen' : 'badge-empty'}">
                  General: ${genCount}/${MAX_PHOTOS_PER_SECTION}
                </span>
                <span class="badge-pill ${washCount > 0 ? 'badge-wash' : 'badge-empty'}">
                  Washroom: ${washCount}/${MAX_PHOTOS_PER_SECTION}
                </span>
                <span class="badge-pill ${total > 0 ? 'badge-gen' : 'badge-empty'}">
                  Total: ${total}/40
                </span>
              </div>
            </div>
            <div class="floor-chevron">▼</div>
          </div>

          <!-- Floor Card Body -->
          <div class="floor-card-body">
            <div class="sections-row">
              <!-- Section A: General Cleaning -->
              ${renderSectionPanel(floor, 'general', 'Section A — General Cleaning Photos', 'panel-general', '🧹', 'blue')}
              
              <!-- Section B: Washroom Cleaning -->
              ${renderSectionPanel(floor, 'washroom', 'Section B — Washroom Cleaning Photos', 'panel-washroom', '🧻', 'teal')}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

/**
 * Renders a single Section Panel (General or Washroom)
 */
function renderSectionPanel(floor, sectionKey, title, panelClass, icon, colorTheme) {
  const photos = sectionKey === 'general' ? floor.generalPhotos : floor.washroomPhotos;
  const count = photos.length;
  const isFull = count >= MAX_PHOTOS_PER_SECTION;
  const badgeClass = isFull ? 'limit-reached' : count > 0 ? 'has-photos' : '';

  return `
    <div class="section-panel ${panelClass}">
      <div class="section-panel-header">
        <div class="section-panel-title">
          <div class="section-icon-box">${icon}</div>
          <span>${title}</span>
        </div>
        <span class="photo-counter-badge ${badgeClass}" id="badge-${floor.id}-${sectionKey}">
          ${count} / ${MAX_PHOTOS_PER_SECTION} Photos
        </span>
      </div>

      <!-- Upload Controls / Dropzone -->
      <div class="upload-dropzone" data-floor="${floor.id}" data-section="${sectionKey}" id="dropzone-${floor.id}-${sectionKey}">
        <div class="dropzone-icon">📷</div>
        <p class="dropzone-prompt">${isFull ? 'Section limit reached (20/20)' : 'Upload or Drag Cleaning Photos Here'}</p>
        <p class="dropzone-hint">Accepts JPG, JPEG, PNG, WEBP (Max 20 photos)</p>

        <div class="upload-buttons">
          <button type="button" class="btn-upload" data-action="upload-files" data-floor="${floor.id}" data-section="${sectionKey}" ${isFull ? 'disabled' : ''}>
            <span>📁</span> Select Photos
          </button>
          <button type="button" class="btn-camera" data-action="upload-camera" data-floor="${floor.id}" data-section="${sectionKey}" ${isFull ? 'disabled' : ''}>
            <span>📸</span> Camera
          </button>
        </div>

        <!-- Hidden File Inputs -->
        <input 
          type="file" 
          id="file-input-${floor.id}-${sectionKey}" 
          class="hidden-file-input" 
          accept="image/jpeg,image/jpg,image/png,image/webp" 
          multiple 
          data-floor="${floor.id}" 
          data-section="${sectionKey}"
        />
        <input 
          type="file" 
          id="camera-input-${floor.id}-${sectionKey}" 
          class="hidden-file-input" 
          accept="image/jpeg,image/jpg,image/png,image/webp" 
          capture="environment" 
          data-floor="${floor.id}" 
          data-section="${sectionKey}"
        />
      </div>

      <!-- Thumbnails Grid -->
      <div class="thumbnails-grid" id="grid-${floor.id}-${sectionKey}">
        ${renderThumbnailCards(floor.id, sectionKey, photos)}
      </div>
    </div>
  `;
}

/**
 * Renders thumbnail cards for a photo array
 */
function renderThumbnailCards(floorId, sectionKey, photos) {
  if (!photos || photos.length === 0) {
    return `<div class="empty-thumbs-notice" style="grid-column: 1 / -1;">No photos uploaded yet for this section.</div>`;
  }

  return photos
    .map((photo, index) => {
      const seqNumber = String(index + 1).padStart(2, '0');
      const sizeStr = formatBytes(photo.originalSize);
      return `
        <div class="photo-thumb-card" data-photo-id="${photo.id}">
          <div class="thumb-img-wrapper" data-action="lightbox" data-url="${photo.dataUrl}" data-title="${photo.name}" data-seq="#${seqNumber}">
            <img src="${photo.dataUrl}" alt="${photo.name}" class="thumb-img" loading="lazy" />
            <div class="thumb-seq-badge">#${seqNumber}</div>
            <button type="button" class="thumb-btn-remove" data-action="remove-photo" data-floor="${floorId}" data-section="${sectionKey}" data-photo-id="${photo.id}" title="Remove Photo">&times;</button>
          </div>
          <div class="thumb-caption" title="${photo.name} (${sizeStr})">${photo.name}</div>
        </div>
      `;
    })
    .join('');
}

/**
 * Attach DOM Event Handlers
 */
function attachEventListeners() {
  // Date Picker change -> Date-Isolated Session Switcher!
  const dateInput = document.getElementById('report-date-input');
  if (dateInput) {
    dateInput.addEventListener('change', async (e) => {
      const oldDate = state.reportDate;
      const newDate = e.target.value || getTodayYMD();
      if (oldDate === newDate) return;

      // 1. Save work of oldDate
      await saveDraft(oldDate, state.floors);

      // 2. Switch active date
      state.reportDate = newDate;

      // 3. Load draft for newDate
      const existingDraft = await loadDraft(newDate);
      const reconciled = existingDraft ? reconcileFloors(existingDraft.floors) : null;
      if (reconciled) {
        state.floors = reconciled;
        const stats = getStats();
        showToast(`Loaded saved sheet for ${formatDisplayDate(newDate)} (${stats.grandTotal} photos).`, 'info');
      } else {
        // Brand new date sheet with empty floors!
        state.floors = FLOORS_CONFIG.map((f) => ({
          id: f.id,
          name: f.name,
          generalPhotos: [],
          washroomPhotos: []
        }));
        showToast(`Fresh report sheet opened for ${formatDisplayDate(newDate)}.`, 'info');
      }

      state.lastGeneratedPdf = null;
      refreshEntireUI();
    });
  }

  // Start Fresh Sheet for the current date
  const btnStartFresh = document.getElementById('btn-start-fresh');
  if (btnStartFresh) {
    btnStartFresh.addEventListener('click', async () => {
      state.floors = FLOORS_CONFIG.map((f) => ({
        id: f.id,
        name: f.name,
        generalPhotos: [],
        washroomPhotos: []
      }));
      state.lastGeneratedPdf = null;
      await clearDraft(state.reportDate);
      refreshEntireUI();
      showToast(`Started fresh sheet for ${formatDisplayDate(state.reportDate)}.`, 'info');
    });
  }

  // History Modal Toggle
  const btnOpenHistory = document.getElementById('btn-open-history');
  const modalHistory = document.getElementById('modal-history');
  const btnCloseHistoryModal = document.getElementById('btn-close-history-modal');
  const btnCloseHistory = document.getElementById('btn-close-history');

  if (btnOpenHistory && modalHistory) {
    btnOpenHistory.addEventListener('click', async () => {
      state.reportHistory = await getReportHistory();
      state.historyFilterDate = '';
      const listContainer = document.getElementById('history-list-container');
      if (listContainer) listContainer.innerHTML = renderHistoryList('');
      const filterInput = document.getElementById('history-filter-date');
      if (filterInput) filterInput.value = '';
      updateHistoryBadge();
      modalHistory.classList.add('active');
    });

    [btnCloseHistoryModal, btnCloseHistory].forEach((btn) => {
      if (btn) btn.addEventListener('click', () => modalHistory.classList.remove('active'));
    });

    modalHistory.addEventListener('click', (e) => {
      if (e.target === modalHistory) modalHistory.classList.remove('active');
    });
  }

  // History Date Filter Handler
  const filterDateInput = document.getElementById('history-filter-date');
  if (filterDateInput) {
    filterDateInput.addEventListener('change', (e) => {
      const selected = e.target.value;
      state.historyFilterDate = selected;
      const listContainer = document.getElementById('history-list-container');
      if (listContainer) listContainer.innerHTML = renderHistoryList(selected);
    });
  }

  const btnShowAllDates = document.getElementById('btn-history-show-all');
  if (btnShowAllDates) {
    btnShowAllDates.addEventListener('click', () => {
      state.historyFilterDate = '';
      const filterInput = document.getElementById('history-filter-date');
      if (filterInput) filterInput.value = '';
      const listContainer = document.getElementById('history-list-container');
      if (listContainer) listContainer.innerHTML = renderHistoryList('');
    });
  }

  // History List Actions (Load Data, Download, View, Delete)
  document.addEventListener('click', async (e) => {
    // 1. Load Data into App
    const loadBtn = e.target.closest('[data-action="history-load"]');
    if (loadBtn) {
      const id = loadBtn.dataset.historyId;
      const item = state.reportHistory.find((r) => r.id === id);
      if (item) {
        // Save current sheet first
        await saveDraft(state.reportDate, state.floors);

        state.reportDate = item.reportDate;
        const reconciled = reconcileFloors(item.floors);
        if (reconciled) {
          state.floors = reconciled;
        } else {
          const draft = await loadDraft(item.reportDate);
          state.floors = (draft && reconcileFloors(draft.floors)) || FLOORS_CONFIG.map((f) => ({
            id: f.id,
            name: f.name,
            generalPhotos: [],
            washroomPhotos: []
          }));
        }

        state.lastGeneratedPdf = {
          blob: item.pdfBlob,
          fileName: item.fileName,
          totalPages: item.totalPages
        };

        if (modalHistory) modalHistory.classList.remove('active');
        refreshEntireUI();
        showToast(`Loaded full inspection data for ${item.formattedDate}! You can now inspect photos & edit.`, 'success');
      }
      return;
    }

    // 2. Download Saved PDF
    const dlBtn = e.target.closest('[data-action="history-download"]');
    if (dlBtn) {
      const id = dlBtn.dataset.historyId;
      const item = state.reportHistory.find((r) => r.id === id);
      if (item && item.pdfBlob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(item.pdfBlob);
        link.download = item.fileName || `Mahajan_Cleaning_Report_${item.formattedDate}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Downloading saved report for ${item.formattedDate}...`, 'success');
      }
      return;
    }

    // 3. View PDF in Tab
    const viewBtn = e.target.closest('[data-action="history-view"]');
    if (viewBtn) {
      const id = viewBtn.dataset.historyId;
      const item = state.reportHistory.find((r) => r.id === id);
      if (item && item.pdfBlob) {
        const url = URL.createObjectURL(item.pdfBlob);
        window.open(url, '_blank');
      }
      return;
    }

    // 4. Delete Record
    const delBtn = e.target.closest('[data-action="history-delete"]');
    if (delBtn) {
      const id = delBtn.dataset.historyId;
      await deleteReportFromHistory(id);
      state.reportHistory = await getReportHistory();
      const listContainer = document.getElementById('history-list-container');
      if (listContainer) listContainer.innerHTML = renderHistoryList(state.historyFilterDate);
      updateHistoryBadge();
      showToast('Report removed from history.', 'info');
      return;
    }
  });

  // PWA Install Button Click
  const btnInstallApp = document.getElementById('btn-install-app');
  const modalInstall = document.getElementById('modal-install-guide');
  const btnCloseInstallModal = document.getElementById('btn-close-install-modal');
  const btnCloseInstallGuide = document.getElementById('btn-close-install-guide');
  const btnTriggerNativeInstall = document.getElementById('btn-trigger-native-install');

  if (btnInstallApp) {
    btnInstallApp.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('Mahajan Facilities App installed successfully!', 'success');
          btnInstallApp.style.display = 'none';
        }
        deferredInstallPrompt = null;
      } else {
        if (modalInstall) modalInstall.classList.add('active');
      }
    });
  }

  if (modalInstall) {
    [btnCloseInstallModal, btnCloseInstallGuide].forEach((btn) => {
      if (btn) btn.addEventListener('click', () => modalInstall.classList.remove('active'));
    });
    modalInstall.addEventListener('click', (e) => {
      if (e.target === modalInstall) modalInstall.classList.remove('active');
    });
  }

  if (btnTriggerNativeInstall && deferredInstallPrompt) {
    btnTriggerNativeInstall.style.display = 'inline-flex';
    btnTriggerNativeInstall.addEventListener('click', () => {
      deferredInstallPrompt.prompt();
      modalInstall.classList.remove('active');
    });
  }

  // Cloud / Online Access Guide Button Click
  const btnCloudGuide = document.getElementById('btn-cloud-guide');
  const modalCloud = document.getElementById('modal-cloud-guide');
  const btnCloseCloudModal = document.getElementById('btn-close-cloud-modal');
  const btnCloseCloudGuide = document.getElementById('btn-close-cloud-guide');

  if (btnCloudGuide && modalCloud) {
    btnCloudGuide.addEventListener('click', () => modalCloud.classList.add('active'));
    [btnCloseCloudModal, btnCloseCloudGuide].forEach((btn) => {
      if (btn) btn.addEventListener('click', () => modalCloud.classList.remove('active'));
    });
    modalCloud.addEventListener('click', (e) => {
      if (e.target === modalCloud) modalCloud.classList.remove('active');
    });
  }

  // Quick Nav Pills Click
  document.querySelectorAll('[data-target-floor]').forEach((pill) => {
    pill.addEventListener('click', () => {
      const floorId = pill.dataset.targetFloor;
      state.expandedFloors.add(floorId);
      updateFloorAccordionVisual(floorId, true);
      const targetCard = document.getElementById(`floor-card-${floorId}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Accordion Header Toggle
  document.querySelectorAll('[data-toggle-floor]').forEach((header) => {
    header.addEventListener('click', () => {
      const floorId = header.dataset.toggleFloor;
      const isExpanded = state.expandedFloors.has(floorId);
      if (isExpanded) {
        state.expandedFloors.delete(floorId);
        updateFloorAccordionVisual(floorId, false);
      } else {
        state.expandedFloors.add(floorId);
        updateFloorAccordionVisual(floorId, true);
      }
    });
  });

  // Expand All / Collapse All
  const btnExpandAll = document.getElementById('btn-expand-all');
  if (btnExpandAll) {
    btnExpandAll.addEventListener('click', () => {
      state.floors.forEach((f) => state.expandedFloors.add(f.id));
      state.floors.forEach((f) => updateFloorAccordionVisual(f.id, true));
    });
  }

  const btnCollapseAll = document.getElementById('btn-collapse-all');
  if (btnCollapseAll) {
    btnCollapseAll.addEventListener('click', () => {
      state.expandedFloors.clear();
      state.floors.forEach((f) => updateFloorAccordionVisual(f.id, false));
    });
  }

  // File & Camera Upload Button Clicks
  document.querySelectorAll('[data-action="upload-files"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const floorId = btn.dataset.floor;
      const sectionKey = btn.dataset.section;
      const fileInput = document.getElementById(`file-input-${floorId}-${sectionKey}`);
      if (fileInput) fileInput.click();
    });
  });

  document.querySelectorAll('[data-action="upload-camera"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const floorId = btn.dataset.floor;
      const sectionKey = btn.dataset.section;
      const camInput = document.getElementById(`camera-input-${floorId}-${sectionKey}`);
      if (camInput) camInput.click();
    });
  });

  // File Input Change Handlers
  document.querySelectorAll('.hidden-file-input').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      const floorId = input.dataset.floor;
      const sectionKey = input.dataset.section;
      if (files.length > 0) {
        await handleFilesUpload(floorId, sectionKey, files);
      }
      input.value = '';
    });
  });

  // Drag and Drop support on dropzones
  document.querySelectorAll('.upload-dropzone').forEach((dropzone) => {
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', async (e) => {
      const files = Array.from(e.dataTransfer.files || []);
      const floorId = dropzone.dataset.floor;
      const sectionKey = dropzone.dataset.section;
      if (files.length > 0) {
        await handleFilesUpload(floorId, sectionKey, files);
      }
    });
  });

  // Photo Removal & Lightbox
  document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-action="remove-photo"]');
    if (removeBtn) {
      e.stopPropagation();
      const floorId = removeBtn.dataset.floor;
      const sectionKey = removeBtn.dataset.section;
      const photoId = removeBtn.dataset.photoId;
      removeSinglePhoto(floorId, sectionKey, photoId);
      return;
    }

    const lightboxTrigger = e.target.closest('[data-action="lightbox"]');
    if (lightboxTrigger) {
      const url = lightboxTrigger.dataset.url;
      const title = lightboxTrigger.dataset.title;
      const seq = lightboxTrigger.dataset.seq;
      openLightbox(url, `${seq} - ${title}`);
      return;
    }
  });

  // Lightbox Close
  const btnCloseLightbox = document.getElementById('btn-close-lightbox');
  const modalLightbox = document.getElementById('modal-lightbox');
  if (btnCloseLightbox && modalLightbox) {
    btnCloseLightbox.addEventListener('click', () => modalLightbox.classList.remove('active'));
    modalLightbox.addEventListener('click', (e) => {
      if (e.target === modalLightbox) modalLightbox.classList.remove('active');
    });
  }

  // Clear Day Modal
  const btnClearAll = document.getElementById('btn-clear-all');
  const modalClear = document.getElementById('modal-clear-confirm');
  const btnCancelClear = document.getElementById('btn-cancel-clear');
  const btnCloseClear = document.getElementById('btn-close-clear-modal');
  const btnConfirmClear = document.getElementById('btn-confirm-clear');

  if (btnClearAll && modalClear) {
    btnClearAll.addEventListener('click', () => modalClear.classList.add('active'));
    [btnCancelClear, btnCloseClear].forEach((btn) => {
      if (btn) btn.addEventListener('click', () => modalClear.classList.remove('active'));
    });
    modalClear.addEventListener('click', (e) => {
      if (e.target === modalClear) modalClear.classList.remove('active');
    });

    if (btnConfirmClear) {
      btnConfirmClear.addEventListener('click', async () => {
        state.floors = FLOORS_CONFIG.map((f) => ({
          id: f.id,
          name: f.name,
          generalPhotos: [],
          washroomPhotos: []
        }));
        state.lastGeneratedPdf = null;
        await clearDraft(state.reportDate);
        modalClear.classList.remove('active');
        refreshEntireUI();
        showToast(`Cleared photos for ${formatDisplayDate(state.reportDate)}.`, 'info');
      });
    }
  }

  // Generate PDF Action
  const btnGenerate = document.getElementById('btn-generate-pdf');
  if (btnGenerate) {
    btnGenerate.addEventListener('click', handleGeneratePdfClick);
  }

  // Download PDF Action
  const btnDownload = document.getElementById('btn-download-pdf');
  if (btnDownload) {
    btnDownload.addEventListener('click', handleDownloadPdfClick);
  }

  // PDF Success Modal actions
  const btnCloseSuccess = document.getElementById('btn-close-pdf-success');
  const modalSuccess = document.getElementById('modal-pdf-success');
  const btnModalDownload = document.getElementById('btn-modal-download');
  const btnModalOpen = document.getElementById('btn-modal-open');
  const btnModalNewDay = document.getElementById('btn-modal-new-day');

  if (btnCloseSuccess && modalSuccess) {
    btnCloseSuccess.addEventListener('click', () => modalSuccess.classList.remove('active'));
    modalSuccess.addEventListener('click', (e) => {
      if (e.target === modalSuccess) modalSuccess.classList.remove('active');
    });
  }

  if (btnModalDownload) {
    btnModalDownload.addEventListener('click', () => {
      handleDownloadPdfClick();
      modalSuccess.classList.remove('active');
    });
  }

  if (btnModalOpen) {
    btnModalOpen.addEventListener('click', () => {
      if (state.lastGeneratedPdf && state.lastGeneratedPdf.url) {
        window.open(state.lastGeneratedPdf.url, '_blank');
      }
    });
  }

  if (btnModalNewDay) {
    btnModalNewDay.addEventListener('click', async () => {
      modalSuccess.classList.remove('active');
      const d = new Date(state.reportDate);
      d.setDate(d.getDate() + 1);
      const nextYMD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      state.reportDate = nextYMD;
      state.floors = FLOORS_CONFIG.map((f) => ({
        id: f.id,
        name: f.name,
        generalPhotos: [],
        washroomPhotos: []
      }));
      state.lastGeneratedPdf = null;
      refreshEntireUI();
      showToast(`Started new day sheet for ${formatDisplayDate(nextYMD)}!`, 'success');
    });
  }
}

/**
 * Updates UI classes for Accordion visual state
 */
function updateFloorAccordionVisual(floorId, isExpanded) {
  const card = document.getElementById(`floor-card-${floorId}`);
  if (card) {
    if (isExpanded) card.classList.add('expanded');
    else card.classList.remove('expanded');
  }
}

/**
 * Handles multiple file uploads with strict 20-photo validation
 */
async function handleFilesUpload(floorId, sectionKey, files) {
  const floor = state.floors.find((f) => f.id === floorId);
  if (!floor) return;

  const targetPhotos = sectionKey === 'general' ? floor.generalPhotos : floor.washroomPhotos;
  const currentCount = targetPhotos.length;
  const remainingSlots = MAX_PHOTOS_PER_SECTION - currentCount;

  if (remainingSlots <= 0) {
    showToast(`Maximum limit of ${MAX_PHOTOS_PER_SECTION} photos reached for this section.`, 'warning');
    return;
  }

  const validFiles = [];
  const invalidFiles = [];

  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext) || file.type.startsWith('image/')) {
      validFiles.push(file);
    } else {
      invalidFiles.push(file.name);
    }
  }

  if (invalidFiles.length > 0) {
    showToast(`Skipped ${invalidFiles.length} unsupported file(s). Only JPG, JPEG, PNG, WEBP allowed.`, 'error');
  }

  if (validFiles.length === 0) return;

  const filesToProcess = validFiles.slice(0, remainingSlots);
  const skippedCount = validFiles.length - filesToProcess.length;

  if (skippedCount > 0) {
    showToast(`Adding ${filesToProcess.length} photo(s). ${skippedCount} skipped (20 photos maximum per section).`, 'warning');
  } else {
    showToast(`Processing ${filesToProcess.length} image(s)...`, 'info');
  }

  let addedCount = 0;
  for (const file of filesToProcess) {
    try {
      const processed = await processImageFile(file);
      targetPhotos.push(processed);
      addedCount++;
    } catch (err) {
      showToast(`Error processing ${file.name}: ${err.message}`, 'error');
    }
  }

  if (addedCount > 0) {
    await autoSaveState();
    refreshSectionUI(floorId, sectionKey);
    updateGlobalStatsUI();
    showToast(`Successfully added ${addedCount} photo(s) to ${floor.name}.`, 'success');
  }
}

/**
 * Removes an individual photo
 */
async function removeSinglePhoto(floorId, sectionKey, photoId) {
  const floor = state.floors.find((f) => f.id === floorId);
  if (!floor) return;

  if (sectionKey === 'general') {
    floor.generalPhotos = floor.generalPhotos.filter((p) => p.id !== photoId);
  } else {
    floor.washroomPhotos = floor.washroomPhotos.filter((p) => p.id !== photoId);
  }

  await autoSaveState();
  refreshSectionUI(floorId, sectionKey);
  updateGlobalStatsUI();
  showToast('Photo removed.', 'info');
}

/**
 * Refreshes only the affected section inside a floor card
 */
function refreshSectionUI(floorId, sectionKey) {
  const floor = state.floors.find((f) => f.id === floorId);
  if (!floor) return;

  const photos = sectionKey === 'general' ? floor.generalPhotos : floor.washroomPhotos;
  const count = photos.length;
  const isFull = count >= MAX_PHOTOS_PER_SECTION;

  // 1. Update Grid
  const grid = document.getElementById(`grid-${floorId}-${sectionKey}`);
  if (grid) {
    grid.innerHTML = renderThumbnailCards(floorId, sectionKey, photos);
  }

  // 2. Update Badge
  const badge = document.getElementById(`badge-${floorId}-${sectionKey}`);
  if (badge) {
    badge.className = `photo-counter-badge ${isFull ? 'limit-reached' : count > 0 ? 'has-photos' : ''}`;
    badge.textContent = `${count} / ${MAX_PHOTOS_PER_SECTION} Photos`;
  }

  // 3. Update Dropzone buttons enabled/disabled state
  const dropzone = document.getElementById(`dropzone-${floorId}-${sectionKey}`);
  if (dropzone) {
    const promptEl = dropzone.querySelector('.dropzone-prompt');
    if (promptEl) {
      promptEl.textContent = isFull ? 'Section limit reached (20/20)' : 'Upload or Drag Cleaning Photos Here';
    }
    dropzone.querySelectorAll('button').forEach((b) => {
      b.disabled = isFull;
    });
  }

  // 4. Update Floor Card Header Badges
  const card = document.getElementById(`floor-card-${floorId}`);
  if (card) {
    const genCount = floor.generalPhotos.length;
    const washCount = floor.washroomPhotos.length;
    const total = genCount + washCount;
    const badgesContainer = card.querySelector('.floor-header-badges');
    if (badgesContainer) {
      badgesContainer.innerHTML = `
        <span class="badge-pill ${genCount > 0 ? 'badge-gen' : 'badge-empty'}">
          General: ${genCount}/${MAX_PHOTOS_PER_SECTION}
        </span>
        <span class="badge-pill ${washCount > 0 ? 'badge-wash' : 'badge-empty'}">
          Washroom: ${washCount}/${MAX_PHOTOS_PER_SECTION}
        </span>
        <span class="badge-pill ${total > 0 ? 'badge-gen' : 'badge-empty'}">
          Total: ${total}/40
        </span>
      `;
    }
  }

  // 5. Update Quick Nav Pill for this floor
  const pill = document.querySelector(`[data-target-floor="${floorId}"]`);
  if (pill) {
    const total = floor.generalPhotos.length + floor.washroomPhotos.length;
    pill.className = `floor-pill ${total > 0 ? 'has-photos' : ''}`;
    const pillCount = pill.querySelector('.pill-count');
    if (pillCount) pillCount.textContent = total;
  }
}

/**
 * Updates top KPIs, progress bar, and sticky bottom bar
 */
function updateGlobalStatsUI() {
  const stats = getStats();

  const kpiGen = document.getElementById('kpi-general-val');
  if (kpiGen) kpiGen.textContent = stats.totalGeneral;

  const kpiWash = document.getElementById('kpi-washroom-val');
  if (kpiWash) kpiWash.textContent = stats.totalWashroom;

  const kpiTot = document.getElementById('kpi-total-val');
  if (kpiTot) kpiTot.textContent = stats.grandTotal;

  const progressCount = document.getElementById('progress-floor-count');
  if (progressCount) progressCount.textContent = `${stats.floorsWithPhotos} of 12 Floors Documented`;

  const percent = Math.round((stats.floorsWithPhotos / 12) * 100);
  const progressPercent = document.getElementById('progress-percent');
  if (progressPercent) progressPercent.textContent = `${percent}%`;

  const progressFill = document.getElementById('progress-fill-bar');
  if (progressFill) progressFill.style.width = `${percent}%`;

  const chipTot = document.getElementById('bar-total-chip');
  if (chipTot) chipTot.textContent = `📸 ${stats.grandTotal} Photos`;

  const chipFloors = document.getElementById('bar-floors-chip');
  if (chipFloors) chipFloors.textContent = `🏢 ${stats.floorsWithPhotos}/12 Floors`;

  const btnGen = document.getElementById('btn-generate-pdf');
  if (btnGen) {
    if (stats.grandTotal === 0) {
      btnGen.title = 'Upload at least 1 photo to generate PDF';
    } else {
      btnGen.title = '';
    }
  }
}

/**
 * Re-renders the entire UI
 */
function refreshEntireUI() {
  renderApp();
}

/**
 * Opens photo in Lightbox Modal
 */
function openLightbox(url, title) {
  const modal = document.getElementById('modal-lightbox');
  const img = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');
  if (modal && img && titleEl) {
    img.src = url;
    titleEl.textContent = title;
    modal.classList.add('active');
  }
}

/**
 * PDF Generation Trigger with Auto-Save to History
 */
async function handleGeneratePdfClick() {
  if (!state.reportDate) {
    showToast('Please select a Report Date before generating the PDF.', 'error');
    return;
  }

  const stats = getStats();
  if (stats.grandTotal === 0) {
    showToast('Please upload at least one photo before generating the cleaning report PDF.', 'warning');
    return;
  }

  state.isGenerating = true;
  const modalGen = document.getElementById('modal-generation');
  const statusEl = document.getElementById('gen-modal-status');
  const subEl = document.getElementById('gen-modal-sub');

  if (modalGen) modalGen.classList.add('active');

  try {
    const result = await generateDailyReportPDF({
      reportDate: state.reportDate,
      floors: state.floors,
      onProgress: (p) => {
        if (statusEl) statusEl.textContent = p.message || 'Generating PDF...';
        if (subEl && p.step === 'floor') {
          subEl.textContent = `Floor ${p.current} of ${p.total}`;
        }
      }
    });

    state.lastGeneratedPdf = result;

    // Automatically Save to Past Reports History with full photos snapshot!
    try {
      const historyRecord = {
        id: 'rep_' + state.reportDate + '_' + Date.now(),
        reportDate: state.reportDate,
        formattedDate: formatDisplayDate(state.reportDate),
        createdAt: Date.now(),
        totalPhotos: stats.grandTotal,
        generalPhotos: stats.totalGeneral,
        washroomPhotos: stats.totalWashroom,
        floorsDocumented: stats.floorsWithPhotos,
        totalPages: result.totalPages,
        fileName: result.fileName,
        pdfBlob: result.blob,
        floors: JSON.parse(JSON.stringify(state.floors)) // Complete snapshot of photos!
      };
      await saveReportToHistory(historyRecord);
      state.reportHistory = await getReportHistory();
      updateHistoryBadge();
    } catch (saveErr) {
      console.warn('Could not auto-archive report to history:', saveErr);
    }

    if (modalGen) modalGen.classList.remove('active');

    // Show PDF Success Modal
    const modalSuccess = document.getElementById('modal-pdf-success');
    const filenameEl = document.getElementById('pdf-success-filename');
    const detailsEl = document.getElementById('pdf-success-details');
    const btnDownload = document.getElementById('btn-download-pdf');

    if (filenameEl) filenameEl.textContent = result.fileName;
    if (detailsEl) {
      const sizeStr = formatBytes(result.blob.size);
      detailsEl.textContent = `Total Pages: ${result.totalPages} | File Size: ${sizeStr} | Inspection Date: ${formatDisplayDate(state.reportDate)}`;
    }

    if (btnDownload) {
      btnDownload.style.display = 'inline-flex';
    }

    if (modalSuccess) modalSuccess.classList.add('active');

    showToast('Daily Cleaning Report PDF generated & saved to History!', 'success');
  } catch (err) {
    console.error('PDF Generation Error:', err);
    if (modalGen) modalGen.classList.remove('active');
    showToast(`Failed to generate PDF: ${err.message}`, 'error');
  } finally {
    state.isGenerating = false;
  }
}

/**
 * Handles PDF Download
 */
function handleDownloadPdfClick() {
  if (!state.lastGeneratedPdf) {
    showToast('Please generate the PDF report first.', 'warning');
    return;
  }

  const { blob, fileName } = state.lastGeneratedPdf;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast(`Downloading ${fileName}...`, 'success');
}

/**
 * App Initialization: Loads IndexedDB draft & past reports history
 */
async function initApp() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
    });
  }

  try {
    state.reportHistory = await getReportHistory();
    const lastDate = await getLastActiveDate();
    const activeDate = lastDate || getTodayYMD();
    state.reportDate = activeDate;

    const draft = await loadDraft(activeDate);
    const reconciled = draft ? reconcileFloors(draft.floors) : null;
    if (reconciled) {
      state.floors = reconciled;
    }

    renderApp();
    const stats = getStats();
    if (stats.grandTotal > 0) {
      showToast(`Restored draft for ${formatDisplayDate(activeDate)} (${stats.grandTotal} photos).`, 'info');
    }
  } catch (err) {
    console.warn('Draft initialization failed:', err);
    renderApp();
  }
}

// Start application
initApp();
