// отрисовка входа
function renderAuth() {
  return `
    <div class="panel" style="max-width:480px;margin:30px auto">
      <div class="tabs" style="margin-bottom:20px">
        <button class="tab ${authMode === "login" ? "active" : ""}"
                onclick="authMode='login';render()">Вход</button>
        <button class="tab ${authMode === "reg" ? "active" : ""}"
                onclick="authMode='reg';render()">Регистрация</button>
      </div>
      <div class="form">
        ${authMode === "reg" ? `
          <div>
            <label>Имя и фамилия</label>
            <input class="input" id="a-name" placeholder="Как вас представлять на платформе">
          </div>` : ""}
        <div>
          <label>Email</label>
          <input class="input" id="a-email" placeholder="you@example.com">
        </div>
        <div>
          <label>Пароль</label>
          <input class="input" id="a-pass" type="password" placeholder="Минимум 3 символа">
        </div>
        ${authMode === "reg" ? `
          <label class="check">
            <input type="checkbox" id="a-expert">
            <span><b>Я эксперт</b> - хочу консультировать и получить кабинет эксперта. Возможности обычного пользователя при этом сохраняются.</span>
          </label>` : ""}
        <div class="error" id="a-err"></div>
        <button class="btn btn-primary" onclick="${authMode === "login" ? "doLogin()" : "doRegister()"}">
          ${authMode === "login" ? "Войти" : "Создать аккаунт"}
        </button>
        ${authMode === "login" ? `<div class="form-note">Демо-доступ: пользователь <b>user@skipper.ru</b>, эксперт <b>dmitry@skipper.ru</b>, пароль везде <b>123</b>.</div>` : ""}
      </div>
    </div>
  `;
}

// проверка аккаунта
function doLogin() {
  const email = $("a-email").value.trim().toLowerCase();
  const pass = $("a-pass").value;
  const u = state.users.find(x => x.email.toLowerCase() === email && x.password === pass);
  if (!u) {
    $("a-err").textContent = "Неверный email или пароль.";
    return;
  }
  state.currentUser = u;
  toast(`Здравствуйте, ${u.name.split(" ")[0]}!`);
  go("catalog");
}

// регистрация
function doRegister() {
  const name = $("a-name").value.trim();
  const email = $("a-email").value.trim().toLowerCase();
  const pass = $("a-pass").value;
  const isExpert = $("a-expert").checked;

  if (name.length < 2) { $("a-err").textContent = "Укажите имя."; return; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { $("a-err").textContent = "Укажите корректный email."; return; }
  if (pass.length < 3) { $("a-err").textContent = "Пароль слишком короткий."; return; }
  if (state.users.some(u => u.email.toLowerCase() === email)) {
    $("a-err").textContent = "Такой email уже зарегистрирован.";
    return;
  }

  const u = { id: state.nextId++, name, email, password: pass, isExpert };
  state.users.push(u);
  state.currentUser = u;

  if (isExpert) {
    toast("Аккаунт создан. Заполните профиль эксперта");
    go("cabinet");
  } else {
    toast("Аккаунт создан");
    go("catalog");
  }
}

// выход
function logout() {
  state.currentUser = null;
  go("catalog");
}
