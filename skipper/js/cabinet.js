// отрисовка кабиинета
function renderCabinet() {
  const u = state.currentUser;
  if (!u || !u.isExpert) return `<div class="empty">Кабинет доступен только экспертам.</div>`;

  let profile = myExpertProfile();

  if (!profile) {
    profile = {
      id: state.nextId++,
      userId: u.id,
      name: u.name,
      headline: "",
      about: "",
      contacts: { telegram: "", email: u.email },
      specialties: [],
    };
    state.experts.push(profile);
  }

  const incoming = state.requests.filter(r => r.expertId === profile.id).slice().reverse();

  return `
    <h2>Кабинет эксперта</h2>
    <div class="tabs">
      <button class="tab ${cabinetTab === "profile" ? "active" : ""}"
              onclick="cabinetTab='profile';render()">Мой профиль</button>
      <button class="tab ${cabinetTab === "requests" ? "active" : ""}"
              onclick="cabinetTab='requests';render()">Заявки (${incoming.length})</button>
    </div>
    ${cabinetTab === "profile"
      ? cabinetProfileHtml(profile)
      : cabinetRequestsHtml(profile, incoming)}
  `;
}

// редактирование профиля
function cabinetProfileHtml(p) {
  return `
    <div class="panel">
      <div class="section-label">Информация об эксперте</div>
      <div class="form wide" style="max-width:640px">
        <div>
          <label>Краткое позиционирование (одна строка в каталоге)</label>
          <input class="input" id="p-headline" value="${esc(p.headline)}"
                 placeholder="Например: Тимлид разработки, Python/Go">
        </div>
        <div>
          <label>О себе и своем опыте</label>
          <textarea class="input" id="p-about"
            placeholder="Чем занимаетесь, сколько лет опыта, чем можете помочь">${esc(p.about)}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label>Telegram для связи</label>
            <input class="input" id="p-tg" value="${esc(p.contacts.telegram)}" placeholder="@username">
          </div>
          <div>
            <label>Email для связи</label>
            <input class="input" id="p-email" value="${esc(p.contacts.email)}">
          </div>
        </div>
        <div class="form-note">Контакты не видны в каталоге - платформа передает их пользователю только после того, как вы примете его заявку.</div>
        <div><button class="btn btn-primary" onclick="saveExpertBase()">Сохранить</button></div>
      </div>
    </div>

    <div class="panel" style="margin-top:18px">
      <div class="section-label">Специальности, темы и форматы услуг</div>
      ${!p.specialties.length ? `<p class="muted" style="margin-bottom:14px">Добавьте хотя бы одну специальность - без нее ваш профиль не отображается в каталоге.</p>` : ""}
      ${p.specialties.map((s, i) => `
        <div class="spec-edit">
          <div class="spec-edit-head">
            <b>Специальность ${i + 1}</b>
            <button class="link-btn" style="color:var(--danger)" onclick="removeSpec(${i})">Удалить</button>
          </div>
          <div class="form wide">
            <div>
              <label>Название специальности</label>
              <input class="input" id="s-title-${i}" value="${esc(s.title)}"
                     placeholder="Например: Разбор проблем на IT-проекте">
            </div>
            <div>
              <label>Темы (отметьте подходящие)</label>
              <div class="filters" style="margin:0">
                ${TOPICS.map(t => `
                  <button class="chip ${s.topics.includes(t) ? "active" : ""}"
                          onclick="toggleSpecTopic(${i},'${esc(t)}')">${esc(t)}</button>`).join("")}
              </div>
            </div>
            <div>
              <label>Описание опыта по этой специальности</label>
              <textarea class="input" id="s-exp-${i}">${esc(s.experience || "")}</textarea>
            </div>
            <div>
              <label>Форматы консультаций</label>
              ${s.formats.map((f, j) => `
                <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
                  <input class="input" style="flex:2" id="f-name-${i}-${j}" value="${esc(f.name)}"
                         placeholder="Например: Видеозвонок 60 минут">
                  <input class="input" style="flex:1" id="f-price-${i}-${j}" type="number" min="0"
                         value="${f.price ?? ""}" placeholder="Цена, ₽">
                  <button class="link-btn" style="color:var(--danger)" onclick="removeFormat(${i},${j})">&times;</button>
                </div>`).join("")}
              <button class="btn btn-ghost btn-sm" onclick="addFormat(${i})">+ Добавить формат</button>
            </div>
          </div>
        </div>`).join("")}
      <div style="display:flex;gap:10px;margin-top:6px">
        <button class="btn btn-ghost" onclick="addSpec()">+ Добавить специальность</button>
        ${p.specialties.length ? `<button class="btn btn-primary" onclick="saveSpecs()">Сохранить специальности</button>` : ""}
      </div>
    </div>
  `;
}

