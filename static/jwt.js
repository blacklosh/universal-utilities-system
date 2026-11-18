const input = document.querySelector("#jwt-input");
const headerInput = document.querySelector("#jwt-header");
const payloadInput = document.querySelector("#jwt-payload");
const secretInput = document.querySelector("#jwt-secret");
const output = document.querySelector("#jwt-output");
const decodeStatus = document.querySelector("#jwt-decode-status");
const signStatus = document.querySelector("#jwt-sign-status");
const signButton = document.querySelector("#jwt-sign");
const copyButton = document.querySelector("#jwt-copy");
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const hashes = new Map([
  ["HS256", "SHA-256"],
  ["HS384", "SHA-384"],
  ["HS512", "SHA-512"],
]);

function parseObject(text, label) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(label + " должен содержать корректный JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " должен быть JSON-объектом.");
  }
  return value;
}

function decodePart(part, label) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) {
    throw new Error(label + " содержит некорректный Base64url.");
  }
  let text;
  try {
    const binary = atob(part.replaceAll("-", "+").replaceAll("_", "/"));
    text = decoder.decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  } catch {
    throw new Error(label + " содержит некорректный Base64url или UTF-8.");
  }
  parseObject(text, label);
  return text;
}

function encodePart(bytes) {
  const chunks = [];
  const chunkSize = 16384;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function clearOutput() {
  output.value = "";
  copyButton.disabled = true;
  signStatus.textContent = "";
}

document.querySelector("#jwt-decode").addEventListener("click", () => {
  if (signButton.disabled) return;
  clearOutput();
  headerInput.value = "";
  payloadInput.value = "";
  const parts = input.value.trim().split(".");
  try {
    if (parts.length === 5) {
      headerInput.value = decodePart(parts[0], "Заголовок");
      decodeStatus.textContent = "Это зашифрованный JWT (JWE). Доступен только заголовок.";
      return;
    }
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]*$/.test(parts[2])) {
      throw new Error("Вставьте JWT в компактном формате.");
    }
    const header = decodePart(parts[0], "Заголовок");
    const payload = decodePart(parts[1], "Payload");
    headerInput.value = header;
    payloadInput.value = payload;
    decodeStatus.textContent = "Заголовок и payload прочитаны.";
  } catch (error) {
    decodeStatus.textContent = error.message;
  }
});

signButton.addEventListener("click", async () => {
  clearOutput();
  let header;
  const headerText = headerInput.value;
  const payloadText = payloadInput.value;
  try {
    header = parseObject(headerText, "Заголовок");
    parseObject(payloadText, "Payload");
    if (!hashes.has(header.alg) || Object.hasOwn(header, "crit") || Object.hasOwn(header, "b64")) {
      throw new Error("Для подписи выберите HS256, HS384 или HS512 и удалите расширения crit и b64.");
    }
    if (!secretInput.value.length) {
      throw new Error("Введите секретный ключ.");
    }
  } catch (error) {
    signStatus.textContent = error.message;
    return;
  }

  signButton.disabled = true;
  try {
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secretInput.value),
      { name: "HMAC", hash: hashes.get(header.alg) }, false, ["sign"],
    );
    const content = encodePart(encoder.encode(headerText)) + "." + encodePart(encoder.encode(payloadText));
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(content));
    output.value = content + "." + encodePart(new Uint8Array(signature));
    copyButton.disabled = false;
    signStatus.textContent = "JWT подписан.";
  } catch {
    signStatus.textContent = "Не удалось подписать JWT.";
  } finally {
    signButton.disabled = false;
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    signStatus.textContent = "JWT скопирован.";
  } catch {
    output.focus();
    output.select();
    signStatus.textContent = "JWT выделен. Нажмите Ctrl+C, чтобы скопировать.";
  }
});
