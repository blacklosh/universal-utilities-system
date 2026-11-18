const form = document.querySelector("#json-form");
const input = document.querySelector("#json-input");
const output = document.querySelector("#json-output");
const copy = document.querySelector("#json-copy");
const status = document.querySelector("#json-status");
const copyStatus = document.querySelector("#json-copy-status");
const errorContext = document.querySelector("#json-error-context");

function formatJson(text) {
  // Validate first, then format the original tokens to preserve numbers and duplicate keys.
  const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:"]+/g);
  const parts = [];
  let depth = 0;
  const newline = () => "\n" + "  ".repeat(depth);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    switch (token) {
      case "{":
      case "[":
        parts.push(token);
        depth += 1;
        if (tokens[index + 1] !== "}" && tokens[index + 1] !== "]") parts.push(newline());
        break;
      case "}":
      case "]":
        depth -= 1;
        if (tokens[index - 1] !== "{" && tokens[index - 1] !== "[") parts.push(newline());
        parts.push(token);
        break;
      case ",":
        parts.push(token, newline());
        break;
      case ":":
        parts.push(": ");
        break;
      default:
        parts.push(token);
    }
  }
  return parts.join("");
}

function errorOffset(text, message) {
  const position = /\bposition (\d+)\b/i.exec(message);
  if (position) return Math.min(Number(position[1]), text.length);
  const location = /\bline (\d+) column (\d+)\b/i.exec(message);
  if (location) {
    const lines = text.split("\n");
    const row = Number(location[1]) - 1;
    if (row >= 0 && row < lines.length) {
      const start = lines.slice(0, row).reduce((size, line) => size + line.length + 1, 0);
      return start + Math.min(lines[row].length, Number(location[2]) - 1);
    }
  }
  if (/unexpected end|end of (?:json )?(?:input|data)|unterminated/i.test(message)) return text.length;
  return null;
}

function showError(text, message) {
  const offset = errorOffset(text, message);
  input.setAttribute("aria-invalid", "true");
  if (offset === null) {
    status.textContent = "Некорректный JSON. " + message;
    return;
  }

  const previous = text.slice(0, offset).split("\n");
  const line = previous.length;
  const column = previous.at(-1).length + 1;
  const marker = document.createElement("mark");
  const atEnd = offset === text.length;
  const endOfLine = text.indexOf("\n", offset);
  const before = Math.max(offset - column + 1, offset - 70);
  const after = Math.min(endOfLine < 0 ? text.length : endOfLine, offset + 71);
  marker.textContent = atEnd ? "конец ввода" : text[offset] === "\n" ? "↵" : text[offset];
  errorContext.replaceChildren(text.slice(before, offset), marker, text.slice(offset + 1, after));
  errorContext.hidden = false;
  status.textContent = "Ошибка JSON · строка " + line + ", столбец " + column + ". " + message;
  input.focus({ preventScroll: true });
  input.setSelectionRange(offset, atEnd ? offset : offset + 1);
}

function resetResult() {
  output.value = "";
  copy.disabled = true;
  status.textContent = "";
  copyStatus.textContent = "";
  input.removeAttribute("aria-invalid");
  errorContext.hidden = true;
}

input.addEventListener("input", resetResult);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  resetResult();
  const text = input.value;
  if (!text.trim()) {
    status.textContent = "Вставьте JSON.";
    return;
  }
  try {
    JSON.parse(text);
  } catch (error) {
    showError(text, error.message);
    return;
  }
  try {
    output.value = formatJson(text);
    copy.disabled = false;
    status.textContent = "JSON отформатирован.";
  } catch {
    status.textContent = "Не удалось отформатировать JSON такого размера.";
  }
});

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyStatus.textContent = "Результат скопирован.";
  } catch {
    output.focus();
    output.select();
    copyStatus.textContent = "Результат выделен. Нажмите Ctrl+C, чтобы скопировать.";
  }
});
