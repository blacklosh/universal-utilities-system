const list = document.querySelector("#quotes-list");
const status = document.querySelector("#quotes-status");
const quoteDialog = document.querySelector("#quote-dialog");
const quoteForm = document.querySelector("#quote-form");
const quoteError = document.querySelector("#quote-error");
const saveButton = quoteForm.querySelector('[type="submit"]');
const dateFormat = new Intl.DateTimeFormat("ru", { dateStyle: "medium" });

function element(tagName, text, className) {
  const node = document.createElement(tagName);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function api(path = "", method = "GET", body) {
  const options = { method, cache: "no-store" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch("api" + path, options);
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Проверьте данные.");
  }
  return data;
}

function quoteCard(quote) {
  const card = element("article", undefined, "panel quote-card");
  const meta = element("div", undefined, "quote-meta");
  const date = new Date(quote.created_at * 1000);
  const time = element("time", dateFormat.format(date));
  time.dateTime = date.toISOString();
  const remove = element("button", "Удалить");
  remove.type = "button";
  remove.addEventListener("click", async () => {
    if (!confirm("Удалить эту фразу?")) return;
    remove.disabled = true;
    try {
      await api("/" + quote.id, "DELETE");
      await loadQuotes();
    } catch (error) {
      status.textContent = error.message;
      remove.disabled = false;
    }
  });
  meta.append(element("span", quote.source || "Источник не указан"), time, remove);
  card.append(element("blockquote", quote.body), meta);
  return card;
}

async function loadQuotes() {
  try {
    const quotes = await api();
    list.replaceChildren(...quotes.map(quoteCard));
    status.textContent = quotes.length ? "" : "Здесь пока нет фраз.";
  } catch (error) {
    status.textContent = error.message;
  }
}

document.querySelector("#quotes-add").addEventListener("click", () => {
  quoteForm.reset();
  quoteError.textContent = "";
  quoteDialog.showModal();
});

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(quoteForm));
  saveButton.disabled = true;
  quoteError.textContent = "";
  try {
    await api("", "POST", data);
    quoteDialog.close();
    await loadQuotes();
  } catch (error) {
    quoteError.textContent = error.message;
  } finally {
    saveButton.disabled = false;
  }
});

quoteDialog.querySelector("[data-close]").addEventListener("click", () => {
  if (!saveButton.disabled) quoteDialog.close();
});
quoteDialog.addEventListener("cancel", (event) => {
  if (saveButton.disabled) event.preventDefault();
});loadQuotes();
