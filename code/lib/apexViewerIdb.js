const DB_NAME = 'sfocApexViewer';
const DB_VERSION = 1;
const STORE = 'payloads';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

/**
 * Guarda título + contenido para abrir apex-log-viewer sin pasar por chrome.storage (cuota) ni mensajes grandes al SW.
 * @param {string} id
 * @param {{ title: string, content: string }} record
 */
export async function apexViewerIdbPut(id, record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(record, id);
  });
}

/**
 * Lee y borra la entrada (un solo uso).
 * @param {string} id
 * @returns {Promise<{ title: string, content: string } | null>}
 */
export async function apexViewerIdbTake(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const g = store.get(id);
    g.onsuccess = () => {
      const v = g.result;
      if (v) store.delete(id);
      resolve(v || null);
    };
    g.onerror = () => reject(g.error);
  });
}
