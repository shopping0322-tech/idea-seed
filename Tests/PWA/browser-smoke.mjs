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
    if (message.error) {
      handlers.reject(new Error(message.error.message));
    } else {
      handlers.resolve(message.result);
    }
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

      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text);
      }

      return result.result.value;
    } catch (error) {
      lastError = error;
      if (!String(error.message).includes("Execution context was destroyed")) throw error;
      await delay(250);
    }
  }
  throw lastError;
}

async function main() {
  await waitForDevTools();
  const webSocketUrl = await openPage();
  const client = createClient(webSocketUrl);
  await client.ready();
  await client.send("Runtime.enable");
  await client.send("Page.enable");

  const loaded = await evaluate(
    client,
    `new Promise((resolve) => {
      const deadline = Date.now() + 10000;
      const tick = () => {
        const disabled = document.querySelector("#generate-button")?.disabled;
        const message = document.querySelector("#generator-message")?.textContent?.trim();
        if (disabled === false) {
          resolve({ disabled, message });
          return;
        }
        if (Date.now() > deadline) {
          resolve({ disabled, message });
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    })`,
  );
  assert.equal(loaded.disabled, false);

  const generated = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector("#generate-button").click();
      setTimeout(() => {
        resolve({
          cards: document.querySelectorAll(".result-card").length,
          historyCount: document.querySelector("#history-count")?.textContent?.trim(),
        });
      }, 500);
    })`,
  );
  assert.equal(generated.cards, 4);
  assert.equal(generated.historyCount, "1件");

  const historyTools = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector("#generate-button").click();
      setTimeout(() => {
        document.querySelector('[data-view="history"]').click();
        const firstValue = document.querySelector(".history-card dd")?.textContent?.trim() ?? "";
        document.querySelector("#history-search").value = firstValue;
        document.querySelector("#history-search").dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("#history-sort").value = "newest";
        document.querySelector("#history-sort").dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => {
          resolve({
            footerHidden: document.querySelector(".action-footer").hidden,
            searchCount: document.querySelector("#history-count")?.textContent?.trim(),
            sortValue: document.querySelector("#history-sort")?.value,
            deleteButtons: document.querySelectorAll("[data-delete-history-id]").length,
          });
        }, 300);
      }, 500);
    })`,
  );
  assert.equal(historyTools.footerHidden, true);
  assert.match(historyTools.searchCount, /^\d+\/2件$/);
  assert.equal(historyTools.sortValue, "newest");
  assert.equal(historyTools.deleteButtons >= 1, true);

  const deletedOne = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector("[data-delete-history-id]").click();
      const dialogOpened = document.querySelector("#confirm-dialog").open;
      document.querySelector("#confirm-delete-button").click();
      setTimeout(() => resolve({
        count: document.querySelector("#history-count")?.textContent?.trim(),
        dialogOpened,
        dialogClosed: !document.querySelector("#confirm-dialog").open,
      }), 300);
    })`,
  );
  assert.match(deletedOne.count, /^(0|1)\/1件$|^1件$/);
  assert.equal(deletedOne.dialogOpened, true);
  assert.equal(deletedOne.dialogClosed, true);

  const cleared = await evaluate(
    client,
    `new Promise((resolve) => {
      document.querySelector("#history-search").value = "";
      document.querySelector("#history-search").dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector("#clear-history-button").click();
      const dialogOpened = document.querySelector("#confirm-dialog").open;
      document.querySelector("#confirm-delete-button").click();
      setTimeout(() => {
        resolve({
          count: document.querySelector("#history-count")?.textContent?.trim(),
          empty: document.querySelector("#history-list")?.textContent?.includes("生成履歴はまだありません。"),
          dialogOpened,
        });
      }, 300);
    })`,
  );
  assert.deepEqual(cleared, { count: "0件", empty: true, dialogOpened: true });

  client.close();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