// сохранение профиля
function saveExpertBase() {
  const p = myExpertProfile();
  p.headline = $("p-headline").value.trim();
  p.about = $("p-about").value.trim();
  p.contacts.telegram = $("p-tg").value.trim();
  p.contacts.email = $("p-email").value.trim();
  toast("Профиль сохранен");
  render();
}

// операиии со специальностями
function addSpec() {
  saveSpecFieldsSilently();
  myExpertProfile().specialties.push({
    title: "", topics: [], experience: "",
    formats: [{ name: "", price: null }],
  });
  render();
}

function removeSpec(i) {
  saveSpecFieldsSilently();
  myExpertProfile().specialties.splice(i, 1);
  render();
}

function addFormat(i) {
  saveSpecFieldsSilently();
  myExpertProfile().specialties[i].formats.push({ name: "", price: null });
  render();
}

function removeFormat(i, j) {
  saveSpecFieldsSilently();
  myExpertProfile().specialties[i].formats.splice(j, 1);
  render();
}

function toggleSpecTopic(i, t) {
  saveSpecFieldsSilently();
  const topics = myExpertProfile().specialties[i].topics;
  const idx = topics.indexOf(t);
  idx >= 0 ? topics.splice(idx, 1) : topics.push(t);
  render();
}

function saveSpecFieldsSilently() {
  const p = myExpertProfile();
  if (!p) return;
  p.specialties.forEach((s, i) => {
    const title = $(`s-title-${i}`); if (title) s.title = title.value;
    const exp = $(`s-exp-${i}`); if (exp) s.experience = exp.value;
    s.formats.forEach((f, j) => {
      const n = $(`f-name-${i}-${j}`); if (n) f.name = n.value;
      const pr = $(`f-price-${i}-${j}`); if (pr) f.price = pr.value ? +pr.value : null;
    });
  });
}

// сохранения специалоьности
function saveSpecs() {
  saveSpecFieldsSilently();
  const p = myExpertProfile();
  p.specialties.forEach(s => { s.formats = s.formats.filter(f => f.name.trim()); });
  const bad = p.specialties.find(s => !s.title.trim() || !s.topics.length || !s.formats.length);
  if (bad) {
    toast("У каждой специальности нужны название, темы и хотя бы один формат");
    render();
    return;
  }
  toast("Специальности сохранены - профиль виден в каталоге");
  render();
}

function cabinetRequestsHtml(profile, incoming) {
  if (!incoming.length) {
    return `<div class="empty">Заявок пока нет.</div>`;
  }
  return incoming.map(r => {
    const user = state.users.find(u => u.id === r.userId);
    return `
      <div class="req">
        <div class="req-top">
          <div>
            <h4>${esc(r.specTitle)}</h4>
            <div class="muted">От: ${esc(user.name)} &middot; ${esc(r.formatName)} &middot; ${fmtPrice(r.price)} &middot; ${r.createdAt}</div>
          </div>
          <span class="status ${r.status}">${STATUS_LABEL[r.status]}</span>
        </div>
        <div class="req-msg">${esc(r.message)}</div>
        ${r.status === "accepted" ? `<div class="contact-box">Вы приняли заявку. Пользователь получил ваши контакты - договоритесь о времени напрямую.</div>` : ""}
        <div class="req-actions">
          ${r.status === "new" ? `<button class="btn btn-primary btn-sm" onclick="acceptRequest(${r.id})">Принять и открыть контакты</button>` : ""}
          ${r.status === "accepted" ? `<button class="btn btn-brass btn-sm" onclick="completeRequest(${r.id})">Зафиксировать оказание услуги</button>` : ""}
        </div>
      </div>`;
  }).join("");
}

// принятие заявки
function acceptRequest(id) {
  const r = state.requests.find(x => x.id === id);
  r.status = "accepted";
  toast("Заявка принята - контакты переданы пользователю");
  render();
}

// завершение заявки
function completeRequest(id) {
  const r = state.requests.find(x => x.id === id);
  r.status = "done";
  toast("Оказание услуги зафиксировано");
  render();
}
