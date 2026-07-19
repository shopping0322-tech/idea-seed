import { loadDataset } from "./data-service.js";
import { addHistory, clearHistory, deleteHistory, getEntryAt, getHistoryOldestFirst } from "./data-store.js";
import { secureRandomInteger } from "./random.js";

const HISTORY_SORT_STORAGE_KEY = "idea-seed-history-sort";
const GENERATORS = new Map([
  ["scene", {
    id: "scene",
    label: "シーン生成",
    description: "4つの独立した種を組み合わせる",
    generateLabel: "シーンを生成",
    manifestPath: "manifest.json",
  }],
  ["logline", {
    id: "logline",
    label: "ログライン生成",
    description: "物語の核になる6つの材料を引く",
    generateLabel: "材料を生成",
    manifestPath: "logline/manifest.json",
  }],
]);

const elements = {
  appTitle: document.querySelector("#app-title"),
  appShell: document.querySelector(".app-shell"),
  menuButton: document.querySelector("#menu-button"),
  modeContext: document.querySelector("#mode-context"),
  modeDescription: document.querySelector("#mode-description"),
  menuCards: [...document.querySelectorAll("[data-generator-id]")],
  tabBar: document.querySelector(".tab-bar"),
  generateButton: document.querySelector("#generate-button"),
  generateLabel: document.querySelector(".generate-label"),
  generatorMessage: document.querySelector("#generator-message"),
  actionFooter: document.querySelector(".action-footer"),
  resultList: document.querySelector("#result-list"),
  historyList: document.querySelector("#history-list"),
  historyCount: document.querySelector("#history-count"),
  historySearch: document.querySelector("#history-search"),
  historySort: document.querySelector("#history-sort"),
  clearHistoryButton: document.querySelector("#clear-history-button"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmDialogTitle: document.querySelector("#confirm-dialog-title"),
  confirmDialogMessage: document.querySelector("#confirm-dialog-message"),
  confirmCancelButton: document.querySelector("#confirm-cancel-button"),
  confirmDeleteButton: document.querySelector("#confirm-delete-button"),
  tabs: [...document.querySelectorAll(".tab-button")],
  panels: [...document.querySelectorAll(".view-panel")],
};

let currentGenerator = null;
let categories = [];
let generating = false;
let transitioning = false;
let loadingSequence = 0;
let historyRecords = [];
let pendingDeleteAction = null;

start();

function start() {
  bindEvents();
  registerServiceWorker();
  showView("menu");
  document.body.dataset.appReady = "true";
}

function bindEvents() {
  elements.menuCards.forEach((card) => card.addEventListener("click", () => selectGenerator(card.dataset.generatorId, card)));
  elements.menuButton.addEventListener("click", () => {
    if (!generating) returnToMenu();
  });
  elements.generateButton.addEventListener("click", generate);
  elements.historySearch.addEventListener("input", renderHistoryList);
  elements.historySort.addEventListener("change", changeHistorySort);
  elements.clearHistoryButton.addEventListener("click", clearAllHistory);
  elements.historyList.addEventListener("click", handleHistoryClick);
  elements.confirmCancelButton.addEventListener("click", () => elements.confirmDialog.close());
  elements.confirmDeleteButton.addEventListener("click", confirmDelete);
  elements.confirmDialog.addEventListener("close", resetConfirmation);
  elements.tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
}

async function selectGenerator(generatorId, selectedCard) {
  const generator = GENERATORS.get(generatorId);
  if (!generator || generating || transitioning) return;

  const sequence = ++loadingSequence;
  currentGenerator = generator;
  document.body.dataset.generator = generator.id;
  categories = [];
  historyRecords = [];
  elements.historySearch.value = "";
  restoreHistorySort();
  resetResult();
  setMessage("データを読み込んでいます…");
  elements.generateButton.disabled = true;
  const datasetPromise = loadDataset({ datasetId: generator.id, manifestPath: generator.manifestPath })
    .then((dataset) => ({ dataset }))
    .catch((error) => ({ error }));
  await transitionToGenerator(selectedCard);
  if (sequence !== loadingSequence || currentGenerator?.id !== generator.id) return;
  applyGeneratorIdentity(generator);
  showView("generator");
  animateScreenIn("forward");

  try {
    const result = await datasetPromise;
    if (result.error) throw result.error;
    const { dataset } = result;
    if (sequence !== loadingSequence || currentGenerator?.id !== generator.id) return;
    categories = dataset.categories;
    elements.generateButton.disabled = false;
    if (dataset.source === "updated") {
      setMessage("最新データを保存しました。次回からオフラインでも利用できます。");
    } else if (dataset.source === "offline") {
      setMessage("保存済みデータを使用しています。");
    } else {
      setMessage("");
    }
    await renderHistory();
  } catch (error) {
    if (sequence !== loadingSequence) return;
    setMessage(error.message ?? "データを読み込めませんでした。", true);
  }
}

function applyGeneratorIdentity(generator) {
  elements.appTitle.textContent = generator.label;
  elements.modeDescription.textContent = generator.description;
  elements.generateLabel.textContent = generator.generateLabel;
}

async function transitionToGenerator(selectedCard) {
  transitioning = true;
  cancelScreenAnimations();
  selectedCard?.classList.add("is-launching");
  if (!prefersReducedMotion()) {
    await elements.appShell.animate([
      { opacity: 1, transform: "translateX(0) scale(1)" },
      { opacity: 0, transform: "translateX(-22px) scale(0.992)" },
    ], { duration: 210, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }).finished;
  }
  selectedCard?.classList.remove("is-launching");
  transitioning = false;
}

async function returnToMenu() {
  if (transitioning) return;
  transitioning = true;
  cancelScreenAnimations();
  if (!prefersReducedMotion()) {
    await elements.appShell.animate([
      { opacity: 1, transform: "translateX(0) scale(1)" },
      { opacity: 0, transform: "translateX(22px) scale(0.992)" },
    ], { duration: 180, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }).finished;
  }
  showView("menu");
  transitioning = false;
  animateScreenIn("back");
}

function animateScreenIn(direction) {
  cancelScreenAnimations();
  if (prefersReducedMotion()) {
    return;
  }
  const offset = direction === "forward" ? "22px" : "-22px";
  const animation = elements.appShell.animate([
    { opacity: 0, transform: `translateX(${offset}) scale(0.992)` },
    { opacity: 1, transform: "translateX(0) scale(1)" },
  ], { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" });
  animation.finished.then(() => animation.cancel()).catch(() => {});
}

function cancelScreenAnimations() {
  elements.appShell.getAnimations().forEach((animation) => animation.cancel());
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function generate() {
  if (generating || !currentGenerator || categories.length === 0) return;
  generating = true;
  elements.generateButton.disabled = true;
  elements.generateButton.classList.add("is-generating");
  setMessage("");
  try {
    const items = await Promise.all(categories.map(async (category) => {
      const index = secureRandomInteger(category.count);
      return {
        categoryId: category.categoryId ?? category.id,
        categoryLabel: category.label,
        displayOrder: category.order,
        value: await getEntryAt(category, index),
      };
    }));
    const record = {
      id: crypto.randomUUID(),
      generatorId: currentGenerator.id,
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
    elements.generateButton.disabled = categories.length === 0;
    elements.generateButton.classList.remove("is-generating");
  }
}

function resetResult() {
  elements.resultList.innerHTML = `
    <div class="empty-state">
      <span class="seed-mark" aria-hidden="true">✦</span>
      <p>ボタンを押すと、独立したランダム抽選を行います。</p>
    </div>`;
}

function renderResult(record) {
  elements.resultList.replaceChildren(...record.items.map((item, index) => {
    const card = document.createElement("article");
    card.className = "result-card";
    card.style.setProperty("--reveal-index", index);
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
  if (!currentGenerator) return;
  try {
    historyRecords = await getHistoryOldestFirst(currentGenerator.id);
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
  deleteButton.setAttribute("aria-label", "この履歴を削除");
  deleteButton.textContent = "×";
  card.append(time, list, deleteButton);
  return card;
}

function handleHistoryClick(event) {
  const button = event.target.closest("[data-delete-history-id]");
  if (!button) return;
  const historyId = button.dataset.deleteHistoryId;
  openConfirmation({
    title: "この履歴を削除しますか？",
    message: "削除した履歴は元に戻せません。",
    action: async () => {
      await deleteHistory(historyId);
      historyRecords = historyRecords.filter((record) => record.id !== historyId);
      renderHistoryList();
    },
  });
}

function clearAllHistory() {
  if (!currentGenerator || historyRecords.length === 0) return;
  const generatorId = currentGenerator.id;
  openConfirmation({
    title: "履歴をすべて削除しますか？",
    message: `${historyRecords.length}件の履歴を削除します。この操作は元に戻せません。`,
    action: async () => {
      await clearHistory(generatorId);
      historyRecords = [];
      renderHistoryList();
    },
  });
}

function openConfirmation({ title, message, action }) {
  pendingDeleteAction = action;
  elements.confirmDialogTitle.textContent = title;
  elements.confirmDialogMessage.textContent = message;
  elements.confirmDeleteButton.disabled = false;
  elements.confirmDialog.showModal();
}

async function confirmDelete() {
  if (!pendingDeleteAction) return;
  elements.confirmDeleteButton.disabled = true;
  try {
    await pendingDeleteAction();
    elements.confirmDialog.close();
  } catch (error) {
    elements.confirmDeleteButton.disabled = false;
    elements.confirmDialogMessage.textContent = error.message ?? "履歴を削除できませんでした。";
  }
}

function resetConfirmation() {
  pendingDeleteAction = null;
  elements.confirmDeleteButton.disabled = false;
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

function historySortStorageKey() {
  return currentGenerator?.id === "scene"
    ? HISTORY_SORT_STORAGE_KEY
    : `${HISTORY_SORT_STORAGE_KEY}:${currentGenerator?.id ?? "scene"}`;
}

function restoreHistorySort() {
  try {
    const savedSort = localStorage.getItem(historySortStorageKey());
    elements.historySort.value = savedSort === "oldest" ? "oldest" : "newest";
  } catch {
    elements.historySort.value = "newest";
  }
}

function changeHistorySort() {
  try {
    localStorage.setItem(historySortStorageKey(), elements.historySort.value);
  } catch {
    // 保存できない環境でも、現在の画面では選択した並び順を使用する。
  }
  renderHistoryList();
}

function showView(name) {
  const showingMenu = name === "menu";
  if (showingMenu && currentGenerator) {
    loadingSequence += 1;
    currentGenerator = null;
    categories = [];
    historyRecords = [];
    elements.generateButton.disabled = true;
  }
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
  elements.tabBar.hidden = showingMenu;
  elements.menuButton.hidden = showingMenu;
  elements.modeContext.hidden = showingMenu;
  elements.actionFooter.hidden = name !== "generator" || !currentGenerator;
  if (showingMenu) {
    elements.appTitle.textContent = "発想の種";
    delete document.body.dataset.generator;
  }
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
