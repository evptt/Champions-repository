const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => (
  { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]
));

// созданиие аватарки
const initials = (name) => name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

// форматирование цены
const fmtPrice = (p) => p ? p.toLocaleString("ru-RU") + " ₽" : "бесплатно";

// уведомление
function toast(msg) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// профиль эксперта
function myExpertProfile() {
  return state.currentUser
    ? state.experts.find(e => e.userId === state.currentUser.id)
    : null;
}

// все темы без повторов
function expertTopics(e) {
  return [...new Set(e.specialties.flatMap(s => s.topics))];
}

// минимальная цена эксперта
function minPrice(e) {
  const prices = e.specialties.flatMap(s => s.formats.map(f => f.price)).filter(Boolean);
  return prices.length ? Math.min(...prices) : null;
}
