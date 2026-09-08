const $ = selector => document.querySelector(selector);
const docs = $("#documents");
const accessCode = $("#access-code");
const ACCESS_CODE_KEY = "textify-access-code";
let refreshVersion = 0;
accessCode.value = sessionStorage.getItem(ACCESS_CODE_KEY) || "";

function headers(json = false) {
  const code = accessCode.value.trim();
  if (code) sessionStorage.setItem(ACCESS_CODE_KEY, code);
  else sessionStorage.removeItem(ACCESS_CODE_KEY);
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(code ? { "X-Textify-Access-Code": code } : {}) };
}

function clearAnswer() {
  $("#answer").classList.add("hidden");
  $("#answer-text").textContent = "";
  $("#citations").replaceChildren();
}

async function readResponse(response) {
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map(item => item.msg).join("; ") : data.detail;
    throw new Error(detail || "Request failed. Try again later.");
  }
  return data;
}

async function refresh(selected = docs.value) {
  const version = ++refreshVersion;
  const status = $("#access-status");
  if (!accessCode.value.trim()) {
    headers();
    docs.replaceChildren(new Option("Enter the access code to load sources", ""));
    $("#remove").disabled = true;
    clearAnswer();
    status.textContent = "Workspace locked. Enter your access code.";
    return;
  }
  try {
    const data = await readResponse(await fetch("/api/documents", { headers: headers() }));
    if (version !== refreshVersion) return;
    // Filenames are untrusted document data, never HTML.
    docs.replaceChildren(new Option(data.length ? "Choose an indexed source" : "No sources yet. Upload your first document.", ""));
    for (const document of data) docs.add(new Option(`${document.name} · ${document.chunks} chunks`, document.id));
    docs.value = selected;
    $("#remove").disabled = !docs.value;
    status.textContent = "Private workspace unlocked for this browser session.";
  } catch (error) {
    if (version !== refreshVersion) return;
    docs.replaceChildren(new Option("Access code required", ""));
    $("#remove").disabled = true;
    clearAnswer();
    status.textContent = error.message;
  }
}

refresh();
$("#theme").onclick = () => document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
$("#unlock").onsubmit = event => { event.preventDefault(); clearAnswer(); refresh(); };
$("#lock").onclick = () => { accessCode.value = ""; refresh(); };
accessCode.onchange = () => { clearAnswer(); refresh(); };
docs.onchange = () => { clearAnswer(); $("#remove").disabled = !docs.value; };

$("#upload").onsubmit = async event => {
  event.preventDefault();
  const status = $("#upload-status");
  const button = $("#upload button");
  const file = $("#file").files[0];
  if (!file || button.disabled) return;
  button.disabled = true;
  status.textContent = "Indexing source…";
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await readResponse(await fetch("/api/documents", { method: "POST", headers: headers(), body: form }));
    status.textContent = data.deduplicated ? `${data.name}: already indexed; using the existing source.` : `${data.name}: ${data.chunks} semantic chunks indexed.`;
    clearAnswer();
    await refresh(data.id);
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};

$("#ask").onsubmit = async event => {
  event.preventDefault();
  const status = $("#ask-status");
  const button = $("#ask button");
  if (button.disabled) return;
  if (!docs.value) { status.textContent = "Choose an indexed source first."; return; }
  button.disabled = true;
  clearAnswer();
  status.textContent = "Finding evidence…";
  const selected = docs.value;
  const code = accessCode.value;
  try {
    const data = await readResponse(await fetch("/api/ask", { method: "POST", headers: headers(true), body: JSON.stringify({ document_id: selected, question: $("#question").value }) }));
    if (docs.value !== selected || accessCode.value !== code) return;
    $("#answer").classList.remove("hidden");
    $("#answer-text").textContent = data.answer;
    for (const citation of data.citations) {
      const article = document.createElement("article");
      article.className = "citation";
      const title = document.createElement("b");
      title.textContent = `[${citation.source}] chunk ${citation.chunk}`;
      const excerpt = document.createElement("p");
      excerpt.textContent = citation.text;
      article.append(title, excerpt);
      $("#citations").append(article);
    }
    status.textContent = "Answer ready. Check its claims against the evidence below.";
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};

$("#remove").onclick = async () => {
  const id = docs.value;
  if (!id || !confirm("Remove this source and its stored passages?")) return;
  const button = $("#remove");
  button.disabled = true;
  try {
    await readResponse(await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() }));
    clearAnswer();
    await refresh("");
    $("#ask-status").textContent = "Source and stored passages removed.";
  } catch (error) {
    $("#ask-status").textContent = error.message;
    button.disabled = !docs.value;
  }
};
