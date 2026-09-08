const $ = selector => document.querySelector(selector);
const docs = $("#documents");
const accessCode = $("#access-code");
const ACCESS_CODE_KEY = "textify-access-code";

accessCode.value = sessionStorage.getItem(ACCESS_CODE_KEY) || "";

function headers(json = false) {
  const code = accessCode.value.trim();
  if (code) sessionStorage.setItem(ACCESS_CODE_KEY, code);
  else sessionStorage.removeItem(ACCESS_CODE_KEY);
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(code ? { "X-Textify-Access-Code": code } : {}) };
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed.");
  return data;
}

async function refresh() {
  const status = $("#access-status");
  if (!accessCode.value.trim()) return;
  try {
    const data = await readResponse(await fetch("/api/documents", { headers: headers() }));
    docs.innerHTML = '<option value="">Choose an indexed source</option>' + data.map(d => `<option value="${d.id}">${d.name} · ${d.chunks} chunks</option>`).join("");
    status.textContent = "Private workspace unlocked for this browser session.";
  } catch (error) {
    docs.innerHTML = '<option value="">Access code required</option>';
    status.textContent = error.message;
  }
}

refresh();
$("#theme").onclick = () => document.documentElement.dataset.theme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
accessCode.onchange = refresh;

$("#upload").onsubmit = async event => {
  event.preventDefault();
  const status = $("#upload-status");
  const file = $("#file").files[0];
  if (!file) return;
  status.textContent = "Indexing source…";
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await readResponse(await fetch("/api/documents", { method: "POST", headers: headers(), body: form }));
    status.textContent = `${data.name}: ${data.chunks} semantic chunks indexed.`;
    refresh();
  } catch (error) {
    status.textContent = error.message;
  }
};

$("#ask").onsubmit = async event => {
  event.preventDefault();
  if (!docs.value) return alert("Choose an indexed source first.");
  try {
    const data = await readResponse(await fetch("/api/ask", { method: "POST", headers: headers(true), body: JSON.stringify({ document_id: docs.value, question: $("#question").value }) }));
    $("#answer").classList.remove("hidden");
    $("#answer-text").textContent = data.answer;
    $("#citations").innerHTML = data.citations.map(c => `<article class="citation"><b>[${c.source}] chunk ${c.chunk}</b><br>${c.text}</article>`).join("");
  } catch (error) {
    alert(error.message);
  }
};
