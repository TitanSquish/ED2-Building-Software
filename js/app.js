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

// ---------- dashboard (filled in later) ----------

async function renderDashboard(user) {
  app.innerHTML = `
    <div class="panel">
      <h2>Signed in as ${esc(user.email)}</h2>
      <div class="actions"><button id="logout">Log out</button></div>
    </div>`;
  document.getElementById("logout").onclick = async () => {
    await db.auth.signOut();
    renderAuth("login");
  };
}

// ---------- boot ----------

(async () => {
  const { data } = await db.auth.getSession();
  if (data.session) renderDashboard(data.session.user);
  else renderAuth("login");
})();
