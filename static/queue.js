const form = document.querySelector("#queue-add");
const status = document.querySelector("#queue-status");
const dateFormat = new Intl.DateTimeFormat("ru", { dateStyle: "medium" });

for (const time of document.querySelectorAll(".queue-meta time")) {
  time.textContent = dateFormat.format(new Date(time.dateTime));
}

async function save(button, endpoint, data) {
  button.disabled = true;
  status.textContent = "";
  const options = { method: "POST" };
  if (data !== undefined) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(data);
  }
  try {
    const response = await fetch(endpoint, options);
    if (!response.ok) {
      const { detail } = await response.json();
      throw new Error(typeof detail === "string" ? detail : "Выберите тип и введите название.");
    }
    window.location.reload();
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter.disabled) return;
  save(event.submitter, form.dataset.endpoint, Object.fromEntries(new FormData(form)));
});

for (const button of document.querySelectorAll("[data-complete]")) {
  button.addEventListener("click", () => save(button, button.dataset.complete));
}
