import assert from "node:assert/strict";

const PAGE_URL = process.env.IDEA_SEED_PAGE_URL ?? "http://127.0.0.1:4173/";
const DEVTOOLS_URL = process.env.IDEA_SEED_DEVTOOLS_URL ?? "http://127.0.0.1:9222";

async function waitForDevTools() {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${DEVTOOLS_URL}/json/version`);
      if (response.ok) return;
      lastError = new Error(`DevTools returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw lastError ?? new Error("DevTools endpoint did not become ready");
}

async function openPage() {
  const response = await fetch(`${DEVTOOLS_URL}/json/new?${encodeURIComponent(PAGE_URL)}`, { method: "PUT" });
  assert.equal(response.ok, true, `failed to open page: ${response.status}`);
  const target = await response.json();
  assert.equal(typeof target.webSocketDebuggerUrl, "string");
  return target.webSocketDebuggerUrl;
}

function createClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handlers = pending.get(message.id);
    if (!handlers) return;
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });

  return {
    async ready() {
      await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
      });
    },
    send(method, params = {}) {
      const id = nextId++;
      const message = JSON.stringify({ id, method, params });
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(message);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const result = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    } catch (error) {
      lastError = error;
      if (!String(error.message).includes("Execution context was destroyed")) throw error;
      await delay(250);
    }
  }
  throw lastError;
}

async function chooseGenerator(client, generatorId) {
  return evaluate(
    client,
    `new Promise((resolve) => {
      const deadline = Date.now() + 10000;
      let clicked = false;
      const tick = () => {
        if (!clicked && !document.querySelector("#menu-view")?.hidden && !document.body.dataset.generator) {
          document.querySelector('[data-generator-id="${generatorId}"]').click();
          clicked = true;
        }
        const ready = document.body.dataset.generator === "${generatorId}"
          && document.querySelector("#generate-button")?.disabled === false;
        if (ready || Date.now() > deadline) {
          resolve({
            ready,
            message: document.querySelector("#generator-message")?.textContent?.trim(),
            footerVisible: !document.querySelector(".action-footer")?.hidden,
            title: document.querySelector("#app-title")?.textContent?.trim(),
            modeDescription: document.querySelector("#mode-description")?.textContent?.trim(),
            generateLabel: document.querySelector(".generate-label")?.textContent?.trim(),
            modeIconVisible: getComputedStyle(document.querySelector('[data-mode-icon="${generatorId}"]')).display !== "none",
          });
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    })`,
  );
}

async function clearCurrentHistory(client) {
  return evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector('[data-view="history"]').click();
      const clearButton = document.querySelector("#clear-history-button");
      if (!clearButton.disabled) {
        clearButton.click();
        document.querySelector("#confirm-delete-button").click();
      }
      setTimeout(() => {
        const count = document.querySelector("#history-count")?.textContent?.trim();
        document.querySelector('[data-view="generator"]').click();
        resolve(count);
      }, 300);
    })`,
  );
}

async function generate(client) {
  return evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector("#generate-button").click();
      setTimeout(() => resolve({
        cards: document.querySelectorAll(".result-card").length,
        historyCount: document.querySelector("#history-count")?.textContent?.trim(),
        labels: [...document.querySelectorAll(".result-card .category-label")].map((element) => element.textContent.trim()),
        cardAnimation: getComputedStyle(document.querySelector(".result-card")).animationName,
      }), 500);
    })`,
  );
}

