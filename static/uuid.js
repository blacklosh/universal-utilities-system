const form = document.querySelector("#uuid-form");
const output = document.querySelector("#output");
const generate = document.querySelector("#generate");
const copy = document.querySelector("#copy");
const status = document.querySelector("#status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = new FormData(form);
  generate.disabled = true;
  copy.disabled = true;
  status.textContent = "Генерация…";

  try {
    const response = await fetch(form.dataset.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: Number(fields.get("version")),
        count: Number(fields.get("count")),
      }),
    });

    if (!response.ok) {
      throw new Error("UUID generation failed");
    }

    const { items } = await response.json();
    output.value = items.join("\n");
    output.scrollTop = 0;
    status.textContent = "Сгенерировано: " + items.length;
  } catch {
    status.textContent = "Не удалось сгенерировать UUID. Попробуйте ещё раз.";
  } finally {
    generate.disabled = false;
    copy.disabled = !output.value;
  }
});

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = "UUID скопированы.";
  } catch {
    output.focus();
    output.select();
    status.textContent = "Список выделен. Нажмите Ctrl+C, чтобы скопировать.";
  }
});
