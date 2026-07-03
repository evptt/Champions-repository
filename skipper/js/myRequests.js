// статус заявки
const STATUS_LABEL = {
  new: "Ожидает ответа",
  accepted: "Принята - контакты открыты",
  done: "Завершена",
};

// заявки текущего пользователя
function renderMyRequests() {
  const my = state.requests
    .filter(r => r.userId === state.currentUser.id)
    .slice()
    .reverse();

  return `
    <h2>Мои консультации</h2>
    ${!my.length
      ? `<div class="empty">Заявок пока нет. Найдите эксперта в каталоге и отправьте первую.</div>`
      : my.map(r => {
          const e = state.experts.find(x => x.id === r.expertId);
          return `
            <div class="req">
              <div class="req-top">
                <div>
                  <h4>${esc(r.specTitle)}</h4>
                  <div class="muted">Эксперт: ${esc(e.name)} &middot; ${esc(r.formatName)} &middot; ${fmtPrice(r.price)} &middot; ${r.createdAt}</div>
                </div>
                <span class="status ${r.status}">${STATUS_LABEL[r.status]}</span>
              </div>
              <div class="req-msg">${esc(r.message)}</div>
              ${r.status !== "new" ? `
                <div class="contact-box">
                  Эксперт принял заявку. Свяжитесь напрямую:
                  Telegram <b>${esc(e.contacts.telegram)}</b>, email <b>${esc(e.contacts.email)}</b>
                </div>` : ""}
            </div>`;
        }).join("")}
  `;
}
