const encodeInput = document.querySelector("#encode-input");
const fileInput = document.querySelector("#encode-file");
const encodeTextButton = document.querySelector("#encode-text");
const encodeFileButton = document.querySelector("#encode-file-button");
const decodeInput = document.querySelector("#decode-input");

function encodeBase64(bytes) {
  const chunks = [];
  const chunkSize = 16384;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function createResult(output, copy, status) {
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

  return (text, message) => {
    output.value = text;
    output.scrollTop = 0;
    copy.disabled = text.length === 0;
    status.textContent = message;
  };
}

const showEncoded = createResult(
  document.querySelector("#encode-output"),
  document.querySelector("#encode-copy"),
  document.querySelector("#encode-status"),
);
const showDecoded = createResult(
  document.querySelector("#decode-output"),
  document.querySelector("#decode-copy"),
  document.querySelector("#decode-status"),
);

encodeTextButton.addEventListener("click", () => {
  const text = encodeInput.value;
  try {
    showEncoded(encodeBase64(new TextEncoder().encode(text)), text ? "Текст закодирован." : "Введите текст.");
  } catch {
    showEncoded("", "Не удалось закодировать текст.");
  }
});

fileInput.addEventListener("change", () => {
  encodeFileButton.disabled = !fileInput.files.length;
});

encodeFileButton.addEventListener("click", async () => {
  const [file] = fileInput.files;
  if (!file) return;

  fileInput.disabled = true;
  encodeTextButton.disabled = true;
  encodeFileButton.disabled = true;
  showEncoded("", "Чтение файла…");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    showEncoded(encodeBase64(bytes), bytes.length ? "Файл закодирован." : "Файл пуст. Результат — пустая строка.");
  } catch {
    showEncoded("", "Не удалось прочитать или закодировать файл.");
  } finally {
    fileInput.disabled = false;
    encodeTextButton.disabled = false;
    encodeFileButton.disabled = !fileInput.files.length;
  }
});

document.querySelector("#decode-text").addEventListener("click", () => {
  if (!decodeInput.value.trim()) {
    showDecoded("", "Введите строку Base64.");
    return;
  }

  let bytes;
  try {
    const binary = atob(decodeInput.value);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    showDecoded("", "Некорректная строка Base64.");
    return;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    showDecoded(text, "Строка декодирована.");
  } catch {
    showDecoded("", "Строка Base64 содержит данные, которые не являются текстом UTF-8.");
  }
});
