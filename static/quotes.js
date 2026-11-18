const list = document.querySelector("#quotes-list");
const status = document.querySelector("#quotes-status");
const quoteDialog = document.querySelector("#quote-dialog");
const quoteForm = document.querySelector("#quote-form");
const quoteError = document.querySelector("#quote-error");
const importDialog = document.querySelector("#import-dialog");
const telegramFile = document.querySelector("#telegram-file");
const preview = document.querySelector("#import-preview");
const importStatus = document.querySelector("#import-status");
const importSave = document.querySelector("#import-save");
const dateFormat = new Intl.DateTimeFormat("ru", { dateStyle: "medium" });
const tag = /#ВеликиеФразыВеликих(?![\p{L}\p{M}\p{N}_])/giu;
let pendingQuotes = [];

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

function telegramText(message) {
  if (typeof message.text === "string") return message.text;
  const parts = Array.isArray(message.text) ? message.text : message.text_entities;
  return Array.isArray(parts)
    ? parts.map((part) => typeof part === "string" ? part : part?.text ?? "").join("")
    : "";
}

function extractQuotes(chat) {
  if (!Array.isArray(chat?.messages)) {
    throw new Error("Выберите JSON-экспорт одного чата Telegram.");
  }

  const quotes = [];
  let invalid = 0;
  for (const message of chat.messages) {
    if (message?.type !== "message") continue;
    const text = telegramText(message);
    const withoutTag = text.replace(tag, "").trim();
    if (withoutTag === text.trim()) continue;

    const match = /(?:^|\r?\n)[ \t]*Источник[ \t]*:[ \t]*(.+)$/iu.exec(withoutTag);
    const body = (match ? withoutTag.slice(0, match.index) : withoutTag).trim();
    const source = match?.[1].trim() ?? "";
    const timestamp = message.date_unixtime;
    const createdAt = /^[0-9]+$/.test(timestamp)
      ? Number(timestamp)
      : Math.floor(Date.parse(message.date) / 1000);
    const key = String(chat.id ?? createdAt) + ":" + String(message.id);
    if (!body || body.length > 20000 || source.length > 500 || !Number.isSafeInteger(createdAt)
        || createdAt < 0 || createdAt > 253402300799 || !Number.isSafeInteger(message.id)) {
      invalid += 1;
      continue;
    }
    quotes.push({ body, source, created_at: createdAt, key });
  }
  return { quotes, invalid };
}

function renderPreview(quotes) {
  preview.replaceChildren();
  pendingQuotes = quotes.map((quote) => {
    const row = element("article");
    const source = element("input");
    source.maxLength = 500;
    source.value = quote.source;
    const label = element("label", "Источник");
    label.append(source);
    row.append(element("p", quote.body), label);
    preview.append(row);
    return { quote, source };
  });
  importSave.disabled = !pendingQuotes.length;
}

document.querySelector("#quotes-add").addEventListener("click", () => {
  quoteForm.reset();
  quoteError.textContent = "";
  quoteDialog.showModal();
});

quoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = quoteForm.querySelector('[type="submit"]');
  const data = Object.fromEntries(new FormData(quoteForm));
  submit.disabled = true;
  quoteError.textContent = "";
  try {
    await api("", "POST", data);
    quoteDialog.close();
    await loadQuotes();
  } catch (error) {
    quoteError.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#quotes-import").addEventListener("click", () => {
  telegramFile.value = "";
  renderPreview([]);
  importStatus.textContent = "";
  importDialog.showModal();
});

telegramFile.addEventListener("change", async () => {
  renderPreview([]);
  const [file] = telegramFile.files;
  if (!file) return;
  telegramFile.disabled = true;
  importStatus.textContent = "Чтение файла…";
  try {
    const { quotes, invalid } = extractQuotes(JSON.parse(await file.text()));
    renderPreview(quotes);
    importStatus.textContent = "Найдено фраз: " + quotes.length + (invalid ? ". Пропущено записей: " + invalid : ".");
  } catch (error) {
    importStatus.textContent = error instanceof SyntaxError ? "Не удалось прочитать JSON-файл." : error.message;
  } finally {
    telegramFile.disabled = false;
  }
});

importSave.addEventListener("click", async () => {
  if (!pendingQuotes.length) return;
  importSave.disabled = true;
  telegramFile.disabled = true;
  const items = pendingQuotes.map(({ quote, source }) => ({ ...quote, source: source.value }));
  let added = 0;
  let skipped = 0;
  importStatus.textContent = "Сохранение фраз…";
  try {
    for (let offset = 0; offset < items.length; offset += 250) {
      const result = await api("/import", "POST", items.slice(offset, offset + 250));
      added += result.added;
      skipped += result.skipped;
    }
    renderPreview([]);
    importStatus.textContent = "Добавлено: " + added + ". Уже импортированы: " + skipped + ".";
  } catch (error) {
    importStatus.textContent = "Добавлено: " + added + ". " + error.message;
  } finally {
    telegramFile.disabled = false;
    importSave.disabled = !pendingQuotes.length;
    await loadQuotes();
  }
});

for (const dialog of [quoteDialog, importDialog]) {
  const busy = () => dialog === importDialog
    ? telegramFile.disabled
    : quoteForm.querySelector('[type="submit"]').disabled;
  dialog.querySelector("[data-close]").addEventListener("click", () => { if (!busy()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy()) event.preventDefault(); });
}
loadQuotes();
