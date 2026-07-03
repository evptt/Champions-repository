// перехад на экран
function go(view, param = null) {
  route = { view, param };
  render();
  window.scrollTo({ top: 0 });
}

// изменение шапки сайта
function renderHeader() {
  const u = state.currentUser;
  const isExpert = u && u.isExpert;
  const incoming = isExpert && myExpertProfile()
    ? state.requests.filter(r => r.expertId === myExpertProfile().id && r.status === "new").length
    : 0;

  $("nav").innerHTML = `
    <button class="nav-btn ${route.view === "catalog" || route.view === "expert" ? "active" : ""}"
            onclick="go('catalog')">Каталог экспертов</button>
    ${u ? `<button class="nav-btn ${route.view === "myrequests" ? "active" : ""}"
            onclick="go('myrequests')">Мои консультации</button>` : ""}
    ${isExpert ? `<button class="nav-btn ${route.view === "cabinet" ? "active" : ""}"
            onclick="go('cabinet')">Кабинет эксперта${incoming ? `<span class="dot">${incoming}</span>` : ""}</button>` : ""}
  `;

  $("userbox").innerHTML = u ? `
    <div class="user-chip">
      <div class="avatar">${initials(u.name)}</div>
      <div>
        <div>${esc(u.name)}</div>
        <button class="link-btn" onclick="logout()">Выйти</button>
      </div>
    </div>
  ` : `<button class="btn btn-primary btn-sm" onclick="go('auth')">Войти</button>`;
}

// отрисовка экрана
function render() {
  renderHeader();
  const app = $("app");
  switch (route.view) {
    case "catalog":    app.innerHTML = renderCatalog(); break;
    case "expert":     app.innerHTML = renderExpert(route.param); break;
    case "myrequests": app.innerHTML = state.currentUser ? renderMyRequests() : renderAuth(); break;
    case "cabinet":    app.innerHTML = renderCabinet(); break;
    case "auth":       app.innerHTML = renderAuth(); break;
    default:           app.innerHTML = renderCatalog();
  }
}

render();
