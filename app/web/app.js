const $ = (selector) => document.querySelector(selector);
const docs = $("#documents");
const accessCode = $("#access-code");
const ACCESS_CODE_KEY = "textify-access-code";
let refreshVersion = 0;
let workspaceVersion = 0;
let uploadController;
let askController;
let removeController;
let latestDocuments = [];
let sessionUploads = 0;
let sessionQuestions = 0;
accessCode.value = sessionStorage.getItem(ACCESS_CODE_KEY) || "";

function abortPending() {
  uploadController?.abort();
  askController?.abort();
  removeController?.abort();
}

function beginWorkspaceTransition() {
  workspaceVersion += 1;
  abortPending();
}

function applyTheme(value) {
  const light = value === "light";
  document.documentElement.dataset.theme = light ? "light" : "dark";
  $("#theme").setAttribute("aria-pressed", String(light));
  $("#theme").textContent = "Light theme";
  localStorage.setItem("textify-theme", light ? "light" : "dark");
}

function headers(json = false) {
  const code = accessCode.value.trim();
  if (code) sessionStorage.setItem(ACCESS_CODE_KEY, code);
  else sessionStorage.removeItem(ACCESS_CODE_KEY);
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(code ? { "X-Textify-Access-Code": code } : {}),
  };
}

function clearAnswer() {
  $("#answer").classList.add("hidden");
  $("#answer-text").textContent = "";
  $("#citations").replaceChildren();
}

/* ---------- toasts: real, ephemeral, announced politely; never the only
   channel for a status change, since every caller also writes the same
   text into a #*-status region first. ---------- */
function toast(message, tone) {
  const stack = $("#toastStack");
  if (!stack || !message) return;
  const item = document.createElement("div");
  item.className = "toast" + (tone ? ` is-${tone}` : "");
  item.setAttribute("role", "status");
  item.textContent = message;
  stack.appendChild(item);
  requestAnimationFrame(() => item.classList.add("is-in"));
  setTimeout(() => {
    item.classList.remove("is-in");
    setTimeout(() => item.remove(), 260);
  }, 3200);
}

function renderSessionMeta() {
  const el = $("#sessionMeta");
  if (!el) return;
  if (!sessionUploads && !sessionQuestions) {
    el.textContent = "";
    return;
  }
  const parts = [];
  if (sessionUploads)
    parts.push(`${sessionUploads} upload${sessionUploads === 1 ? "" : "s"}`);
  if (sessionQuestions)
    parts.push(
      `${sessionQuestions} question${sessionQuestions === 1 ? "" : "s"}`,
    );
  el.textContent = `This browser session: ${parts.join(" · ")}.`;
}