async function main() {
  await waitForDevTools();
  const webSocketUrl = await openPage();
  const client = createClient(webSocketUrl);
  await client.ready();
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

  const menu = await evaluate(
    client,
    `new Promise((resolve) => {
      const deadline = Date.now() + 10000;
      const tick = () => {
        const cards = document.querySelectorAll("[data-generator-id]").length;
        const appReady = document.body.dataset.appReady === "true";
        if ((cards === 2 && appReady) || Date.now() > deadline) {
          resolve({
            cards,
            appReady,
            menuVisible: !document.querySelector("#menu-view")?.hidden,
            tabsHidden: document.querySelector(".tab-bar")?.hidden,
            footerHidden: document.querySelector(".action-footer")?.hidden,
            appTitle: document.querySelector("#app-title")?.textContent?.trim(),
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            cardsInsideViewport: [...document.querySelectorAll(".generator-menu-card")]
              .every((card) => card.getBoundingClientRect().right <= window.innerWidth),
            lineIcons: document.querySelectorAll(".menu-card-icon svg").length,
          });
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    })`,
  );
  assert.deepEqual(menu, {
    cards: 2,
    appReady: true,
    menuVisible: true,
    tabsHidden: true,
    footerHidden: true,
    appTitle: "発想の種",
    viewportWidth: 390,
    documentWidth: 390,
    cardsInsideViewport: true,
    lineIcons: 2,
  });

  const sceneReady = await chooseGenerator(client, "scene");
  assert.equal(sceneReady.ready, true, sceneReady.message);
  assert.equal(sceneReady.footerVisible, true);
  assert.equal(sceneReady.title, "シーン生成");
  assert.equal(sceneReady.modeDescription, "4つの独立した種を組み合わせる");
  assert.equal(sceneReady.generateLabel, "シーンを生成");
  assert.equal(sceneReady.modeIconVisible, true);
  assert.equal(await clearCurrentHistory(client), "0件");

  const firstScene = await generate(client);
  assert.equal(firstScene.cards, 4);
  assert.equal(firstScene.historyCount, "1件");
  assert.deepEqual(firstScene.labels, ["いつ", "どこで", "誰が", "何をした"]);
  assert.equal(firstScene.cardAnimation, "card-reveal");
  await generate(client);

  const sceneHistory = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector('[data-view="history"]').click();
      document.querySelector("#history-sort").value = "oldest";
      document.querySelector("#history-sort").dispatchEvent(new Event("change", { bubbles: true }));
      setTimeout(() => resolve({
        count: document.querySelector("#history-count")?.textContent?.trim(),
        savedSort: localStorage.getItem("idea-seed-history-sort"),
        footerHidden: document.querySelector(".action-footer")?.hidden,
      }), 200);
    })`,
  );
  assert.deepEqual(sceneHistory, { count: "2件", savedSort: "oldest", footerHidden: true });

  await evaluate(client, `document.querySelector("#menu-button").click()`);
  const loglineReady = await chooseGenerator(client, "logline");
  assert.equal(loglineReady.ready, true, loglineReady.message);
  assert.equal(loglineReady.title, "ログライン生成");
  assert.equal(loglineReady.modeDescription, "物語の核になる6つの材料を引く");
  assert.equal(loglineReady.generateLabel, "材料を生成");
  assert.equal(loglineReady.modeIconVisible, true);
  assert.equal(await clearCurrentHistory(client), "0件");

  const logline = await generate(client);
  assert.equal(logline.cards, 6);
  assert.equal(logline.historyCount, "1件");
  assert.deepEqual(logline.labels, ["主人公", "欲望", "日常の入口", "異常現象・世界ルール", "舞台", "スケール"]);

  const loglineHistory = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector('[data-view="history"]').click();
      setTimeout(() => resolve({
        count: document.querySelector("#history-count")?.textContent?.trim(),
        duplicateHeading: document.querySelector("#history-title") !== null,
      }), 200);
    })`,
  );
  assert.deepEqual(loglineHistory, { count: "1件", duplicateHeading: false });

  await evaluate(client, `document.querySelector("#menu-button").click()`);
  assert.equal((await chooseGenerator(client, "scene")).ready, true);
  const separatedSceneHistory = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector('[data-view="history"]').click();
      setTimeout(() => resolve(document.querySelector("#history-count")?.textContent?.trim()), 200);
    })`,
  );
  assert.equal(separatedSceneHistory, "2件");

  await client.send("Page.reload", { ignoreCache: true });
  await delay(500);
  const afterReloadMenu = await evaluate(client, `!document.querySelector("#menu-view")?.hidden`);
  assert.equal(afterReloadMenu, true);
  assert.equal((await chooseGenerator(client, "scene")).ready, true);
  const restoredSort = await evaluate(client, `document.querySelector("#history-sort")?.value`);
  assert.equal(restoredSort, "oldest");

  const deletion = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector('[data-view="history"]').click();
      document.querySelector("[data-delete-history-id]").click();
      const dialogOpened = document.querySelector("#confirm-dialog").open;
      const dialogAnimation = getComputedStyle(document.querySelector(".confirm-dialog-content")).animationName;
      document.querySelector("#confirm-delete-button").click();
      setTimeout(() => resolve({
        count: document.querySelector("#history-count")?.textContent?.trim(),
        dialogOpened,
        dialogAnimation,
        dialogClosed: !document.querySelector("#confirm-dialog").open,
      }), 300);
    })`,
  );
  assert.deepEqual(deletion, {
    count: "1件",
    dialogOpened: true,
    dialogAnimation: "modal-in",
    dialogClosed: true,
  });

  assert.equal(await clearCurrentHistory(client), "0件");

  const desktopButtonWidths = [];
  for (const width of [900, 1440]) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    desktopButtonWidths.push(await evaluate(
      client,
      `Math.round(document.querySelector("#generate-button").getBoundingClientRect().width)`,
    ));
  }
  assert.deepEqual(desktopButtonWidths, [680, 680]);

  client.close();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
