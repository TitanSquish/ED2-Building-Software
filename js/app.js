// LabLink front end. Plain JavaScript, no build step.
// Talks directly to Supabase (Auth + Postgres via PostgREST).

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = document.getElementById("app");

// ---------- helpers ----------

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function showMsg(el, text, kind = "error") {
  el.textContent = text;
  el.className = `msg ${kind}`;
  el.classList.remove("hidden");
}

// ---------- auth screens ----------

function renderAuth(mode = "login") {
  app.innerHTML = `
    <div class="panel auth-box">
      <div class="tabs">
        <button id="tab-login" class="${mode === "login" ? "active" : ""}">Log in</button>
        <button id="tab-register" class="${mode === "register" ? "active" : ""}">Register</button>
      </div>
      <div id="auth-msg" class="msg hidden"></div>
      <form id="auth-form">
        <label>Email <input type="email" name="email" required autocomplete="email"></label>
        <label>Password <input type="password" name="password" required minlength="6" autocomplete="${mode === "login" ? "current-password" : "new-password"}"></label>
        <button class="primary" type="submit">${mode === "login" ? "Log in" : "Create account"}</button>
      </form>
    </div>`;

  document.getElementById("tab-login").onclick = () => renderAuth("login");
  document.getElementById("tab-register").onclick = () => renderAuth("register");

  document.getElementById("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById("auth-msg");
    const form = new FormData(e.target);
    const email = form.get("email");
    const password = form.get("password");
    const btn = e.target.querySelector("button");
    btn.disabled = true;

    const { data, error } =
      mode === "login"
        ? await db.auth.signInWithPassword({ email, password })
        : await db.auth.signUp({ email, password });

    btn.disabled = false;
    if (error) return showMsg(msg, error.message);

    // If email confirmation is on, signUp returns a user but no session.
    if (mode === "register" && !data.session) {
      showMsg(msg, "Account created. Check your email to confirm, then log in.", "ok");
      return;
    }
    renderDashboard(data.session.user);
  };
}

// ---------- dashboard ----------

const state = { user: null, instruments: [], selectedId: null };

async function renderDashboard(user) {
  state.user = user;
  app.innerHTML = `
    <div class="panel">
      <div class="actions" style="justify-content: space-between; align-items: center;">
        <span class="user">Signed in as ${esc(user.email)}</span>
        <button id="logout" class="small">Log out</button>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div class="panel">
          <h2 id="inst-form-title">Add instrument</h2>
          <div id="inst-msg" class="msg hidden"></div>
          <form id="inst-form">
            <input type="hidden" name="id">
            <label>Name <input name="name" required placeholder="ECP Inverted Pendulum"></label>
            <div class="row">
              <label>Model <input name="model" placeholder="Model 505"></label>
              <label>Location <input name="location" placeholder="EE Lab 214"></label>
            </div>
            <label>Status
              <select name="status">
                <option value="offline">Offline</option>
                <option value="online">Online</option>
                <option value="busy">Busy</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </label>
            <label>Notes <textarea name="notes" placeholder="Encoder: 4000 counts/rev, DAC output ±10 V"></textarea></label>
            <div class="actions">
              <button class="primary" type="submit" id="inst-save">Save</button>
              <button type="button" id="inst-cancel" class="hidden">Cancel</button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <div class="panel">
          <h2>Instruments</h2>
          <div id="inst-list"></div>
        </div>
      </div>
    </div>

    <div id="control-area"></div>`;

  document.getElementById("logout").onclick = async () => {
    await db.auth.signOut();
    state.user = null;
    renderAuth("login");
  };

  document.getElementById("inst-form").onsubmit = saveInstrument;
  document.getElementById("inst-cancel").onclick = resetInstrumentForm;

  await loadInstruments();
}

// ---------- instruments: CRUD ----------

async function loadInstruments() {
  const { data, error } = await db
    .from("instruments")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return showMsg(document.getElementById("inst-msg"), error.message);
  state.instruments = data;
  renderInstrumentList();
}

