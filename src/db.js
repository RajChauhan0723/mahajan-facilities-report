// IndexedDB persistence for Mahajan Facilities Daily Cleaning Report
const DB_NAME = 'MahajanHousekeepingDB';
const DB_VERSION = 2;
const DRAFT_STORE = 'report_draft';
const HISTORY_STORE = 'report_history';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE);
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        const historyStore = db.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
        historyStore.createIndex('reportDate', 'reportDate', { unique: false });
        historyStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open database'));
    };
  });
}

function getDraftKey(reportDate) {
  return 'draft_' + (reportDate || 'default');
}

// ==========================================
// DATE-SPECIFIC DRAFT PERSISTENCE
// Each date has its own independent draft!
// ==========================================

export async function saveDraft(reportDate, floorsData) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE);
      
      const payload = {
        reportDate: reportDate,
        floors: floorsData,
        savedAt: Date.now()
      };

      store.put(payload, getDraftKey(reportDate));
      store.put(reportDate, 'last_active_date');

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Could not auto-save draft to IndexedDB:', err);
    return false;
  }
}

export async function loadDraft(reportDate) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readonly');
      const store = tx.objectStore(DRAFT_STORE);
      const req = store.get(getDraftKey(reportDate));

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Could not load draft from IndexedDB:', err);
    return null;
  }
}

export async function clearDraft(reportDate) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE);
      store.delete(getDraftKey(reportDate));

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Could not clear draft from IndexedDB:', err);
    return false;
  }
}

export async function getLastActiveDate() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readonly');
      const store = tx.objectStore(DRAFT_STORE);
      const req = store.get('last_active_date');

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

// ==========================================
// REPORT HISTORY PERSISTENCE (Past days' generated reports)
// ==========================================

export async function saveReportToHistory(report) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      const req = store.put(report);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Could not save report to history:', err);
    return false;
  }
}

export async function getReportHistory() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readonly');
      const store = tx.objectStore(HISTORY_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(list);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Could not get report history:', err);
    return [];
  }
}

export async function deleteReportFromHistory(id) {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Could not delete report from history:', err);
    return false;
  }
}

export async function clearAllReportHistory() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HISTORY_STORE, 'readwrite');
      const store = tx.objectStore(HISTORY_STORE);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('Could not clear report history:', err);
    return false;
  }
}
