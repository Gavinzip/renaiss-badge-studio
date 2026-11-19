let connection;

function openDatabase() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('renaiss-badge-wall', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('collections');
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); connection = undefined; };
        resolve(database);
      };
      request.onerror = () => reject(request.error);
    }).catch(error => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

export async function readStudio() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('collections', 'readonly');
    const store = transaction.objectStore('collections');
    const collection = store.get('active');
    const settings = store.get('settings');
    transaction.oncomplete = () => resolve({ collection: collection.result, settings: settings.result });
    transaction.onabort = () => reject(transaction.error ?? new Error('讀取本機收藏已中止。'));
  });
}

export async function saveStudio(collection, settings) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('collections', 'readwrite');
    const store = transaction.objectStore('collections');
    store.put(collection, 'active');
    store.put(settings, 'settings');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('儲存本機設定已中止。'));
  });
}
