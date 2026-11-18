const input = document.querySelector("#base64-input");
const output = document.querySelector("#base64-output");
const copy = document.querySelector("#base64-copy");
const status = document.querySelector("#status");

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  const chunks = [];
  const chunkSize = 16384;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function decodeBase64(binary) {
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

function showResult(text, message) {
  output.value = text;
  output.scrollTop = 0;
  copy.disabled = text.length === 0;
  status.textContent = message;
}

document.querySelector("#base64-encode").addEventListener("click", () => {
  showResult(encodeBase64(input.value), input.value ? "Текст закодирован." : "Введите текст.");
});

document.querySelector("#base64-decode").addEventListener("click", () => {
  if (!input.value.trim()) {
    showResult("", "Введите строку Base64.");
    return;
  }

  let binary;
  try {
    binary = atob(input.value);
  } catch {
    showResult("", "Некорректная строка Base64.");
    return;
  }

  try {
    showResult(decodeBase64(binary), "Строка декодирована.");
  } catch {
    showResult("", "Строка Base64 содержит данные, которые не являются текстом UTF-8.");
  }
});

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = "Результат скопирован.";
  } catch {
    output.focus();
    output.select();
    status.textContent = "Результат выделен. Нажмите Ctrl+C, чтобы скопировать.";
  }
});