function renderInstrumentList() {
  const el = document.getElementById("inst-list");
  if (!state.instruments.length) {
    el.innerHTML = `<p class="empty">No instruments yet. Add one on the left.</p>`;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Model</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${state.instruments.map((i) => `
          <tr class="${i.id === state.selectedId ? "selected" : ""}">
            <td><strong>${esc(i.name)}</strong><br><span class="user">${esc(i.location || "")}</span></td>
            <td>${esc(i.model || "")}</td>
            <td><span class="badge ${esc(i.status)}">${esc(i.status)}</span></td>
            <td>
              <div class="actions">
                <button class="small primary" data-open="${i.id}">Open</button>
                <button class="small" data-edit="${i.id}">Edit</button>
                <button class="small danger" data-del="${i.id}">Delete</button>
              </div>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openInstrument(b.dataset.open)));
  el.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editInstrument(b.dataset.edit)));
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => deleteInstrument(b.dataset.del)));
}

async function saveInstrument(e) {
  e.preventDefault();
  const msg = document.getElementById("inst-msg");
  const form = new FormData(e.target);
  const id = form.get("id");
  const record = {
    name: form.get("name").trim(),
    model: form.get("model").trim() || null,
    location: form.get("location").trim() || null,
    status: form.get("status"),
    notes: form.get("notes").trim() || null,
  };

  let error;
  if (id) {
    ({ error } = await db.from("instruments").update(record).eq("id", id));
  } else {
    record.user_id = state.user.id;
    ({ error } = await db.from("instruments").insert(record));
  }
  if (error) return showMsg(msg, error.message);

  showMsg(msg, id ? "Instrument updated." : "Instrument added.", "ok");
  resetInstrumentForm();
  await loadInstruments();
  if (id && id === state.selectedId) openInstrument(id);
}

function editInstrument(id) {
  const i = state.instruments.find((x) => x.id === id);
  if (!i) return;
  const f = document.getElementById("inst-form");
  f.id.value = i.id;
  f.name.value = i.name;
  f.model.value = i.model || "";
  f.location.value = i.location || "";
  f.status.value = i.status;
  f.notes.value = i.notes || "";
  document.getElementById("inst-form-title").textContent = "Edit instrument";
  document.getElementById("inst-cancel").classList.remove("hidden");
  f.name.focus();
}

function resetInstrumentForm() {
  const f = document.getElementById("inst-form");
  f.reset();
  f.id.value = "";
  document.getElementById("inst-form-title").textContent = "Add instrument";
  document.getElementById("inst-cancel").classList.add("hidden");
}

async function deleteInstrument(id) {
  const i = state.instruments.find((x) => x.id === id);
  if (!confirm(`Delete "${i.name}"? Its experiments and command log will be removed too.`)) return;
  const { error } = await db.from("instruments").delete().eq("id", id);
  if (error) return showMsg(document.getElementById("inst-msg"), error.message);
  if (state.selectedId === id) {
    state.selectedId = null;
    document.getElementById("control-area").innerHTML = "";
  }
  await loadInstruments();
}

// ---------- control panel ----------

async function openInstrument(id) {
  state.selectedId = id;
  renderInstrumentList();
  const i = state.instruments.find((x) => x.id === id);
  if (!i) return;

  const area = document.getElementById("control-area");
  area.innerHTML = `
    <div class="panel">
      <h2>Control panel: ${esc(i.name)}</h2>
      <p class="user">${esc(i.model || "")}${i.location ? " · " + esc(i.location) : ""} · <span class="badge ${esc(i.status)}">${esc(i.status)}</span></p>
      ${i.notes ? `<p style="font-size:14px">${esc(i.notes)}</p>` : ""}
      <div id="ctl-msg" class="msg hidden"></div>

      <div class="grid-2">
        <div>
          <h3>Commands</h3>
          <div class="controls">
            <div class="slider-row">
              <label for="setpoint">Setpoint</label>
              <input type="range" id="setpoint" min="-90" max="90" step="1" value="0">
              <output id="setpoint-out">0°</output>
            </div>
            <div class="slider-row">
              <label for="voltage">Motor V</label>
              <input type="range" id="voltage" min="-10" max="10" step="0.1" value="0">
              <output id="voltage-out">0.0 V</output>
            </div>
            <div class="actions">
              <button class="primary" data-cmd="START">Start</button>
              <button data-cmd="STOP">Stop</button>
              <button data-cmd="SET_SETPOINT">Send setpoint</button>
              <button data-cmd="SET_VOLTAGE">Send voltage</button>
              <button class="danger" data-cmd="ESTOP">Emergency stop</button>
            </div>
          </div>

          <h3>Record experiment</h3>
          <form id="exp-form">
            <label>Title <input name="title" required placeholder="Step response, 15° setpoint"></label>
            <div class="row">
              <label>Setpoint <input name="setpoint" type="number" step="any"></label>
              <label>Duration (s) <input name="duration_sec" type="number" min="0"></label>
            </div>
            <label>Result / observations <textarea name="result"></textarea></label>
            <div class="actions"><button class="primary" type="submit">Save experiment</button></div>
          </form>
        </div>

        <div>
          <h3>Command log</h3>
          <div id="cmd-log" class="log"></div>
          <div class="actions" style="margin-top:8px"><button class="small danger" id="clear-log">Clear log</button></div>

          <h3>Experiments</h3>
          <div id="exp-list"></div>
        </div>
      </div>
    </div>`;

  const sp = document.getElementById("setpoint");
  const vo = document.getElementById("voltage");
  sp.oninput = () => (document.getElementById("setpoint-out").textContent = `${sp.value}°`);
  vo.oninput = () => (document.getElementById("voltage-out").textContent = `${Number(vo.value).toFixed(1)} V`);

  area.querySelectorAll("[data-cmd]").forEach((b) => {
    b.onclick = () => {
      const cmd = b.dataset.cmd;
      let value = null;
      if (cmd === "SET_SETPOINT") value = `${sp.value} deg`;
      if (cmd === "SET_VOLTAGE") value = `${Number(vo.value).toFixed(1)} V`;
      sendCommand(id, cmd, value);
    };
  });

  document.getElementById("clear-log").onclick = () => clearLog(id);
  document.getElementById("exp-form").onsubmit = (e) => saveExperiment(e, id);

  area.scrollIntoView({ behavior: "smooth", block: "start" });
  await Promise.all([loadLog(id), loadExperiments(id)]);
}

async function sendCommand(instrumentId, command, value) {
  const msg = document.getElementById("ctl-msg");
  const { error } = await db.from("command_log").insert({
    user_id: state.user.id,
    instrument_id: instrumentId,
    command,
    value,
  });
  if (error) return showMsg(msg, error.message);

  // Reflect the command in the instrument's status so the list stays honest.
  const newStatus = command === "START" ? "busy" : command === "STOP" || command === "ESTOP" ? "online" : null;
  if (newStatus) {
    await db.from("instruments").update({ status: newStatus }).eq("id", instrumentId);
    await loadInstruments();
  }
  await loadLog(instrumentId);
}

async function loadLog(instrumentId) {
  const el = document.getElementById("cmd-log");
  const { data, error } = await db
    .from("command_log")
    .select("*")
    .eq("instrument_id", instrumentId)
    .order("sent_at", { ascending: false })
    .limit(50);
  if (error) return showMsg(document.getElementById("ctl-msg"), error.message);
  if (!data.length) {
    el.innerHTML = `<p class="empty">No commands sent yet.</p>`;
    return;
  }
  el.innerHTML = data
    .map((r) => `<div><span class="t">${new Date(r.sent_at).toLocaleTimeString()}</span>${esc(r.command)}${r.value ? " " + esc(r.value) : ""}</div>`)
    .join("");
}

async function clearLog(instrumentId) {
  if (!confirm("Clear the command log for this instrument?")) return;
  const { error } = await db.from("command_log").delete().eq("instrument_id", instrumentId);
  if (error) return showMsg(document.getElementById("ctl-msg"), error.message);
  await loadLog(instrumentId);
}

// ---------- experiments ----------

async function saveExperiment(e, instrumentId) {
  e.preventDefault();
  const form = new FormData(e.target);
  const record = {
    user_id: state.user.id,
    instrument_id: instrumentId,
    title: form.get("title").trim(),
    setpoint: form.get("setpoint") === "" ? null : Number(form.get("setpoint")),
    duration_sec: form.get("duration_sec") === "" ? null : Number(form.get("duration_sec")),
    result: form.get("result").trim() || null,
  };
  const { error } = await db.from("experiments").insert(record);
  if (error) return showMsg(document.getElementById("ctl-msg"), error.message);
  e.target.reset();
  showMsg(document.getElementById("ctl-msg"), "Experiment saved.", "ok");
  await loadExperiments(instrumentId);
}

async function loadExperiments(instrumentId) {
  const el = document.getElementById("exp-list");
  const { data, error } = await db
    .from("experiments")
    .select("*")
    .eq("instrument_id", instrumentId)
    .order("created_at", { ascending: false });
  if (error) return showMsg(document.getElementById("ctl-msg"), error.message);
  if (!data.length) {
    el.innerHTML = `<p class="empty">No experiments recorded.</p>`;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Title</th><th>Setpoint</th><th>Duration</th><th></th></tr></thead>
      <tbody>
        ${data.map((x) => `
          <tr>
            <td><strong>${esc(x.title)}</strong>${x.result ? `<br><span class="user">${esc(x.result)}</span>` : ""}<br><span class="user">${new Date(x.created_at).toLocaleString()}</span></td>
            <td>${x.setpoint ?? ""}</td>
            <td>${x.duration_sec != null ? x.duration_sec + " s" : ""}</td>
            <td><button class="small danger" data-delexp="${x.id}">Delete</button></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
  el.querySelectorAll("[data-delexp]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm("Delete this experiment record?")) return;
      const { error } = await db.from("experiments").delete().eq("id", b.dataset.delexp);
      if (error) return showMsg(document.getElementById("ctl-msg"), error.message);
      await loadExperiments(instrumentId);
    };
  });
}

// ---------- boot ----------

(async () => {
  const { data } = await db.auth.getSession();
  if (data.session) renderDashboard(data.session.user);
  else renderAuth("login");
})();
