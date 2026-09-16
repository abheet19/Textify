/* =============================================================================
   Textify — app.js  (redesign-glass)
   The glass workspace shell wired to the real FastAPI API:
     GET    /api/documents                 list indexed sources
     POST   /api/documents  (multipart)    index a PDF/DOCX/TXT source
     POST   /api/ask        (json)         cited answer against one source
     DELETE /api/documents/{id}            remove a source + its chunks
   Untrusted document/answer text is ALWAYS written with textContent, never
   innerHTML. Stale private responses are dropped via a workspace version guard.
   ============================================================================= */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const root = document.documentElement;

  const ACCESS_CODE_KEY = "textify-access-code";
  const THEME_KEY = "textify-theme";
  const ASK_BUDGET = 12;
  const UPLOAD_BUDGET = 3;

  /* ---------- session state ---------- */
  let workspaceVersion = 0;
  let refreshVersion = 0;
  let uploadController;
  let askController;
  let removeController;
  let latestDocuments = [];
  let sessionUploads = 0;
  let sessionQuestions = 0;
  let citeInline = true;
  let pendingUploadContext = "sources";
  let onboardFile = null;
  let detailDocName = "";
  let demoMode = false;

  /* ---------- element refs ---------- */
  const docs = $("#documents");
  const composerInput = $("#composerInput");
  const composerHint = $("#composerHint");
  const askBtn = $("#askBtn");
  const thread = $("#thread");
  const threadEmpty = $("#threadEmpty");
  const askGrid = $("#askGrid");
  const fileInput = $("#file");
  const lockChip = $("#lockChip");
  const lockChipText = $("#lockChipText");
  const lockSwitch = $("#lockSwitch");
  const rateChipText = $("#rateChipText");
  const rateDot = $("#rateDot");
  const topbarEyebrow = $("#topbarEyebrow");
  const topbarTitle = $("#topbarTitle");
  const detailFile = $("#detailFile");
  const detailExcerpt = $("#detailExcerpt");
  const detailProvenance = $("#detailProvenance");
  const uploadStatus = $("#upload-status");
  const askStatus = $("#ask-status");

  async function loadRuntimeSummary() {
    const target = $("#embeddingRuntime");
    if (!target) return;
    try {
      const response = await fetch("/health", { cache: "no-store" });
      const data = await readResponse(response);
      const provider =
        data.embedding_provider === "local"
          ? "local BGE"
          : data.embedding_provider === "openai"
            ? "OpenAI"
            : data.embedding_provider;
      const dimensions = Number(data.embedding_dimensions);
      target.textContent =
        provider && Number.isFinite(dimensions)
          ? `${provider} · ${dimensions}-d`
          : "Configured by server";
    } catch {
      target.textContent = "Configured by server";
    }
  }

  /* ---------- helpers ---------- */
  function currentCode() {
    try {
      return (sessionStorage.getItem(ACCESS_CODE_KEY) || "").trim();
    } catch {
      return "";
    }
  }
  function setCode(code) {
    try {
      if (code) sessionStorage.setItem(ACCESS_CODE_KEY, code);
      else sessionStorage.removeItem(ACCESS_CODE_KEY);
    } catch {
      /* private mode: keep going in-memory only */
    }
  }
  const isLocked = () => !currentCode();

  function headers(json = false) {
    const code = currentCode();
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(code ? { "X-Textify-Access-Code": code } : {}),
    };
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

  function beginWorkspaceTransition() {
    workspaceVersion += 1;
    uploadController?.abort();
    askController?.abort();
    removeController?.abort();
  }

  function clearConversation() {
    thread.replaceChildren();
    thread.appendChild(threadEmpty);
    threadEmpty.hidden = false;
    thread._citeMap = {};
    askGrid.classList.remove("detail-open");
    detailFile.textContent = "";
    detailExcerpt.textContent = "";
    detailProvenance.textContent = "";
  }

  /* ---------- toast ---------- */
  const toastEl = $("#toast");
  const toastText = $("#toastText");
  let toastTimer;
  function toast(msg, tone) {
    if (!msg) return;
    toastText.textContent = msg;
    toastEl.className = "toast show" + (tone ? " is-" + tone : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  /* ---------- theme ---------- */
  function applyTheme(mode) {
    const light = mode === "light";
    root.setAttribute("data-theme", light ? "light" : "dark");
    const themeBtn = $("#theme");
    if (themeBtn) themeBtn.setAttribute("aria-pressed", String(light));
    const tip = $("#themeTip");
    if (tip)
      tip.textContent = light
        ? "Switch to dark theme"
        : "Switch to light theme";
    $$("[data-theme-choice]").forEach((b) =>
      b.classList.toggle(
        "on",
        b.getAttribute("data-theme-choice") === (light ? "light" : "dark"),
      ),
    );
    try {
      localStorage.setItem(THEME_KEY, light ? "light" : "dark");
    } catch {
      /* ignore */
    }
  }
  $("#theme").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    toast(
      next === "light" ? "Switched to light theme." : "Switched to dark theme.",
    );
  });
  $$("[data-theme-choice]").forEach((b) =>
    b.addEventListener("click", () => {
      applyTheme(b.getAttribute("data-theme-choice"));
      toast("Theme set to " + b.getAttribute("data-theme-choice") + ".");
    }),
  );

  /* ---------- screen router ---------- */
  const screens = $$(".screen");
  const meta = {
    ask: { eyebrow: "02 · Retrieve", title: "Ask your documents" },
    sources: { eyebrow: "01 · Index", title: "Evidence sources" },
    new: { eyebrow: "New", title: "Start a workspace" },
    settings: { eyebrow: "Configure", title: "Settings" },
  };
  function goTo(name) {
    screens.forEach((s) => (s.hidden = s.getAttribute("data-screen") !== name));
    $$(".rail-btn[data-nav]").forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-nav") === name),
    );
    if (meta[name]) {
      topbarEyebrow.textContent = meta[name].eyebrow;
      topbarTitle.textContent = meta[name].title;
    }
  }
  $$("[data-nav]").forEach((el) =>
    el.addEventListener("click", () => goTo(el.getAttribute("data-nav"))),
  );

  function focusCodeField() {
    // The lock card is hidden while the demo runs; leave it so the field exists.
    if (demoMode) exitDemo();
    goTo("ask");
    setTimeout(() => $("#access-code")?.focus(), 60);
  }

  /* ---------- lock / unlock ---------- */
  function applyLockUI() {
    const locked = isLocked();
    lockChipText.textContent = locked ? "Locked" : "Unlocked";
    lockChip.style.color = locked ? "var(--amber)" : "";
    if (lockSwitch) {
      lockSwitch.classList.toggle("on", locked);
      lockSwitch.setAttribute("aria-checked", String(locked));
    }
    $("#askLockCard").hidden = !locked;
    $("#sourcesLockedNotice").hidden = !locked;
    const dz = $("#dropzone");
    const tw = $("#sourcesTableWrap");
    if (dz) dz.classList.toggle("disabled", locked);
    if (tw) tw.classList.toggle("disabled", locked);
    if (locked) askGrid.classList.remove("detail-open");
  }
  function lockWorkspace() {
    beginWorkspaceTransition();
    clearConversation();
    setCode("");
    if (uploadStatus)
      uploadStatus.textContent =
        "PDF, DOCX, TXT · max 3 MB · 3 uploads per hour";
    applyLockUI();
    refresh();
    toast("Workspace locked.");
  }
  function unlock(code, opts) {
    code = (code || "").trim();
    const askErr = $("#askLockError");
    const codeErr = $("#codeFieldError");
    if (!code) {
      const msg = "A valid Textify access code is required.";
      if (askErr) askErr.textContent = msg;
      if (codeErr) codeErr.textContent = msg;
      return false;
    }
    if (askErr) askErr.textContent = "";
    if (codeErr) codeErr.textContent = "";
    demoMode = false;
    $("#demoStarters").hidden = true;
    lockChip.style.color = "";
    beginWorkspaceTransition();
    setCode(code);
    const askInput = $("#access-code");
    if (askInput) askInput.value = "";
    applyLockUI();
    refresh();
    if (!opts || !opts.silent)
      toast("Private workspace unlocked for this browser session.");
    return true;
  }
  lockChip.addEventListener("click", () =>
    demoMode ? exitDemo() : isLocked() ? focusCodeField() : lockWorkspace(),
  );
  lockSwitch.addEventListener("click", () =>
    isLocked() ? focusCodeField() : lockWorkspace(),
  );
  $("#askLockUnlock").addEventListener("click", () =>
    unlock($("#access-code").value),
  );
  $("#access-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#askLockUnlock").click();
    }
  });
  $("#sourcesUnlockCta").addEventListener("click", focusCodeField);

  /* ---------- read-only public demo ---------- */
  function renderDemoSource(data) {
    latestDocuments = [
      { id: data.id, name: data.name, chunks: data.chunks, demo: true },
    ];
    docs.replaceChildren(
      new Option(`${data.name} · ${data.chunks} chunks`, data.id),
    );
    docs.value = data.id;

    const list = $("#sourceList");
    list.replaceChildren();
    const row = document.createElement("div");
    row.className = "source-row";
    row.setAttribute("role", "listitem");
    row.dataset.row = data.id;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "source-item demo-source active";
    item.dataset.source = data.id;
    item.innerHTML =
      '<span class="status-dot indexed"></span><span class="source-item-body"><span class="source-name"></span><span class="source-sub"></span></span>';
    item.querySelector(".source-name").textContent = data.name;
    item.querySelector(".source-sub").textContent =
      `Read-only demo · ${data.chunks} chunks`;
    row.append(item);
    list.appendChild(row);

    // Keep the read-only sample consistent across both product surfaces. The
    // Ask pane and Sources table describe the same seeded document; demo mode
    // never adds a remove action or enables uploads.
    const tbody = $("#sourcesTbody");
    tbody.replaceChildren();
    const tableRow = document.createElement("tr");
    tableRow.dataset.row = data.id;
    tableRow.innerHTML =
      '<td><div class="file-cell"><span class="file-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      iconForName(data.name) +
      '</svg></span><div><div class="file-name"></div><div class="source-sub">Read-only demo</div></div></div></td>' +
      '<td><span class="status-pill indexed">● Indexed</span></td>' +
      '<td class="mono"></td>' +
      '<td class="mono">Sample</td>' +
      '<td><span class="answer-meta">View only</span></td>';
    tableRow.querySelector(".file-name").textContent = data.name;
    tableRow.querySelector("td:nth-child(3)").textContent = String(data.chunks);
    tbody.appendChild(tableRow);

    $("#sourcesCount").textContent = "1";
    $("#sourceList").hidden = false;
    $("#sourcesEmptyState").hidden = true;
    $("#sourcesLockedNotice").hidden = true;
    $("#sourcesTableWrap").classList.remove("disabled");
    const tableScroll = $("#sourcesTableWrap .table-scroll");
    if (tableScroll) tableScroll.hidden = false;
    $("#tableEmptyState").hidden = true;
    detailDocName = data.name;
  }

  function renderDemoStarters(questions) {
    const holder = $("#demoStarterBtns");
    holder.replaceChildren();
    (questions || []).forEach((q) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "demo-starter-chip";
      chip.textContent = q;
      chip.addEventListener("click", () => {
        if (askBtn.disabled) return;
        composerInput.value = q;
        $("#composerForm").requestSubmit();
      });
      holder.appendChild(chip);
    });
    $("#demoStarters").hidden = false;
  }

  async function enterDemo() {
    const demoBtn = $("#tryDemoBtn");
    if (demoBtn) demoBtn.disabled = true;
    try {
      const data = await readResponse(await fetch("/api/demo"));
      demoMode = true;
      beginWorkspaceTransition();
      $("#askLockCard").hidden = true;
      lockChipText.textContent = "Read-only demo";
      lockChip.style.color = "var(--amber)";
      renderDemoSource(data);
      renderDemoStarters(data.questions);
      // Fresh thread for the demo run.
      thread.replaceChildren();
      thread.appendChild(threadEmpty);
      threadEmpty.hidden = false;
      goTo("ask");
      refreshAskAvailability();
      toast("Read-only demo ready — ask or click an example question.");
    } catch (error) {
      toast(
        error.message || "The demo is warming up. Try again shortly.",
        "error",
      );
    } finally {
      if (demoBtn) demoBtn.disabled = false;
    }
  }

  function exitDemo() {
    if (!demoMode) return;
    demoMode = false;
    beginWorkspaceTransition();
    $("#demoStarters").hidden = true;
    thread.replaceChildren();
    thread.appendChild(threadEmpty);
    threadEmpty.hidden = false;
    askGrid.classList.remove("detail-open");
    lockChip.style.color = "";
    applyLockUI();
    refresh();
  }

  $("#tryDemoBtn").addEventListener("click", enterDemo);
  $("#demoExitBtn").addEventListener("click", exitDemo);

  /* ---------- source rendering (pane list + table + native select) ---------- */
  function iconForName(name) {
    return /\.docx?$/i.test(name)
      ? '<path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h4"/>'
      : '<path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/>';
  }

  function renderAll(data, selected) {
    latestDocuments = data;
    const sel = selected === undefined ? docs.value : selected;

    /* native <select> — the accessible control of record (filenames are data) */
    docs.replaceChildren(
      new Option(
        data.length
          ? "Choose an indexed source"
          : "No sources yet. Upload your first document.",
        "",
      ),
    );
    for (const d of data)
      docs.add(new Option(`${d.name} · ${d.chunks} chunks`, d.id));
    docs.value = sel;
    if (!docs.value && data.length) {
      docs.value = data[0].id;
    }

    /* ask-screen dot-status list */
    const list = $("#sourceList");
    list.replaceChildren();
    for (const d of data) {
      const row = document.createElement("div");
      row.className = "source-row";
      row.setAttribute("role", "listitem");
      row.dataset.row = d.id;

      const item = document.createElement("button");
      item.type = "button";
      item.className = "source-item" + (d.id === docs.value ? " active" : "");
      item.dataset.source = d.id;
      item.innerHTML =
        '<span class="status-dot indexed"></span><span class="source-item-body"><span class="source-name"></span><span class="source-sub"></span></span>';
      item.querySelector(".source-name").textContent = d.name;
      item.querySelector(".source-sub").textContent = `${d.chunks} chunks`;
      item.addEventListener("click", () => selectSource(d.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "source-remove";
      remove.setAttribute("aria-label", "Remove source");
      remove.title = "Remove source";
      remove.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        removeDocument(d.id);
      });

      row.append(item, remove);
      list.appendChild(row);
    }

    /* sources-screen table */
    const tbody = $("#sourcesTbody");
    tbody.replaceChildren();
    for (const d of data) {
      const tr = document.createElement("tr");
      tr.dataset.row = d.id;
      const added = d.sessionAdded ? "this session" : "—";
      tr.innerHTML =
        '<td><div class="file-cell"><span class="file-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
        iconForName(d.name) +
        '</svg></span><div><div class="file-name"></div></div></div></td>' +
        '<td><span class="status-pill indexed">● Indexed</span></td>' +
        '<td class="mono">' +
        d.chunks +
        "</td>" +
        '<td class="mono">' +
        added +
        "</td>" +
        '<td><div class="row-actions"><button class="btn small" type="button" data-remove-row>Remove</button></div></td>';
      tr.querySelector(".file-name").textContent = d.name;
      tr.querySelector("[data-remove-row]").addEventListener("click", () =>
        removeDocument(d.id),
      );
      tbody.appendChild(tr);
    }

    updateDerived();
  }

  function updateDerived() {
    const locked = isLocked();
    const total = latestDocuments.length;
    $("#sourcesCount").textContent = String(total);
    $("#sourceList").hidden = locked || total === 0;
    $("#sourcesEmptyState").hidden = locked || total > 0;
    const tableScroll = document.querySelector(
      "#sourcesTableWrap .table-scroll",
    );
    if (tableScroll) tableScroll.hidden = total === 0;
    $("#tableEmptyState").hidden = total > 0;
    // active card sync
    $$("#sourceList .source-item").forEach((i) =>
      i.classList.toggle("active", i.dataset.source === docs.value),
    );
    refreshAskAvailability();
    renderSessionMeta();
  }

  function selectSource(id) {
    docs.value = id;
    docs.dispatchEvent(new Event("change"));
    $$("#sourceList .source-item").forEach((i) =>
      i.classList.toggle("active", i.dataset.source === id),
    );
    refreshAskAvailability();
  }

  docs.addEventListener("change", () => {
    refreshAskAvailability();
  });

  /* ---------- refresh: live GET /api/documents ---------- */
  async function refresh(selected) {
    const version = ++refreshVersion;
    const sel = selected === undefined ? docs.value : selected;
    if (isLocked()) {
      docs.replaceChildren(
        new Option("Enter the access code to load sources", ""),
      );
      latestDocuments = [];
      $("#sourceList").replaceChildren();
      $("#sourcesTbody").replaceChildren();
      updateDerived();
      applyLockUI();
      return;
    }
    try {
      const data = await readResponse(
        await fetch("/api/documents", { headers: headers() }),
      );
      if (version !== refreshVersion) return;
      // preserve any session-added flags across refreshes
      const flagged = new Set(
        latestDocuments.filter((d) => d.sessionAdded).map((d) => d.id),
      );
      for (const d of data) if (flagged.has(d.id)) d.sessionAdded = true;
      renderAll(data, sel);
      applyLockUI();
    } catch (error) {
      if (version !== refreshVersion) return;
      latestDocuments = [];
      docs.replaceChildren(new Option("Access code required", ""));
      $("#sourceList").replaceChildren();
      $("#sourcesTbody").replaceChildren();
      // A rejected code must never leave the shell looking unlocked-but-empty:
      // drop it, restore the lock card, and surface the server's reason there.
      if (error.status === 401 || error.status === 503) setCode("");
      updateDerived();
      applyLockUI();
      if ($("#askLockError")) $("#askLockError").textContent = error.message;
      if (isLocked()) toast(error.message, "error");
    }
  }

  /* ---------- rate / availability ---------- */
  function remaining() {
    return Math.max(0, ASK_BUDGET - sessionQuestions);
  }
  function renderRate() {
    const left = remaining();
    rateChipText.textContent = `${left} / ${ASK_BUDGET} questions left`;
    rateDot.className =
      "chip-dot" + (left <= 0 ? " bad" : left <= 3 ? " warn" : "");
    const usageBar = $("#usageBar");
    const usageText = $("#usageText");
    if (usageBar)
      usageBar.style.width =
        Math.round((sessionQuestions / ASK_BUDGET) * 100) + "%";
    if (usageText)
      usageText.textContent = `${sessionQuestions} / ${ASK_BUDGET}`;
    const upBar = $("#uploadUsageBar");
    const upText = $("#uploadUsageText");
    if (upBar)
      upBar.style.width =
        Math.round((sessionUploads / UPLOAD_BUDGET) * 100) + "%";
    if (upText) upText.textContent = `${sessionUploads} / ${UPLOAD_BUDGET}`;
    refreshAskAvailability();
  }
  function refreshAskAvailability() {
    if (demoMode) {
      $("#composerForm").classList.remove("is-locked");
      composerInput.disabled = false;
      const out = remaining() <= 0;
      askBtn.disabled = out;
      $$("#demoStarterBtns .demo-starter-chip").forEach(
        (c) => (c.disabled = out),
      );
      composerHint.textContent = out
        ? "Question budget reached — resets within the hour."
        : "Read-only demo · answers capped at 350 tokens";
      return;
    }
    if (isLocked()) {
      composerInput.disabled = true;
      askBtn.disabled = true;
      composerHint.textContent = "Unlock your workspace to ask a question.";
      $("#composerForm").classList.add("is-locked");
      return;
    }
    $("#composerForm").classList.remove("is-locked");
    if (!docs.value) {
      composerInput.disabled = true;
      askBtn.disabled = true;
      composerHint.textContent = latestDocuments.length
        ? "Choose an indexed source first."
        : "Add a source to start asking questions.";
      return;
    }
    composerInput.disabled = false;
    askBtn.disabled = remaining() <= 0;
    composerHint.textContent =
      remaining() <= 0
        ? "Question budget reached — resets within the hour."
        : "12 questions/hr · answers capped at 350 tokens";
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

  /* ---------- ask flow: POST /api/ask ---------- */
  const CITE_RE = /\[S(\d+)\]/g;

  function buildProse(container, text, citeMap) {
    // Split the untrusted answer on [Sn] markers; render text as text nodes and
    // markers as clickable citation chips. Never innerHTML with answer text.
    if (!citeInline || !CITE_RE.test(text)) {
      CITE_RE.lastIndex = 0;
      container.textContent = text;
      return new Set();
    }
    CITE_RE.lastIndex = 0;
    const used = new Set();
    let last = 0;
    let m;
    while ((m = CITE_RE.exec(text))) {
      if (m.index > last)
        container.appendChild(
          document.createTextNode(text.slice(last, m.index)),
        );
      const key = "S" + m[1];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "cite";
      chip.dataset.cite = key;
      chip.textContent = `[${key}]`;
      if (citeMap[key]) {
        chip.setAttribute("aria-label", `Open source ${key} excerpt`);
        chip.addEventListener("click", () => openDetail(key, chip));
        used.add(key);
      }
      container.appendChild(chip);
      last = m.index + m[0].length;
    }
    if (last < text.length)
      container.appendChild(document.createTextNode(text.slice(last)));
    return used;
  }

  function appendAnswer(answer, citations, mode, latencyMs) {
    const citeMap = {};
    for (const c of citations) citeMap[c.source] = c;

    const wrap = document.createElement("div");
    wrap.className = "msg-answer";

    const card = document.createElement("div");
    card.className = "answer-card glass";
    const p = document.createElement("p");
    const used = buildProse(p, answer, citeMap);
    card.appendChild(p);
    wrap.appendChild(card);

    // pipeline badges
    const pipe = document.createElement("div");
    pipe.className = "pipeline-row";
    pipe.innerHTML =
      '<span class="badge glass" title="Sentence-aware overlap keeps context intact">◆ <b>Chunked</b></span>' +
      '<span class="badge glass" title="pgvector ranks meaning, not only keywords">◆ <b>Semantic</b></span>' +
      '<span class="badge glass" title="Every answer exposes its retrieved evidence">◆ <b>Cited</b></span>';
    wrap.appendChild(pipe);

    // evidence chips for citations not surfaced inline (or when inline is off)
    const leftover = citations.filter((c) => !used.has(c.source));
    if (leftover.length) {
      const ev = document.createElement("div");
      ev.className = "pipeline-row";
      const label = document.createElement("span");
      label.className = "answer-meta";
      label.textContent = "Evidence:";
      ev.appendChild(label);
      for (const c of citations) {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "cite";
        chip.dataset.cite = c.source;
        chip.textContent = `[${c.source}]`;
        chip.setAttribute("aria-label", `Open source ${c.source} excerpt`);
        chip.addEventListener("click", () => openDetail(c.source, chip));
        ev.appendChild(chip);
      }
      wrap.appendChild(ev);
    }

    // meta line — latency is measured; token count is a client estimate (~).
    const estTokens = Math.max(1, Math.round(answer.length / 4));
    const modeLabel =
      mode && mode.indexOf("grounded") === 0 ? "grounded" : "evidence-only";
    const metaEl = document.createElement("div");
    metaEl.className = "answer-meta";
    const spanTokens = document.createElement("span");
    spanTokens.className = "mono";
    spanTokens.textContent = `~${estTokens} / 350 tokens`;
    const spanCites = document.createElement("span");
    spanCites.className = "mono";
    spanCites.textContent = `${citations.length} citation${citations.length === 1 ? "" : "s"}`;
    const spanLat = document.createElement("span");
    spanLat.className = "mono";
    spanLat.textContent = `retrieved in ${latencyMs}ms`;
    const spanMode = document.createElement("span");
    spanMode.className = "mono";
    spanMode.textContent = modeLabel;
    metaEl.append(spanTokens, spanCites, spanLat, spanMode);
    wrap.appendChild(metaEl);

    thread.appendChild(wrap);
    thread.scrollTop = thread.scrollHeight;
    // stash the citation map for detail lookups against the current source
    thread._citeMap = citeMap;
  }

  $("#composerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!demoMode && isLocked()) {
      toast("Unlock your workspace to ask a question.");
      return;
    }
    if (!docs.value) {
      composerHint.textContent = "Choose an indexed source first.";
      if (askStatus) askStatus.textContent = "Choose an indexed source first.";
      return;
    }
    const q = composerInput.value.trim();
    if (q.length < 6) {
      composerHint.textContent =
        "Add a little more detail (at least 6 characters).";
      return;
    }
    if (remaining() <= 0) {
      toast("Question budget reached — resets within the hour.");
      return;
    }

    if (threadEmpty) threadEmpty.hidden = true;
    const userMsg = document.createElement("div");
    userMsg.className = "msg-user";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = q;
    userMsg.appendChild(bubble);
    thread.appendChild(userMsg);

    const thinking = document.createElement("div");
    thinking.className = "msg-answer";
    thinking.innerHTML =
      '<div class="answer-card glass"><p class="thinking">Retrieving supported evidence…</p></div>';
    thread.appendChild(thinking);
    thread.scrollTop = thread.scrollHeight;

    askController?.abort();
    const controller = new AbortController();
    askController = controller;
    const version = workspaceVersion;
    const selected = docs.value;
    const code = currentCode();
    detailDocName =
      (latestDocuments.find((d) => d.id === selected) || {}).name || "";
    askBtn.disabled = true;
    const started = performance.now();

    try {
      const data = await readResponse(
        await fetch(demoMode ? "/api/demo/ask" : "/api/ask", {
          method: "POST",
          headers: headers(true),
          body: JSON.stringify(
            demoMode ? { question: q } : { document_id: selected, question: q },
          ),
          signal: controller.signal,
        }),
      );
      if (
        version !== workspaceVersion ||
        controller !== askController ||
        docs.value !== selected ||
        currentCode() !== code
      ) {
        thinking.remove();
        return;
      }
      thinking.remove();
      const latency = Math.round(performance.now() - started);
      appendAnswer(
        data.answer,
        data.citations || [],
        data.generation_mode,
        latency,
      );
      sessionQuestions += 1;
      renderRate();
      composerInput.value = "";
      if (askStatus)
        askStatus.textContent =
          "Answer ready. Check its claims against the evidence.";
    } catch (error) {
      thinking.remove();
      if (error.name === "AbortError" || version !== workspaceVersion) return;
      const wrap = document.createElement("div");
      wrap.className = "msg-answer";
      const card = document.createElement("div");
      card.className = "answer-card glass";
      const p = document.createElement("p");
      p.style.color = "var(--bad)";
      p.textContent = error.message;
      card.appendChild(p);
      wrap.appendChild(card);
      thread.appendChild(wrap);
      thread.scrollTop = thread.scrollHeight;
      if (askStatus) askStatus.textContent = error.message;
      toast(error.message, "error");
    } finally {
      if (controller === askController) {
        askController = undefined;
        refreshAskAvailability();
      }
    }
  });
  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#composerForm").requestSubmit();
    }
  });

  /* ---------- citation detail panel ---------- */
  function openDetail(key, chip) {
    const map = thread._citeMap || {};
    const c = map[key];
    if (!c) return;
    // The transient "answer ready" toast otherwise covers the excerpt and its
    // action on a 320 px screen. Opening evidence is the user's next state, so
    // dismiss the stale notice before revealing the detail panel.
    clearTimeout(toastTimer);
    toastEl.classList.remove("show");
    detailFile.textContent = `${detailDocName || "Source"} · chunk #${c.chunk}`;
    detailExcerpt.textContent = c.text;
    detailProvenance.textContent = `Retrieved via pgvector · chunk #${c.chunk}`;
    askGrid.classList.add("detail-open");
    $$(".cite").forEach((x) => x.classList.remove("active"));
    if (chip) chip.classList.add("active");
  }
  $("#detailClose").addEventListener("click", () =>
    askGrid.classList.remove("detail-open"),
  );
  $("#detailOpenSource").addEventListener("click", () => {
    askGrid.classList.remove("detail-open");
    toast("This excerpt is drawn from the full indexed source.");
  });

  /* ---------- upload: POST /api/documents ---------- */
  function setUploadFeedback(msg, kind) {
    if (!uploadStatus) return;
    uploadStatus.textContent = msg;
    uploadStatus.className =
      "upload-feedback mono" +
      (kind === "error" ? " is-error" : kind === "good" ? " is-good" : "");
  }
  function addPendingRows(name) {
    const id = "pending_" + Date.now();
    const row = document.createElement("div");
    row.className = "source-row";
    row.setAttribute("role", "listitem");
    row.dataset.pending = id;
    row.innerHTML =
      '<div class="source-item"><span class="status-dot indexing"></span><span class="source-item-body"><span class="source-name"></span><span class="source-sub">indexing…</span></span></div>';
    row.querySelector(".source-name").textContent = name;
    $("#sourceList").appendChild(row);
    $("#sourceList").hidden = false;
    $("#sourcesEmptyState").hidden = true;

    const tr = document.createElement("tr");
    tr.dataset.pending = id;
    tr.innerHTML =
      '<td><div class="file-cell"><span class="file-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      iconForName(name) +
      '</svg></span><div><div class="file-name"></div></div></div></td>' +
      '<td><span class="status-pill indexing">◐ Indexing</span><div class="row-progress"><i></i></div></td>' +
      '<td class="mono">—</td><td class="mono">just now</td>' +
      '<td><div class="row-actions"><button class="btn small" type="button" disabled>Remove</button></div></td>';
    tr.querySelector(".file-name").textContent = name;
    $("#sourcesTbody").appendChild(tr);
    const tableScroll = document.querySelector(
      "#sourcesTableWrap .table-scroll",
    );
    if (tableScroll) tableScroll.hidden = false;
    $("#tableEmptyState").hidden = true;

    const bar = tr.querySelector(".row-progress i");
    let pct = 8;
    const timer = setInterval(() => {
      pct = Math.min(90, pct + 7);
      if (bar) bar.style.width = pct + "%";
    }, 300);
    return { id, timer };
  }
  function removePendingRows(pending) {
    if (pending) clearInterval(pending.timer);
    $$(`[data-pending]`).forEach((el) => el.remove());
  }

  async function submitUpload(file) {
    if (!file) return;
    if (isLocked()) {
      setUploadFeedback("Access code required to add a source.", "error");
      toast("Access code required to add a source.", "error");
      focusCodeField();
      return;
    }
    uploadController?.abort();
    const controller = new AbortController();
    uploadController = controller;
    const version = workspaceVersion;
    const submitBtn = $("#uploadSubmit");
    if (submitBtn) submitBtn.disabled = true;
    setUploadFeedback("Indexing source…");
    const pending = addPendingRows(file.name);
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
      if (version !== workspaceVersion || controller !== uploadController) {
        removePendingRows(pending);
        return;
      }
      removePendingRows(pending);
      if (data.deduplicated) {
        setUploadFeedback(
          `${data.name}: already indexed; using the existing source.`,
          "good",
        );
        toast(`${data.name} was already indexed.`);
      } else {
        sessionUploads += 1;
        setUploadFeedback(
          `${data.name}: ${data.chunks} semantic chunks indexed.`,
          "good",
        );
        toast(`${data.name} indexed — ${data.chunks} chunks.`, "good");
      }
      const flagged = new Set(
        latestDocuments.filter((d) => d.sessionAdded).map((d) => d.id),
      );
      flagged.add(data.id);
      await refresh(data.id);
      latestDocuments.forEach((d) => {
        if (flagged.has(d.id)) d.sessionAdded = true;
      });
      renderAll(latestDocuments, data.id);
      selectSource(data.id);
      renderRate();
    } catch (error) {
      removePendingRows(pending);
      if (error.name === "AbortError" || version !== workspaceVersion) return;
      setUploadFeedback(error.message, "error");
      toast(error.message, "error");
      renderAll(latestDocuments, docs.value);
    } finally {
      if (controller === uploadController) {
        uploadController = undefined;
        if (submitBtn) submitBtn.disabled = false;
      }
    }
  }

  function handleFileChosen(file, context) {
    if (!file) return;
    if (context === "onboard") {
      onboardFile = file;
      $("#onboardDropTitle").textContent = file.name;
      $("#onboardDropSub").textContent =
        "Ready — indexed once you create the workspace.";
      $("#onboardDrop").style.borderColor = "var(--accent-strong)";
      return;
    }
    submitUpload(file);
  }

  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    const ctx = pendingUploadContext;
    fileInput.value = "";
    handleFileChosen(f, ctx);
  });
  $("#upload").addEventListener("submit", (e) => {
    e.preventDefault();
    if (fileInput.files[0]) submitUpload(fileInput.files[0]);
    else {
      pendingUploadContext = "sources";
      fileInput.click();
    }
  });
  // The dropzone is a <label for="file">, so a click opens the native dialog.
  $("#dropzone").addEventListener("click", () => {
    if (isLocked()) {
      focusCodeField();
      return;
    }
    pendingUploadContext = "sources";
  });
  $("#sourcesUploadBtn").addEventListener("click", () => {
    if (isLocked()) {
      focusCodeField();
      return;
    }
    pendingUploadContext = "sources";
    fileInput.click();
  });
  $("#askAddSourceBtn").addEventListener("click", () => {
    if (isLocked()) {
      focusCodeField();
      return;
    }
    goTo("sources");
    pendingUploadContext = "sources";
    fileInput.click();
  });

  // drag & drop onto the sources dropzone → reuse the single upload path
  const dz = $("#dropzone");
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("drag-over");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("drag-over");
    }),
  );
  dz.addEventListener("drop", (e) => {
    if (isLocked()) {
      focusCodeField();
      return;
    }
    const f = e.dataTransfer?.files?.[0];
    if (f) submitUpload(f);
  });

  /* ---------- onboarding ---------- */
  const onboardDrop = $("#onboardDrop");
  onboardDrop.addEventListener("click", () => {
    pendingUploadContext = "onboard";
    fileInput.click();
  });
  onboardDrop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onboardDrop.click();
    }
  });
  $("#createWorkspaceBtn").addEventListener("click", () => {
    const code = $("#codeField").value;
    if (!unlock(code, { silent: true })) return;
    $("#codeField").value = "";
    toast("Workspace created — add a source to start asking questions.");
    goTo("ask");
    if (onboardFile) {
      const f = onboardFile;
      onboardFile = null;
      goTo("sources");
      submitUpload(f);
    }
    $("#onboardDropTitle").textContent = "Choose your first source";
    $("#onboardDropSub").textContent =
      "PDF, DOCX or TXT · this becomes source #1";
    onboardDrop.style.borderColor = "";
  });

  /* ---------- settings ---------- */
  $$("[data-settings-tab]").forEach((btn) =>
    btn.addEventListener("click", () => {
      $$("[data-settings-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const name = btn.getAttribute("data-settings-tab");
      $$(".settings-pane").forEach(
        (p) => (p.hidden = p.getAttribute("data-pane") !== name),
      );
    }),
  );
  $("#rotateCodeBtn").addEventListener("click", () => {
    lockWorkspace();
    focusCodeField();
    toast("Enter a new access code to open a different workspace.");
  });
  $("#citeSwitch").addEventListener("click", function () {
    this.classList.toggle("on");
    citeInline = this.classList.contains("on");
    this.setAttribute("aria-checked", String(citeInline));
    toast(citeInline ? "Inline citations on." : "Inline citations off.");
  });
  const overlapRange = $("#overlapRange");
  const overlapVal = $("#overlapVal");
  if (overlapRange)
    overlapRange.addEventListener(
      "input",
      () => (overlapVal.textContent = overlapRange.value + "%"),
    );
  $("#clearIndexBtn").addEventListener("click", async () => {
    if (isLocked()) {
      focusCodeField();
      return;
    }
    if (!latestDocuments.length) {
      toast("The index is already empty.");
      return;
    }
    if (
      !confirm(
        "Remove ALL sources and their stored embeddings from this workspace? This cannot be undone.",
      )
    )
      return;
    const ids = latestDocuments.map((d) => d.id);
    let removed = 0;
    for (const id of ids) {
      try {
        await readResponse(
          await fetch(`/api/documents/${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: headers(),
          }),
        );
        removed += 1;
      } catch {
        /* keep going; report at the end */
      }
    }
    askGrid.classList.remove("detail-open");
    await refresh("");
    toast(
      removed
        ? `Cleared ${removed} source${removed === 1 ? "" : "s"} from the index.`
        : "Nothing was removed.",
    );
  });

  /* ---------- remove one source: DELETE /api/documents/{id} ---------- */
  async function removeDocument(id) {
    if (!id || !confirm("Remove this source and its stored passages?")) return;
    removeController?.abort();
    const controller = new AbortController();
    removeController = controller;
    const version = workspaceVersion;
    const wasSelected = docs.value === id;
    try {
      await readResponse(
        await fetch(`/api/documents/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: headers(),
          signal: controller.signal,
        }),
      );
      if (version !== workspaceVersion || controller !== removeController)
        return;
      if (wasSelected) clearConversation();
      await refresh(wasSelected ? "" : docs.value);
      if (askStatus)
        askStatus.textContent = "Source and stored passages removed.";
      toast("Source and stored passages removed.");
    } catch (error) {
      if (error.name === "AbortError" || version !== workspaceVersion) return;
      if (askStatus) askStatus.textContent = error.message;
      toast(error.message, "error");
    } finally {
      if (controller === removeController) removeController = undefined;
    }
  }

  /* ---------- command palette ---------- */
  const cmdkOverlay = $("#cmdkOverlay");
  const cmdkInput = $("#cmdkInput");
  const cmdkList = $("#cmdkList");
  let selIndex = 0;
  let matches = [];
  function buildActions() {
    const base = [
      {
        label: "Ask a question",
        tag: "Ask",
        icon: "M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-4-1L3 20l1.1-5.3A8.5 8.5 0 1 1 21 11.5Z",
        run: () => {
          if (composerInput.disabled && isLocked()) {
            focusCodeField();
            return;
          }
          goTo("ask");
          composerInput.focus();
        },
      },
      {
        label: "Add a source",
        tag: "Index",
        icon: "M12 5v14M5 12h14",
        run: () => {
          if (isLocked()) {
            focusCodeField();
          } else {
            goTo("sources");
            pendingUploadContext = "sources";
            fileInput.click();
          }
        },
      },
      {
        label: "Start a new workspace",
        tag: "New",
        icon: "M12 5v14M5 12h14",
        run: () => goTo("new"),
      },
      {
        label: "Open settings",
        tag: "Settings",
        icon: "M12 5v14M5 12h14",
        run: () => goTo("settings"),
      },
      {
        label: isLocked() ? "Unlock workspace" : "Lock workspace",
        tag: "Access",
        icon: "M4 10h16v10H4z",
        run: () => (isLocked() ? focusCodeField() : lockWorkspace()),
      },
      {
        label: "Toggle theme",
        tag: "Appearance",
        icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
        run: () => $("#theme").click(),
      },
      {
        label: "Open Textify on GitHub",
        tag: "Link",
        icon: "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47",
        run: () =>
          window.open(
            "https://github.com/abheet19",
            "_blank",
            "noopener,noreferrer",
          ),
      },
    ];
    for (const d of latestDocuments) {
      base.push({
        label: "Jump to " + d.name,
        tag: "Source",
        icon: "M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z",
        run: () => {
          goTo("ask");
          selectSource(d.id);
        },
      });
    }
    return base;
  }
  function renderCmdk(filter) {
    const f = (filter || "").toLowerCase();
    const actions = buildActions();
    matches = actions.filter((a) => a.label.toLowerCase().indexOf(f) !== -1);
    cmdkList.replaceChildren();
    if (!matches.length) {
      const li = document.createElement("li");
      li.className = "cmdk-empty";
      li.textContent = "No matches — try “ask”, “settings”, or a source name.";
      cmdkList.appendChild(li);
      return;
    }
    if (selIndex >= matches.length) selIndex = matches.length - 1;
    matches.forEach((a, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cmdk-item" + (i === selIndex ? " sel" : "");
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
        a.icon +
        '"/></svg><span></span><span class="cmdk-tag"></span>';
      btn.querySelector("span:not(.cmdk-tag)").textContent = a.label;
      btn.querySelector(".cmdk-tag").textContent = a.tag;
      btn.addEventListener("click", () => {
        closeCmdk();
        a.run();
      });
      li.appendChild(btn);
      cmdkList.appendChild(li);
    });
  }
  function openCmdk() {
    cmdkOverlay.hidden = false;
    cmdkInput.value = "";
    selIndex = 0;
    renderCmdk("");
    cmdkInput.focus();
  }
  function closeCmdk() {
    cmdkOverlay.hidden = true;
  }
  $("#cmdkTrigger").addEventListener("click", openCmdk);
  cmdkOverlay.addEventListener("click", (e) => {
    if (e.target === cmdkOverlay) closeCmdk();
  });
  cmdkInput.addEventListener("input", () => {
    selIndex = 0;
    renderCmdk(cmdkInput.value);
  });
  cmdkInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selIndex = Math.min(selIndex + 1, matches.length - 1);
      renderCmdk(cmdkInput.value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selIndex = Math.max(selIndex - 1, 0);
      renderCmdk(cmdkInput.value);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = matches[selIndex];
      if (m) {
        closeCmdk();
        m.run();
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === "k") {
      e.preventDefault();
      cmdkOverlay.hidden ? openCmdk() : closeCmdk();
    } else if (e.key === "Escape" && !cmdkOverlay.hidden) {
      closeCmdk();
    }
  });

  /* ---------- init ---------- */
  let storedTheme = "dark";
  try {
    storedTheme =
      localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    /* ignore */
  }
  applyTheme(storedTheme);
  goTo("ask");
  applyLockUI();
  renderRate();
  loadRuntimeSummary();
  refresh();
})();