async function readResponse(response) {
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).join("; ")
      : data.detail;
    const message = detail || "Request failed. Try again later.";
    const retryAfter = Number(response.headers.get("Retry-After"));
    const error = new Error(
      response.status === 429 && retryAfter > 0
        ? `${message} Try again in about ${Math.ceil(retryAfter / 60)} min.`
        : message,
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

/* ---------- a real, live read of GET /api/documents rendered as cards,
   next to the native <select> that stays the accessible control of
   record. Selecting a card drives the same <select> + change event the
   rest of the app already listens to. ---------- */
function renderSourceCards(data) {
  latestDocuments = data;
  const host = $("#sourceCards");
  if (!host) return;
  host.replaceChildren();
  if (!data.length) return;
  for (const document_ of data) {
    const card = document.createElement("div");
    card.className = "source-card";
    card.dataset.active = String(docs.value === document_.id);

    const select = document.createElement("button");
    select.type = "button";
    select.className = "source-card-select";
    const name = document.createElement("span");
    name.className = "source-card-name";
    name.textContent = document_.name;
    const sub = document.createElement("span");
    sub.className = "source-card-sub";
    sub.textContent = `${document_.chunks} chunks`;
    select.append(name, sub);
    select.addEventListener("click", () => {
      docs.value = document_.id;
      docs.dispatchEvent(new Event("change"));
      host
        .querySelectorAll(".source-card")
        .forEach((el) => (el.dataset.active = String(el === card)));
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "source-card-remove";
    remove.setAttribute("aria-label", `Remove ${document_.name}`);
    remove.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeDocument(document_.id);
    });

    card.append(select, remove);
    host.appendChild(card);
  }
}

async function refresh(selected = docs.value) {
  const version = ++refreshVersion;
  const status = $("#access-status");
  if (!accessCode.value.trim()) {
    headers();
    docs.replaceChildren(
      new Option("Enter the access code to load sources", ""),
    );
    $("#remove").disabled = true;
    clearAnswer();
    renderSourceCards([]);
    status.textContent = "Workspace locked. Enter your access code.";
    return;
  }
  try {
    const data = await readResponse(
      await fetch("/api/documents", { headers: headers() }),
    );
    if (version !== refreshVersion) return;
    // Filenames are untrusted document data, never HTML.
    docs.replaceChildren(
      new Option(
        data.length
          ? "Choose an indexed source"
          : "No sources yet. Upload your first document.",
        "",
      ),
    );
    for (const document of data)
      docs.add(
        new Option(`${document.name} · ${document.chunks} chunks`, document.id),
      );
    docs.value = selected;
    $("#remove").disabled = !docs.value;
    renderSourceCards(data);
    status.textContent = "Private workspace unlocked for this browser session.";
  } catch (error) {
    if (version !== refreshVersion) return;
    docs.replaceChildren(new Option("Access code required", ""));
    $("#remove").disabled = true;
    clearAnswer();
    renderSourceCards([]);
    status.textContent = error.message;
  }
}

applyTheme(
  localStorage.getItem("textify-theme") === "light" ? "light" : "dark",
);
refresh();
$("#theme").onclick = () => {
  const next =
    document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  toast(
    next === "light" ? "Switched to light theme." : "Switched to dark theme.",
  );
};
$("#unlock").onsubmit = (event) => {
  event.preventDefault();
  beginWorkspaceTransition();
  clearAnswer();
  refresh();
};
$("#lock").onclick = () => {
  beginWorkspaceTransition();
  accessCode.value = "";
  $("#upload-status").textContent =
    "PDF, DOCX, TXT · max 3 MB · 3 uploads per hour";
  $("#ask-status").textContent =
    "12 questions per hour per client. Answers are capped at 350 tokens.";
  refresh();
  toast("Workspace locked.");
};
docs.onchange = () => {
  askController?.abort();
  clearAnswer();
  $("#remove").disabled = !docs.value;
  $("#sourceCards")
    .querySelectorAll(".source-card")
    .forEach((el, index) => {
      el.dataset.active = String(latestDocuments[index]?.id === docs.value);
    });
};

async function submitUpload(file) {
  const status = $("#upload-status");
  const button = $("#upload button");
  if (!file || button.disabled) return;
  uploadController?.abort();
  const controller = new AbortController();
  uploadController = controller;
  const version = workspaceVersion;
  button.disabled = true;
  status.classList.remove("is-error", "is-good");
  $("#upload").setAttribute("aria-busy", "true");
  status.textContent = "Indexing source…";
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await readResponse(
      await fetch("/api/documents", {
        method: "POST",
        headers: headers(),
        body: form,
        signal: controller.signal,
      }),
    );
    if (version !== workspaceVersion || controller !== uploadController) return;
    status.classList.add("is-good");
    status.textContent = data.deduplicated
      ? `${data.name}: already indexed; using the existing source.`
      : `${data.name}: ${data.chunks} semantic chunks indexed.`;
    if (!data.deduplicated) {
      sessionUploads += 1;
      renderSessionMeta();
      toast(`${data.name} indexed — ${data.chunks} chunks.`, "good");
    } else {
      toast(`${data.name} was already indexed.`);
    }
    clearAnswer();
    await refresh(data.id);
  } catch (error) {
    if (error.name === "AbortError" || version !== workspaceVersion) return;
    status.classList.add("is-error");
    status.textContent = error.message;
    toast(error.message, "error");
  } finally {
    if (controller === uploadController) {
      uploadController = undefined;
      button.disabled = false;
      $("#upload").removeAttribute("aria-busy");
    }
  }
}

