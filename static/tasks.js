const statuses = {
  todo: "TODO", in_progress: "В работе", blocked: "Заблокировано",
  validation: "Валидация", done: "Готово",
};
const priorities = {
  low: "Низкая", normal: "Обычная", high: "Высокая", critical: "Критическая",
};
const archiveDelay = 3 * 24 * 60 * 60;
const board = document.querySelector("#task-board");
const boardTab = document.querySelector("#board-tab");
const archiveTab = document.querySelector("#archive-tab");
const boardStatus = document.querySelector("#board-status");
const newTask = document.querySelector("#new-task");
const sectionButton = document.querySelector("#sections-button");
const sectionDialog = document.querySelector("#section-dialog");
const sectionForm = document.querySelector("#section-form");
const taskDialog = document.querySelector("#task-dialog");
const taskForm = document.querySelector("#task-form");
const messageForm = document.querySelector("#message-form");
const taskError = document.querySelector("#task-error");
const dateFormat = new Intl.DateTimeFormat("ru", { dateStyle: "medium", timeStyle: "short" });
let sections = [];
let tasks = [];
let archive = false;
let boardRequest = 0;
let detailRequest = 0;
let currentTask = null;
let draggedTask = null;
let dialogBusy = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function feedback(node, text = "") {
  node.textContent = text;
  node.hidden = !text;
}

async function api(path, method = "GET", body) {
  const options = { method, cache: "no-store" };
  if (body !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch("api/" + path, options);
  const data = await response.json();
  if (!response.ok) {
    const message = Array.isArray(data.detail) ? "Проверьте заполнение полей." : data.detail;
    throw new Error(message || "Ошибка запроса.");
  }
  return data;
}

function taskCard(task) {
  const card = element("button", undefined, "task-card");
  card.type = "button";
  card.draggable = !archive;
  card.append(element("strong", task.title));
  if (task.description) card.append(element("span", task.description, "task-summary"));
  card.append(element("span", "Критичность: " + priorities[task.priority], "priority-" + task.priority));
  if (task.deadline) card.append(element("span", "Дедлайн: " + task.deadline.split("-").reverse().join(".")));
  if (task.assigned_by) card.append(element("span", "Поставил: " + task.assigned_by));
  if (archive) {
    const section = sections.find(({ id }) => id === task.section_id);
    const reason = task.cancelled_at !== null ? "Отменена" : "Завершена";
    card.append(element("span", reason + " · " + section.name + " · " + dateFormat.format(task.archived_at * 1000)));
  }
  card.addEventListener("click", () => openTask(task.id));
  card.addEventListener("dragstart", (event) => {
    draggedTask = task;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(task.id));
  });
  card.addEventListener("dragend", () => {
    draggedTask = null;
    board.querySelectorAll(".is-over").forEach((node) => node.classList.remove("is-over"));
  });
  return card;
}

function boardColumn(section, status, label) {
  const column = element("section", undefined, "tasks-column");
  const items = tasks.filter((task) => task.section_id === section.id && task.status === status);
  const cardColumns = items.length >= 12 ? 3 : items.length >= 6 ? 2 : 1;
  const cards = element("div", undefined, "tasks-cards");
  cards.style.setProperty("--card-columns", cardColumns);
  cards.append(...items.map(taskCard));

  const heading = element("h3", label);
  heading.append(element("span", String(items.length)));
  column.append(heading, cards);
  column.addEventListener("dragover", (event) => {
    if (!draggedTask) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    column.classList.add("is-over");
  });
  column.addEventListener("dragleave", (event) => {
    if (!column.contains(event.relatedTarget)) column.classList.remove("is-over");
  });
  column.addEventListener("drop", async (event) => {
    if (!draggedTask) return;
    event.preventDefault();
    const task = draggedTask;
    draggedTask = null;
    column.classList.remove("is-over");
    if (task.section_id === section.id && task.status === status) return;
    try {
      await api("tasks/" + task.id + "/move", "PATCH", { section_id: section.id, status });
      await loadBoard();
    } catch (error) {
      feedback(boardStatus, error.message);
    }
  });
  const width = items.length
    ? "minmax(" + (cardColumns * 7.75 + 0.75) + "rem, " + cardColumns + "fr)"
    : "minmax(" + (status === "blocked" ? 8.75 : 6.5) + "rem, .55fr)";
  return { column, width };
}

