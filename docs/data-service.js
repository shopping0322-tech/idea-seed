import { CHUNK_SIZE, getDatasetSnapshot, installDataset } from "./data-store.js";

export function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error("未対応のmanifestです");
  if (typeof manifest.dataVersion !== "string" || !manifest.dataVersion) throw new Error("dataVersionが不正です");
  if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) throw new Error("カテゴリがありません");

  const ids = new Set();
  const paths = new Set();
  for (const category of manifest.categories) {
    if (!category?.id || !category?.label || !Number.isInteger(category.order) || !Number.isInteger(category.version)) {
      throw new Error("カテゴリ定義が不正です");
    }
    if (ids.has(category.id)) throw new Error(`カテゴリIDが重複しています: ${category.id}`);
    ids.add(category.id);
    if (!Array.isArray(category.files) || category.files.length === 0) throw new Error(`ファイルがありません: ${category.id}`);
    for (const file of category.files) {
      if (!file?.path || !Number.isInteger(file.count) || file.count <= 0 || typeof file.sha256 !== "string") {
        throw new Error(`ファイル定義が不正です: ${category.id}`);
      }
      if (paths.has(file.path)) throw new Error(`ファイルパスが重複しています: ${file.path}`);
      paths.add(file.path);
    }
  }
  return manifest;
}

export async function loadDataset() {
  const local = await getDatasetSnapshot();
  try {
    const manifest = validateManifest(await fetchJsonWithCacheBust("manifest.json", Date.now().toString()));
    const localById = new Map(local.categories.map((category) => [category.id, category]));
    const changed = manifest.categories.filter((category) => localById.get(category.id)?.version !== category.version);
    const localIds = new Set(local.categories.map((category) => category.id));
    const removed = [...localIds].some((id) => !manifest.categories.some((category) => category.id === id));
    const metadataChanged = local.manifest?.dataVersion !== manifest.dataVersion;

    if (changed.length > 0 || removed || metadataChanged) {
      const prepared = new Map();
      for (const category of changed) {
        prepared.set(category.id, await prepareCategory(category));
      }
      await installDataset(manifest, prepared);
    }

    const installed = await getDatasetSnapshot();
    if (installed.categories.length === 0) throw new Error("利用できるカテゴリがありません");
    return {
      ...installed,
      source: changed.length > 0 ? "updated" : "online",
      updatedCategoryCount: changed.length,
    };
  } catch (error) {
    if (local.categories.length > 0) return { ...local, source: "offline", error };
    throw error;
  }
}

async function prepareCategory(category) {
  const values = [];
  for (const file of category.files) {
    const response = await fetchWithCacheBust(file.path, file.sha256);
    const bytes = await response.arrayBuffer();
    const digest = await sha256Hex(bytes);
    if (digest !== file.sha256.toLowerCase()) throw new Error(`SHA-256が一致しません: ${file.path}`);
    let decoded;
    try {
      decoded = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error(`JSONを解析できません: ${file.path}`);
    }
    if (!Array.isArray(decoded) || !decoded.every((value) => typeof value === "string")) {
      throw new Error(`文字列配列ではありません: ${file.path}`);
    }
    if (decoded.length !== file.count) throw new Error(`件数が一致しません: ${file.path}`);
    values.push(...decoded);
  }

  if (values.some((value) => value.trim().length === 0)) throw new Error(`空文字列があります: ${category.id}`);
  if (new Set(values).size !== values.length) throw new Error(`重複データがあります: ${category.id}`);

  const chunks = [];
  for (let index = 0; index < values.length; index += CHUNK_SIZE) {
    chunks.push(values.slice(index, index + CHUNK_SIZE));
  }
  return { count: values.length, chunks };
}

async function fetchJsonWithCacheBust(path, version) {
  const response = await fetchWithCacheBust(path, version);
  return response.json();
}

async function fetchWithCacheBust(path, version) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("v", version);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`データ取得に失敗しました: ${path} (${response.status})`);
  return response;
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