$("#upload").onsubmit = (event) => {
  event.preventDefault();
  submitUpload($("#file").files[0]);
};

/* ---------- drag-and-drop onto the dropzone/label. It only ever assigns
   the same #file input and reuses submitUpload — no parallel upload path
   to keep secure or keep in sync with the tested one. ---------- */
const dropzone = $("#dropzone");
["dragenter", "dragover"].forEach((name) => {
  dropzone.addEventListener(name, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-drag");
  });
});
["dragleave", "drop"].forEach((name) => {
  dropzone.addEventListener(name, () => dropzone.classList.remove("is-drag"));
});
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  $("#file").files = transfer.files;
  submitUpload(file);
});

$("#ask").onsubmit = async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const status = $("#ask-status");
  const button = $("#ask button");
  if (button.disabled) return;
  if (!docs.value) {
    status.textContent = "Choose an indexed source first.";
    return;
  }
  askController?.abort();
  const controller = new AbortController();
  askController = controller;
  const version = workspaceVersion;
  button.disabled = true;
  formElement.setAttribute("aria-busy", "true");
  clearAnswer();
  status.textContent = "Finding evidence…";
  const selected = docs.value;
  const code = accessCode.value;
  try {
    const data = await readResponse(
      await fetch("/api/ask", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          document_id: selected,
          question: $("#question").value,
        }),
        signal: controller.signal,
      }),
    );
    if (
      version !== workspaceVersion ||
      controller !== askController ||
      docs.value !== selected ||
      accessCode.value !== code
    )
      return;
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
    status.textContent =
      "Answer ready. Check its claims against the evidence below.";
    sessionQuestions += 1;
    renderSessionMeta();
    $("#answer").scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    if (error.name === "AbortError" || version !== workspaceVersion) return;
    status.textContent = error.message;
    toast(error.message, "error");
  } finally {
    if (controller === askController) {
      askController = undefined;
      button.disabled = false;
      formElement.removeAttribute("aria-busy");
    }
  }
};

$("#copyAnswer").onclick = () => {
  const text = $("#answer-text").textContent;
  if (!text || !navigator.clipboard?.writeText) {
    toast("Select and copy the answer text manually.");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() => toast("Answer copied to the clipboard.", "good"))
    .catch(() => toast("Could not copy — select the text manually.", "error"));
};

async function removeDocument(id) {
  if (!id || !confirm("Remove this source and its stored passages?")) return;
  removeController?.abort();
  const controller = new AbortController();
  removeController = controller;
  const version = workspaceVersion;
  const button = $("#remove");
  const wasSelected = docs.value === id;
  if (wasSelected) button.disabled = true;
  try {
    await readResponse(
      await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: headers(),
        signal: controller.signal,
      }),
    );
    if (version !== workspaceVersion || controller !== removeController) return;
    if (wasSelected) clearAnswer();
    await refresh(wasSelected ? "" : docs.value);
    $("#ask-status").textContent = "Source and stored passages removed.";
    toast("Source removed.");
  } catch (error) {
    if (error.name === "AbortError" || version !== workspaceVersion) return;
    $("#ask-status").textContent = error.message;
    toast(error.message, "error");
    if (wasSelected) button.disabled = !docs.value;
  } finally {
    if (controller === removeController) removeController = undefined;
  }
}

$("#remove").onclick = () => removeDocument(docs.value);

/* ---------- command palette: every action here drives a real element
   already on this single-page app — no second, fake copy of the workflow. ---------- */
