import { loadDataset } from "./data-service.js";
import { addHistory, clearHistory, deleteHistory, getEntryAt, getHistoryOldestFirst } from "./data-store.js";
import { secureRandomInteger } from "./random.js";

const elements = {
  generateButton: document.querySelector("#generate-button"),
  generatorMessage: document.querySelector("#generator-message"),
  actionFooter: document.querySelector(".action-footer"),
  resultList: document.querySelector("#result-list"),
  historyList: document.querySelector("#history-list"),
  historyCount: document.querySelector("#history-count"),
  historySearch: document.querySelector("#history-search"),
  historySort: document.querySelector("#history-sort"),
  clearHistoryButton: document.querySelector("#clear-history-button"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".view-panel")],
};

let categories = [];
let generating = false;
let historyRecords = [];

start();

async function start() {
  bindEvents();
  registerServiceWorker();
  try {
    const dataset = await loadDataset();
    categories = dataset.categories;
    elements.generateButton.disabled = false;
    if (dataset.source === "updated") {
      setMessage("最新データを保存しました。次回からオフラインでも利用できます。");
    } else if (dataset.source === "offline") {
      setMessage("保存済みデータを使用しています。");
    }
  } catch (error) {
    setMessage(error.message ?? "データを読み込めませんでした。", true);
  }
  await renderHistory();
}

function bindEvents() {
  elements.generateButton.addEventListener("click", generate);
  elements.historySearch.addEventListener("input", renderHistoryList);
  elements.historySort.addEventListener("change", renderHistoryList);
  elements.clearHistoryButton.addEventListener("click", clearAllHistory);
  elements.historyList.addEventListener("click", handleHistoryClick);
  elements.tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
}

async function generate() {
  if (generating || categories.length === 0) return;
  generating = true;
  elements.generateButton.disabled = true;
  setMessage("");
  try {
    const items = await Promise.all(categories.map(async (category) => {
      const index = secureRandomInteger(category.count);
      return {
        categoryId: category.id,
        categoryLabel: category.label,
        displayOrder: category.order,
        value: await getEntryAt(category, index),
      };
    }));
    const record = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      items: items.sort((a, b) => a.displayOrder - b.displayOrder),
    };
    await addHistory(record);
    renderResult(record);
    await renderHistory();
  } catch (error) {
    setMessage(error.message ?? "抽選に失敗しました。", true);
  } finally {
    generating = false;
    elements.generateButton.disabled = false;
  }
}

function renderResult(record) {
  elements.resultList.replaceChildren(...record.items.map((item) => {
    const card = document.createElement("article");
    card.className = "result-card";
    const label = document.createElement("p");
    label.className = "category-label";
    label.textContent = item.categoryLabel;
    const value = document.createElement("p");
    value.className = "result-value";
    value.textContent = item.value;
    card.append(label, value);
    return card;
  }));
}

async function renderHistory() {
  try {
    historyRecords = await getHistoryOldestFirst();
    renderHistoryList();
  } catch (error) {
    elements.historyList.textContent = error.message ?? "履歴を読み込めませんでした。";
  }
}

function renderHistoryList() {
  const query = normalizeSearchText(elements.historySearch.value);
  const filtered = historyRecords
    .filter((record) => !query || historySearchText(record).includes(query))
    .sort((a, b) => {
      const direction = elements.historySort.value === "newest" ? -1 : 1;
      return direction * (a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    });

  elements.historyCount.textContent = query ? `${filtered.length}/${historyRecords.length}件` : `${historyRecords.length}件`;
  elements.clearHistoryButton.disabled = historyRecords.length === 0;

  if (historyRecords.length === 0) {
    elements.historyList.innerHTML = '<div class="empty-state compact"><p>生成履歴はまだありません。</p></div>';
    return;
  }
  if (filtered.length === 0) {
    elements.historyList.innerHTML = '<div class="empty-state compact"><p>一致する履歴はありません。</p></div>';
    return;
  }
  elements.historyList.replaceChildren(...filtered.map(createHistoryCard));
}

function createHistoryCard(record) {
  const card = document.createElement("article");
  card.className = "history-card";
  card.dataset.historyId = record.id;
  const time = document.createElement("p");
  time.className = "history-time";
  time.textContent = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(record.createdAt));
  const list = document.createElement("dl");
  list.className = "history-items";
  record.items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-row";
    const term = document.createElement("dt");
    term.textContent = item.categoryLabel;
    const description = document.createElement("dd");
    description.textContent = item.value;
    row.append(term, description);
    list.append(row);
  });
  const deleteButton = document.createElement("button");
  deleteButton.className = "history-delete-button";
  deleteButton.type = "button";
  deleteButton.dataset.deleteHistoryId = record.id;
  deleteButton.textContent = "削除";
  card.append(time, list, deleteButton);
  return card;
}

async function handleHistoryClick(event) {
  const button = event.target.closest("[data-delete-history-id]");
  if (!button) return;
  button.disabled = true;
  try {
    await deleteHistory(button.dataset.deleteHistoryId);
    historyRecords = historyRecords.filter((record) => record.id !== button.dataset.deleteHistoryId);
    renderHistoryList();
  } catch (error) {
    button.disabled = false;
    elements.historyList.textContent = error.message ?? "履歴を削除できませんでした。";
  }
}

async function clearAllHistory() {
  if (historyRecords.length === 0) return;
  if (!confirm("履歴をすべて削除しますか？")) return;
  elements.clearHistoryButton.disabled = true;
  try {
    await clearHistory();
    historyRecords = [];
    renderHistoryList();
  } catch (error) {
    elements.clearHistoryButton.disabled = false;
    elements.historyList.textContent = error.message ?? "履歴を削除できませんでした。";
  }
}

function historySearchText(record) {
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(record.createdAt));
  return normalizeSearchText([
    date,
    ...record.items.flatMap((item) => [item.categoryLabel, item.value]),
  ].join(" "));
}

function normalizeSearchText(text) {
  return text.normalize("NFKC").trim().toLowerCase();
}

function showView(name) {
  elements.tabs.forEach((tab) => {
    const selected = tab.dataset.view === name;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  elements.panels.forEach((panel) => {
    const selected = panel.id === `${name}-view`;
    panel.classList.toggle("is-active", selected);
    panel.hidden = !selected;
  });
  elements.actionFooter.hidden = name !== "generator";
}

function setMessage(text, isError = false) {
  elements.generatorMessage.textContent = text;
  elements.generatorMessage.classList.toggle("is-error", isError);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("service-worker.js", { scope: "./" });
  } catch (error) {
    console.warn("Service Worker registration failed", error);
  }
}
