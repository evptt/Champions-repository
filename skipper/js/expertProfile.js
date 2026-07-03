// страница эксперта
function renderExpert(id) {
  const e = state.experts.find(x => x.id === id);
  if (!e) return `<div class="empty">Эксперт не найден.</div>`;
  const isSelf = state.currentUser && e.userId === state.currentUser.id;

  return `
    <button class="back" onclick="go('catalog')">&larr; Назад в каталог</button>
    <div class="profile">
      <div>
        <div class="panel">
          <div class="profile-head">
            <div class="avatar">${initials(e.name)}</div>
            <div>
              <h2>${esc(e.name)}</h2>
              <div class="muted">${esc(e.headline)}</div>
            </div>
          </div>
          <p>${esc(e.about)}</p>
        </div>

        <div class="panel">
          <div class="section-label">Специальности и опыт</div>
          ${e.specialties.map((s, i) => `
            <div class="spec-block">
              <div class="spec-title">${esc(s.title)}</div>
              <div class="tags" style="margin:8px 0 10px">
                ${s.topics.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
              </div>
              <p class="muted">${esc(s.experience)}</p>
              <div style="margin-top:12px">
                ${s.formats.map((f, j) => `
                  <div class="format-row">
                    <span>${esc(f.name)}</span>
                    <span style="display:flex;gap:12px;align-items:center">
                      <b>${fmtPrice(f.price)}</b>
                      ${!isSelf ? `<button class="btn btn-primary btn-sm" onclick="openRequest(${e.id},${i},${j})">Выбрать</button>` : ""}
                    </span>
                  </div>`).join("")}
              </div>
            </div>`).join("")}
        </div>
      </div>

      <div class="panel">
        <div class="section-label">Как проходит консультация</div>
        <div class="side-note">
          1. Вы выбираете формат и описываете свой вопрос.<br><br>
          2. Эксперт получает заявку и принимает ее.<br><br>
          3. Платформа передает вам контакты эксперта - вы договариваетесь о времени и связываетесь напрямую.<br><br>
          4. После консультации эксперт фиксирует оказание услуги на платформе.
        </div>
        ${!isSelf
          ? `<button class="btn btn-brass" style="width:100%;margin-top:18px" onclick="openRequest(${e.id})">Запросить консультацию</button>`
          : `<div class="side-note" style="margin-top:18px"><b>Это ваш профиль.</b> Редактировать его можно в кабинете эксперта.</div>`}
      </div>
    </div>
  `;
}


function openRequest(expertId, specIdx = 0, formatIdx = 0) {
  if (!state.currentUser) {
    toast("Сначала войдите или зарегистрируйтесь");
    go("auth");
    return;
  }
  modalState = { expertId, specIdx, formatIdx };
  renderModal();
}

function renderModal() {
  closeModal();
  if (!modalState) return;

  const e = state.experts.find(x => x.id === modalState.expertId);
  const spec = e.specialties[modalState.specIdx];

  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.id = "overlay";
  ov.onclick = (ev) => { if (ev.target === ov) closeModal(); };
  ov.innerHTML = `
    <div class="modal">
      <h3>Заявка на консультацию</h3>
      <p class="muted" style="margin-bottom:16px">Эксперт: <b>${esc(e.name)}</b></p>
      <div class="form wide">
        <div>
          <label>Специальность</label>
          <select class="input" id="m-spec"
                  onchange="modalState.specIdx=+this.value; modalState.formatIdx=0; renderModal()">
            ${e.specialties.map((s, i) => `
              <option value="${i}" ${i === modalState.specIdx ? "selected" : ""}>${esc(s.title)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Формат консультации</label>
          <select class="input" id="m-format">
            ${spec.formats.map((f, j) => `
              <option value="${j}" ${j === modalState.formatIdx ? "selected" : ""}>${esc(f.name)} - ${fmtPrice(f.price)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Опишите ваш вопрос</label>
          <textarea class="input" id="m-msg"
            placeholder="Коротко: какая задача, что уже пробовали, чего хотите от консультации"></textarea>
        </div>
        <div class="error" id="m-err"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Отмена</button>
        <button class="btn btn-primary" onclick="submitRequest()">Отправить заявку</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

function closeModal() {
  $("overlay")?.remove();
}

// создание заявки
function submitRequest() {
  const msg = $("m-msg").value.trim();
  if (msg.length < 10) {
    $("m-err").textContent = "Опишите вопрос подробнее (минимум 10 символов).";
    return;
  }
  const e = state.experts.find(x => x.id === modalState.expertId);
  const spec = e.specialties[+$("m-spec").value];
  const format = spec.formats[+$("m-format").value];

  state.requests.push({
    id: state.nextId++,
    expertId: e.id,
    userId: state.currentUser.id,
    specTitle: spec.title,
    formatName: format.name,
    price: format.price,
    message: msg,
    status: "new",
    createdAt: new Date().toLocaleString("ru-RU", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
  });

  modalState = null;
  closeModal();
  toast("Заявка отправлена эксперту");
  go("myrequests");
}
