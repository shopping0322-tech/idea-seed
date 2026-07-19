const DATABASE_NAME = "idea-seed";
const DATABASE_VERSION = 1;
export const CHUNK_SIZE = 5_000;

let databasePromise;

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("データベース処理が中断されました"));
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore("meta", { keyPath: "key" });
      database.createObjectStore("categories", { keyPath: "id" });
      const chunks = database.createObjectStore("chunks", { keyPath: ["categoryId", "index"] });
      chunks.createIndex("byCategory", "categoryId", { unique: false });
      const history = database.createObjectStore("history", { keyPath: "id" });
      history.createIndex("byCreatedAt", "createdAt", { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

export async function getDatasetSnapshot() {
  const database = await openDatabase();
  const transaction = database.transaction(["meta", "categories"], "readonly");
  const done = transactionDone(transaction);
  const manifestRequest = transaction.objectStore("meta").get("manifest");
  const categoriesRequest = transaction.objectStore("categories").getAll();
  const [manifestRecord, categories] = await Promise.all([
    requestAsPromise(manifestRequest),
    requestAsPromise(categoriesRequest),
  ]);
  await done;
  return {
    manifest: manifestRecord?.value ?? null,
    categories: categories.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
  };
}

export async function installDataset(manifest, preparedCategories) {
  const database = await openDatabase();
  const transaction = database.transaction(["meta", "categories", "chunks"], "readwrite");
  const done = transactionDone(transaction);
  const categoryStore = transaction.objectStore("categories");
  const chunkStore = transaction.objectStore("chunks");
  const existing = await requestAsPromise(categoryStore.getAll());
  const existingById = new Map(existing.map((category) => [category.id, category]));
  const incomingIds = new Set(manifest.categories.map((category) => category.id));

  for (const category of existing) {
    if (!incomingIds.has(category.id)) {
      categoryStore.delete(category.id);
      chunkStore.delete(categoryChunkRange(category.id));
    }
  }

  for (const definition of manifest.categories) {
    const prepared = preparedCategories.get(definition.id);
    if (prepared) {
      chunkStore.delete(categoryChunkRange(definition.id));
      prepared.chunks.forEach((values, index) => {
        chunkStore.put({ categoryId: definition.id, index, values });
      });
      categoryStore.put({
        id: definition.id,
        label: definition.label,
        order: definition.order,
        version: definition.version,
        count: prepared.count,
        chunkSize: CHUNK_SIZE,
        chunkCount: prepared.chunks.length,
      });
    } else {
      const installed = existingById.get(definition.id);
      if (!installed) {
        transaction.abort();
        throw new Error(`カテゴリデータがありません: ${definition.id}`);
      }
      categoryStore.put({ ...installed, label: definition.label, order: definition.order, version: definition.version });
    }
  }

  transaction.objectStore("meta").put({ key: "manifest", value: manifest });
  await done;
}

export async function getEntryAt(category, entryIndex) {
  if (!Number.isSafeInteger(entryIndex) || entryIndex < 0 || entryIndex >= category.count) {
    throw new RangeError(`抽選インデックスが範囲外です: ${entryIndex}`);
  }
  const chunkIndex = Math.floor(entryIndex / category.chunkSize);
  const offset = entryIndex % category.chunkSize;
  const database = await openDatabase();
  const transaction = database.transaction("chunks", "readonly");
  const done = transactionDone(transaction);
  const chunk = await requestAsPromise(transaction.objectStore("chunks").get([category.id, chunkIndex]));
  await done;
  const value = chunk?.values?.[offset];
  if (typeof value !== "string") throw new Error(`抽選データを取得できません: ${category.id}`);
  return value;
}

export async function addHistory(record) {
  const database = await openDatabase();
  const transaction = database.transaction("history", "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore("history").put(record);
  await done;
}

export async function deleteHistory(id) {
  const database = await openDatabase();
  const transaction = database.transaction("history", "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore("history").delete(id);
  await done;
}

export async function clearHistory() {
  const database = await openDatabase();
  const transaction = database.transaction("history", "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore("history").clear();
  await done;
}

export async function getHistoryOldestFirst() {
  const database = await openDatabase();
  const transaction = database.transaction("history", "readonly");
  const done = transactionDone(transaction);
  const records = await requestAsPromise(transaction.objectStore("history").getAll());
  await done;
  return records.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

function categoryChunkRange(categoryId) {
  return IDBKeyRange.bound([categoryId, 0], [categoryId, Number.MAX_SAFE_INTEGER]);
}
