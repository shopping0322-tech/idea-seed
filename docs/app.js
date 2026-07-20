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
  appHeader: document.querySelector(".app-header"),
  menuButton: document.querySelector("#menu-button"),
  modeContext: document.querySelector("#mode-context"),
  modeDescription: document.querySelector("#mode-description"),
  menuCards: [...document.querySelectorAll("[data-generator-id]")],
  tabBar: document.querySelector(".tab-bar"),
  generateButton: document.querySelector("#generate-button"),
  generateLabel: document.querySelector(".generate-label"),
  generatorMessage: document.querySelector("#generator-message"),
  actionFooter: document.querySelector(".action-footer"),
  resultFavoriteButton: document.querySelector("#result-favorite-button"),
  resultList: document.querySelector("#result-list"),
  historyList: document.querySelector("#history-list"),
  historyCount: document.querySelector("#history-count"),
  historySearch: document.querySelector("#history-search"),
  historySort: document.querySelector("#history-sort"),
  historyFilters: [...document.querySelectorAll("[data-history-filter]")],
  historyFilter: document.querySelector(".history-filter"),
  historyTotalFilterCount: document.querySelector("#history-total-filter-count"),
  favoriteCount: document.querySelector("#favorite-count"),
  clearHistoryButton: document.querySelector("#clear-history-button"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmDialogTitle: document.querySelector("#confirm-dialog-title"),
  confirmDialogMessage: document.querySelector("#confirm-dialog-message"),
  confirmFavoritesOption: document.querySelector("#confirm-favorites-option"),
  confirmIncludeFavorites: document.querySelector("#confirm-include-favorites"),
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
let currentResultRecord = null;
let historyFilter = "all";
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
  elements.resultFavoriteButton.addEventListener("click", () => toggleFavorite(currentResultRecord?.id));
  elements.historySearch.addEventListener("input", renderHistoryList);
  elements.historySort.addEventListener("change", changeHistorySort);
  elements.clearHistoryButton.addEventListener("click", clearAllHistory);
  elements.historyList.addEventListener("click", handleHistoryClick);
  elements.historyFilters.forEach((button) => button.addEventListener("click", () => changeHistoryFilter(button.dataset.historyFilter)));
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
  historyFilter = "all";
  updateHistoryFilterButtons();
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
  if (!prefersReducedMotion()) {
    if (selectedCard) {
      const pulse = selectedCard.animate([
        { transform: "scale(1)", filter: "brightness(1)" },
        { transform: "scale(1.025)", filter: "brightness(1.12)", offset: 0.55 },
        { transform: "scale(1)", filter: "brightness(1)" },
      ], { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      await animationFinished(pulse);
    }
    const menuExit = document.querySelector("#menu-view").animate([
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
      { opacity: 0, transform: "translateY(-10px) scale(0.985)", filter: "blur(4px)" },
    ], { duration: 180, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
    await animationFinished(menuExit);
  }
  transitioning = false;
}

async function returnToMenu() {
  if (transitioning) return;
  transitioning = true;
  cancelScreenAnimations();
  if (!prefersReducedMotion()) {
    const visiblePanel = elements.panels.find((panel) => !panel.hidden);
    const exitTargets = [elements.appHeader, elements.modeContext, elements.tabBar, visiblePanel].filter(Boolean);
    const exits = exitTargets.map((target, index) => target.animate([
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0, transform: "translateY(8px)" },
    ], {
      duration: 150,
      delay: index * 14,
      easing: "cubic-bezier(0.4, 0, 1, 1)",
      fill: "forwards",
    }));
    await Promise.all(exits.map(animationFinished));
  }
  showView("menu");
  transitioning = false;
  animateScreenIn("back");
}

function animateScreenIn(direction) {
  cancelScreenAnimations();
  if (prefersReducedMotion()) return;
  const activePanel = elements.panels.find((panel) => !panel.hidden);
  const targets = direction === "forward"
    ? [elements.appHeader, elements.modeContext, elements.tabBar, activePanel]
    : [elements.appHeader, ...elements.menuCards];
  targets.filter(Boolean).forEach((target, index) => {
    const animation = target.animate([
      { opacity: 0, transform: "translateY(14px) scale(0.99)", filter: "blur(3px)" },
      { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
    ], {
      duration: 340,
      delay: index * 42,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "both",
    });
    animationFinished(animation).then(() => animation.cancel());
  });
  if (direction === "forward") {
    const footerAnimation = elements.actionFooter.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 260, delay: 150, easing: "ease-out", fill: "both" },
    );
    animationFinished(footerAnimation).then(() => footerAnimation.cancel());
  }
}

function cancelScreenAnimations() {
  [
    elements.appShell,
    elements.appHeader,
    elements.modeContext,
    elements.tabBar,
    elements.actionFooter,
    ...elements.panels,
    ...elements.menuCards,
  ].filter(Boolean).forEach((element) => element.getAnimations().forEach((animation) => animation.cancel()));
}

function animationFinished(animation) {
  return animation.finished.catch(() => {});
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
      isFavorite: false,
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
  currentResultRecord = null;
  elements.resultFavoriteButton.disabled = true;
  updateFavoriteButton(elements.resultFavoriteButton, false);
  elements.resultList.innerHTML = `
    <div class="empty-state">
      <span class="seed-mark" aria-hidden="true">✦</span>
      <p>ボタンを押すと、独立したランダム抽選を行います。</p>
    </div>`;
}

function renderResult(record) {
  currentResultRecord = record;
  elements.resultFavoriteButton.disabled = false;
  updateFavoriteButton(elements.resultFavoriteButton, record.isFavorite === true);
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
  const favoriteRecords = historyRecords.filter((record) => record.isFavorite === true);
  const filtered = historyRecords
    .filter((record) => historyFilter !== "favorites" || record.isFavorite === true)
    .filter((record) => !query || historySearchText(record).includes(query))
    .sort((a, b) => {
      const direction = elements.historySort.value === "newest" ? -1 : 1;
      return direction * (a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    });

  elements.historyCount.textContent = query ? `${filtered.length}/${historyRecords.length}件` : `${historyRecords.length}件`;
  elements.historyTotalFilterCount.textContent = String(historyRecords.length);
  elements.favoriteCount.textContent = String(favoriteRecords.length);
  elements.clearHistoryButton.disabled = historyRecords.length === 0;

  if (historyRecords.length === 0) {
    elements.historyList.innerHTML = '<div class="empty-state compact"><p>生成履歴はまだありません。</p></div>';
    return;
  }
  if (filtered.length === 0) {
    const message = historyFilter === "favorites" && !query
      ? "お気に入りはまだありません。"
      : "一致する履歴はありません。";
    elements.historyList.innerHTML = `<div class="empty-state compact"><p>${message}</p></div>`;
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
  const favoriteButton = createFavoriteButton(record);
  const controls = document.createElement("div");
  controls.className = "history-card-controls";
  controls.append(favoriteButton, deleteButton);
  card.append(time, list, controls);
  return card;
}

function handleHistoryClick(event) {
  const favoriteButton = event.target.closest("[data-toggle-favorite-id]");
  if (favoriteButton) {
    toggleFavorite(favoriteButton.dataset.toggleFavoriteId);
    return;
  }
  const button = event.target.closest("[data-delete-history-id]");
  if (!button) return;
  const historyId = button.dataset.deleteHistoryId;
  openConfirmation({
    title: "この履歴を削除しますか？",
    message: historyRecords.find((record) => record.id === historyId)?.isFavorite
      ? "お気に入りに登録した履歴です。削除すると元に戻せません。"
      : "削除した履歴は元に戻せません。",
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
  const favoriteCount = historyRecords.filter((record) => record.isFavorite === true).length;
  const regularCount = historyRecords.length - favoriteCount;
  openConfirmation({
    title: "履歴を整理しますか？",
    message: favoriteCount > 0
      ? `通常の履歴${regularCount}件を削除します。お気に入り${favoriteCount}件は残ります。`
      : `${historyRecords.length}件の履歴を削除します。この操作は元に戻せません。`,
    showFavoritesOption: favoriteCount > 0,
    action: async ({ includeFavorites }) => {
      await clearHistory(generatorId, { includeFavorites });
      historyRecords = historyRecords.filter((record) => record.isFavorite === true && !includeFavorites);
      renderHistoryList();
    },
  });
}

function openConfirmation({ title, message, action, showFavoritesOption = false }) {
  pendingDeleteAction = action;
  elements.confirmDialogTitle.textContent = title;
  elements.confirmDialogMessage.textContent = message;
  elements.confirmFavoritesOption.hidden = !showFavoritesOption;
  elements.confirmIncludeFavorites.checked = false;
  elements.confirmDeleteButton.disabled = false;
  elements.confirmDialog.showModal();
}

async function confirmDelete() {
  if (!pendingDeleteAction) return;
  elements.confirmDeleteButton.disabled = true;
  try {
    await pendingDeleteAction({ includeFavorites: elements.confirmIncludeFavorites.checked });
    elements.confirmDialog.close();
  } catch (error) {
    elements.confirmDeleteButton.disabled = false;
    elements.confirmDialogMessage.textContent = error.message ?? "履歴を削除できませんでした。";
  }
}

function resetConfirmation() {
  pendingDeleteAction = null;
  elements.confirmFavoritesOption.hidden = true;
  elements.confirmIncludeFavorites.checked = false;
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

function changeHistoryFilter(filter) {
  historyFilter = filter === "favorites" ? "favorites" : "all";
  updateHistoryFilterButtons();
  renderHistoryList();
}

function updateHistoryFilterButtons() {
  elements.historyFilter.dataset.active = historyFilter;
  elements.historyFilters.forEach((button) => {
    const selected = button.dataset.historyFilter === historyFilter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function createFavoriteButton(record) {
  const button = document.createElement("button");
  button.className = "history-favorite-button";
  button.type = "button";
  button.dataset.toggleFavoriteId = record.id;
  updateFavoriteButton(button, record.isFavorite === true);
  return button;
}

function updateFavoriteButton(button, isFavorite) {
  button.classList.toggle("is-favorite", isFavorite);
  button.setAttribute("aria-pressed", String(isFavorite));
  button.setAttribute("aria-label", isFavorite ? "お気に入りから外す" : "お気に入りに追加");
  const symbol = button.querySelector(".favorite-symbol");
  if (symbol) symbol.textContent = isFavorite ? "★" : "☆";
  else button.textContent = isFavorite ? "★" : "☆";
}

async function toggleFavorite(historyId) {
  if (!historyId) return;
  const record = historyRecords.find((item) => item.id === historyId)
    ?? (currentResultRecord?.id === historyId ? currentResultRecord : null);
  if (!record) return;
  try {
    const updated = { ...record, isFavorite: record.isFavorite !== true };
    await addHistory(updated);
    historyRecords = historyRecords.map((item) => item.id === historyId ? updated : item);
    if (!historyRecords.some((item) => item.id === historyId)) historyRecords.push(updated);
    if (currentResultRecord?.id === historyId) {
      currentResultRecord = updated;
      updateFavoriteButton(elements.resultFavoriteButton, updated.isFavorite);
    }
    renderHistoryList();
  } catch (error) {
    setMessage(error.message ?? "お気に入りを保存できませんでした。", true);
  }
}

function showView(name) {
  const showingMenu = name === "menu";
  if (showingMenu && currentGenerator) {
    loadingSequence += 1;
    currentGenerator = null;
    categories = [];
    historyRecords = [];
    currentResultRecord = null;
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