const cmdkOverlay = $("#cmdkOverlay");
const cmdkInput = $("#cmdkInput");
const cmdkList = $("#cmdkList");
const paletteToggle = $("#paletteToggle");
let cmdkActive = 0;
let cmdkMatches = [];

function paletteActions() {
  return [
    {
      label: "Jump to workspace access",
      icon: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      run: () => {
        $("#access").scrollIntoView({ behavior: "smooth", block: "start" });
        accessCode.focus();
      },
    },
    {
      label: "Add a source",
      icon: '<path d="M12 5v14M5 12h14"/>',
      run: () => {
        $("#index").scrollIntoView({ behavior: "smooth", block: "start" });
        $("#file").focus();
      },
    },
    {
      label: "Ask a question",
      icon: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-4-1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5Z"/>',
      run: () => {
        $("#retrieve").scrollIntoView({ behavior: "smooth", block: "start" });
        $("#question").focus();
      },
    },
    {
      label:
        document.documentElement.dataset.theme === "light"
          ? "Switch to dark theme"
          : "Switch to light theme",
      icon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
      run: () => $("#theme").click(),
    },
    {
      label: "Lock workspace",
      icon: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      run: () => $("#lock").click(),
    },
    {
      label: "Open Textify on GitHub",
      icon: '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83"/>',
      run: () =>
        window.open(
          "https://github.com/abheet19",
          "_blank",
          "noopener,noreferrer",
        ),
    },
  ];
}

function renderPalette(filter) {
  const query = (filter || "").trim().toLowerCase();
  cmdkMatches = paletteActions().filter((action) =>
    action.label.toLowerCase().includes(query),
  );
  cmdkList.replaceChildren();
  if (!cmdkMatches.length) {
    const empty = document.createElement("li");
    empty.className = "cmdk-empty";
    empty.textContent = "No matching commands.";
    cmdkList.append(empty);
    return;
  }
  if (cmdkActive >= cmdkMatches.length) cmdkActive = cmdkMatches.length - 1;
  cmdkMatches.forEach((action, index) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cmdk-item" + (index === cmdkActive ? " is-active" : "");
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${action.icon}</svg><span>${""}</span>`;
    button.querySelector("span").textContent = action.label;
    button.addEventListener("click", () => {
      closePalette();
      action.run();
    });
    li.append(button);
    cmdkList.append(li);
  });
}

function openPalette() {
  cmdkActive = 0;
  cmdkOverlay.hidden = false;
  paletteToggle.setAttribute("aria-expanded", "true");
  cmdkInput.value = "";
  renderPalette("");
  cmdkInput.focus();
}

function closePalette() {
  cmdkOverlay.hidden = true;
  paletteToggle.setAttribute("aria-expanded", "false");
  paletteToggle.focus();
}

paletteToggle.addEventListener("click", () => {
  if (cmdkOverlay.hidden) openPalette();
  else closePalette();
});
cmdkOverlay.addEventListener("click", (event) => {
  if (event.target === cmdkOverlay) closePalette();
});
cmdkInput.addEventListener("input", () => {
  cmdkActive = 0;
  renderPalette(cmdkInput.value);
});
cmdkInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    cmdkActive = Math.min(cmdkActive + 1, cmdkMatches.length - 1);
    renderPalette(cmdkInput.value);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    cmdkActive = Math.max(cmdkActive - 1, 0);
    renderPalette(cmdkInput.value);
  } else if (event.key === "Enter") {
    event.preventDefault();
    const action = cmdkMatches[cmdkActive];
    if (action) {
      closePalette();
      action.run();
    }
  }
});
document.addEventListener("keydown", (event) => {
  const key = (event.key || "").toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === "k") {
    event.preventDefault();
    cmdkOverlay.hidden ? openPalette() : closePalette();
  } else if (event.key === "Escape" && !cmdkOverlay.hidden) {
    closePalette();
  }
});

renderSessionMeta();