function renderBoard() {
  const previousScroll = board.firstElementChild?.scrollLeft ?? 0;
  if (archive) {
    const list = element("div", undefined, "tasks-archive");
    list.append(...tasks.map(taskCard));
    if (!tasks.length) list.append(element("p", "В архиве пока нет задач."));
    board.replaceChildren(list);
    return;
  }
  const scroll = element("div", undefined, "tasks-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("aria-label", "Доска задач, доступна горизонтальная прокрутка");
  for (const section of sections) {
    const lane = element("section", undefined, "tasks-lane");
    const columns = element("div", undefined, "tasks-columns");
    const tracks = Object.entries(statuses).map(([status, label]) => boardColumn(section, status, label));
    columns.style.gridTemplateColumns = tracks.map(({ width }) => width).join(" ");
    columns.append(...tracks.map(({ column }) => column));
    lane.append(element("h2", section.name), columns);
    scroll.append(lane);
  }
  board.replaceChildren(scroll);
  scroll.scrollLeft = previousScroll;
}

async function loadBoard() {
  const request = ++boardRequest;
  feedback(boardStatus);
  try {
    const data = await api("board?archive=" + archive);
    if (request !== boardRequest) return;
    ({ sections, tasks } = data);
    renderBoard();
    newTask.disabled = !sections.length;
    sectionButton.disabled = false;
  } catch (error) {
    if (request === boardRequest) feedback(boardStatus, error.message);
  }
}

function switchView(showArchive) {
  archive = showArchive;
  boardTab.setAttribute("aria-pressed", String(!archive));
  archiveTab.setAttribute("aria-pressed", String(archive));
  board.replaceChildren();
  loadBoard();
}
boardTab.addEventListener("click", () => switchView(false));
archiveTab.addEventListener("click", () => switchView(true));

function options(select, entries) {
  select.replaceChildren(...entries.map(([value, label]) => new Option(label, value)));
}

function sectionOptions() {
  return sections.map(({ id, name }) => [id, name]);
}

function displayTask(task) {
  currentTask = task;
  const fields = taskForm.elements;
  taskForm.reset();
  messageForm.reset();
  options(fields.namedItem("section_id"), sectionOptions());
  options(fields.namedItem("status"), Object.entries(statuses));
  options(fields.namedItem("priority"), Object.entries(priorities));
  fields.namedItem("priority").value = "normal";
  if (task) {
    for (const key of ["title", "description", "section_id", "status", "deadline", "assigned_by", "priority"]) {
      fields.namedItem(key).value = task[key] ?? "";
    }
  }
  const archived = task?.archived_at != null;
  document.querySelector("#task-title").textContent = task ? "Задача #" + task.id : "Новая задача";
  document.querySelector("#task-fields").disabled = archived;
  document.querySelector("#task-status-field").hidden = !task;
  document.querySelector("#task-controls").hidden = archived;
  document.querySelector("#cancel-task").hidden = !task;
  document.querySelector("#task-messages").hidden = !task;
  messageForm.hidden = archived;
  feedback(document.querySelector("#task-archive-info"), archived
    ? (task.cancelled_at !== null ? "Отменена" : "В архиве") + " · " + dateFormat.format(task.archived_at * 1000)
    : "");
  feedback(taskError);
  if (task) displayMessages(task.messages);
}

function displayMessages(messages) {
  const list = document.querySelector("#message-list");
  list.replaceChildren();
  for (const message of messages) {
    const entry = element("article", undefined, "task-message");
    const date = new Date(message.created_at * 1000);
    const time = element("time", dateFormat.format(date));
    time.dateTime = date.toISOString();
    entry.append(time, element("p", message.body));
    list.append(entry);
  }
  if (!messages.length) list.append(element("p", "Сообщений пока нет."));
}

async function openTask(id) {
  const request = ++detailRequest;
  try {
    const task = id == null ? null : await api("tasks/" + id);
    if (request !== detailRequest || taskDialog.open) return;
    displayTask(task);
    taskDialog.showModal();
  } catch (error) {
    if (request === detailRequest) feedback(boardStatus, error.message);
  }
}
newTask.addEventListener("click", () => openTask(null));

async function runDialogAction(dialog, errorNode, action) {
  if (dialogBusy) return;
  dialogBusy = true;
  feedback(errorNode);
  const buttons = [...dialog.querySelectorAll("button:not(:disabled)")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await action();
  } catch (error) {
    feedback(errorNode, error.message);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    dialogBusy = false;
  }
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(taskForm));
  data.section_id = Number(data.section_id);
  data.deadline = data.deadline || null;
  runDialogAction(taskDialog, taskError, async () => {
    if (currentTask) {
      await api("tasks/" + currentTask.id, "PUT", data);
    } else {
      await api("tasks", "POST", data);
    }
    taskDialog.close();
    if (!currentTask && archive) switchView(false);
    else await loadBoard();
  });
});

document.querySelector("#cancel-task").addEventListener("click", () => {
  if (!confirm("Отменить задачу и переместить её в архив?")) return;
  runDialogAction(taskDialog, taskError, async () => {
    await api("tasks/" + currentTask.id + "/cancel", "POST");
    taskDialog.close();
    await loadBoard();
  });
});

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const body = new FormData(messageForm).get("body");
  runDialogAction(taskDialog, taskError, async () => {
    const path = "tasks/" + currentTask.id;
    await api(path + "/messages", "POST", { body });
    messageForm.reset();
    currentTask = await api(path);
    displayMessages(currentTask.messages);
  });
});

const sectionChoice = sectionForm.elements.namedItem("section");
const sectionName = sectionForm.elements.namedItem("name");
const sectionError = document.querySelector("#section-error");
sectionButton.addEventListener("click", () => {
  options(sectionChoice, [["", "Новый раздел"], ...sectionOptions()]);
  sectionName.value = "";
  feedback(sectionError);
  sectionDialog.showModal();
});
sectionChoice.addEventListener("change", () => {
  sectionName.value = sections.find(({ id }) => id === Number(sectionChoice.value))?.name ?? "";
});
sectionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = sectionChoice.value;
  runDialogAction(sectionDialog, sectionError, async () => {
    await api(id ? "sections/" + id : "sections", id ? "PUT" : "POST", { name: sectionName.value });
    sectionDialog.close();
    await loadBoard();
  });
});

for (const dialog of [taskDialog, sectionDialog]) {
  dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("cancel", (event) => { if (dialogBusy) event.preventDefault(); });
}

newTask.disabled = true;
sectionButton.disabled = true;
loadBoard();
setInterval(() => {
  const overdue = tasks.some((task) => task.done_at !== null
    && task.done_at + archiveDelay <= Date.now() / 1000);
  if (!archive && overdue && !draggedTask && !taskDialog.open && !sectionDialog.open) loadBoard();
}, 15000);
