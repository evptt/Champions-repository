// фильтр экспертов по строке
function filterExperts() {
  const q = filter.q.trim().toLowerCase();
  let list = state.experts.filter(e => e.specialties.length > 0);

  if (filter.topic) {
    list = list.filter(e => expertTopics(e).includes(filter.topic));
  }
  if (q) {
    list = list.filter(e =>
      (e.name + " " + e.headline + " " + e.about + " " +
       e.specialties.map(s => s.title + " " + s.topics.join(" ") + " " + s.experience).join(" ")
      ).toLowerCase().includes(q)
    );
  }
  return list;
}

// каталог
function renderCatalog() {
  return `
    <section class="hero">
      <svg class="route" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <path d="M 30 260 C 120 240, 100 120, 210 110 S 360 60, 385 30"
              stroke="#c08a3e" stroke-width="2.5" stroke-dasharray="2 10"
              stroke-linecap="round" fill="none"/>
        <circle cx="30" cy="260" r="6" fill="none" stroke="#c4d4d3" stroke-width="2"/>
        <circle cx="210" cy="110" r="4" fill="#c08a3e"/>
        <path d="M 385 30 l -14 4 5 -9 -5 -9 z" fill="#c08a3e" transform="rotate(210 385 30)"/>
        <circle cx="385" cy="30" r="10" fill="none" stroke="#c08a3e" stroke-width="2"/>
      </svg>
      <h1>Проложите курс <em>к нужному эксперту</em></h1>
      <p>Skipper соединяет тех, кому нужен совет, с теми, кто уже проходил этот путь: карьера, бизнес, проекты и не только.</p>
      <div class="hero-search">
        <input id="q" placeholder="Тема, имя эксперта или задача..." value="${esc(filter.q)}"
               oninput="filter.q=this.value; refreshCatalogGrid()">
        <button class="btn btn-brass" onclick="refreshCatalogGrid()">Найти</button>
      </div>
    </section>

    <div class="section-label">Темы консультаций</div>
    <div class="filters">
      <button class="chip ${!filter.topic ? "active" : ""}" onclick="setTopic(null)">Все темы</button>
      ${TOPICS.map(t => `
        <button class="chip ${filter.topic === t ? "active" : ""}"
                onclick="setTopic('${esc(t)}')">${esc(t)}</button>`).join("")}
    </div>

    <div id="catalog-grid">${catalogGridHtml(filterExperts())}</div>
  `;
}

// карточки экспертов
function catalogGridHtml(list) {
  if (!list.length) {
    return `<div class="empty">По этому запросу экспертов пока нет.<br>Попробуйте другую тему или сбросьте фильтры.</div>`;
  }
  return `<div class="grid">` + list.map(e => {
    const topics = expertTopics(e);
    const shown = topics.slice(0, 3);
    const p = minPrice(e);
    return `
      <article class="card" onclick="go('expert', ${e.id})">
        <div class="card-head">
          <div class="avatar">${initials(e.name)}</div>
          <div>
            <div class="card-name">${esc(e.name)}</div>
            <div class="card-headline">${esc(e.headline)}</div>
          </div>
        </div>
        <div class="tags">
          ${shown.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
          ${topics.length > 3 ? `<span class="tag more">+${topics.length - 3}</span>` : ""}
        </div>
        <div class="card-exp">${esc(e.about)}</div>
        <div class="card-foot">
          <span class="formats-hint">${e.specialties.flatMap(s => s.formats).length} формат(а/ов)</span>
          <span class="price">${p ? "от " + fmtPrice(p) : ""}</span>
        </div>
      </article>`;
  }).join("") + `</div>`;
}

function setTopic(t) {
  filter.topic = t;
  render();
}

function refreshCatalogGrid() {
  $("catalog-grid").innerHTML = catalogGridHtml(filterExperts());
}
