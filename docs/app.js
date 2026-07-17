import { loadDataset } from "./data-service.js";
import { addHistory, getEntryAt, getHistoryOldestFirst } from "./data-store.js";
import { secureRandomInteger } from "./random.js";

const elements = {
  connectionStatus: document.querySelector("#connection-status"),
  generateButton: document.querySelector("#generate-button"),
  generatorMessage: document.querySelector("#generator-message"),
  resultList: document.querySelector("#result-list"),
  historyList: document.querySelector("#history-list"),
  historyCount: document.querySelector("#history-count"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".view-panel")],
};

let categories = [];
let generating = false;

start();

async function start() {
  bindEvents();
  registerServiceWorker();
  updateConnectionIndicator();
  try {
    const dataset = await loadDataset();
    categories = dataset.categories;
    elements.generateButton.disabled = false;
    if (dataset.source === "updated") {
      setStatus(`更新済み ${dataset.updatedCategoryCount}カテゴリ`, "online");
      setMessage("最新データを保存しました。次回からオフラインでも利用できます。");
    } else if (dataset.source === "offline") {
      setStatus("オフライン", "error");
      setMessage("保存済みデータを使用しています。");
    } else {
      setStatus("準備完了", "online");
    }
  } catch (error) {
    setStatus("読込失敗", "error");
    setMessage(error.message ?? "データを読み込めませんでした。", true);
  }
  await renderHistory();
}

function bindEvents() {
  elements.generateButton.addEventListener("click", generate);
  elements.tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
  window.addEventListener("online", updateConnectionIndicator);
  window.addEventListener("offline", updateConnectionIndicator);
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
    const history = await getHistoryOldestFirst();
    elements.historyCount.textContent = `${history.length}件`;
    if (history.length === 0) {
      elements.historyList.innerHTML = '<div class="empty-state compact"><p>生成履歴はまだありません。</p></div>';
      return;
    }
    elements.historyList.replaceChildren(...history.map(createHistoryCard));
  } catch (error) {
    elements.historyList.textContent = error.message ?? "履歴を読み込めませんでした。";
  }
}

function createHistoryCard(record) {
  const card = document.createElement("article");
  card.className = "history-card";
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
  card.append(time, list);
  return card;
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
  elements.generateButton.hidden = name !== "generator";
}

function updateConnectionIndicator() {
  if (!navigator.onLine) setStatus("オフライン", "error");
}

function setStatus(text, state = "") {
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.classList.toggle("is-online", state === "online");
  elements.connectionStatus.classList.toggle("is-error", state === "error");
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
