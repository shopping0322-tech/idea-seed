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
        const status = document.querySelector("#connection-status")?.textContent?.trim();
        const disabled = document.querySelector("#generate-button")?.disabled;
        if ((status === "準備完了" || status?.startsWith("更新済み")) && disabled === false) {
          resolve({ status, disabled });
          return;
        }
        if (status === "読込失敗" || Date.now() > deadline) {
          resolve({ status, disabled });
          return;
        }
        setTimeout(tick, 100);
      };
      tick();
    })`,
  );
  assert.match(loaded.status, /^(準備完了|更新済み)/);
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

  client.close();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await main();
