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

// ---------- control panel (next step) ----------

function openInstrument(id) {
  state.selectedId = id;
  renderInstrumentList();
}

// ---------- boot ----------

(async () => {
  const { data } = await db.auth.getSession();
  if (data.session) renderDashboard(data.session.user);
  else renderAuth("login");
})();
