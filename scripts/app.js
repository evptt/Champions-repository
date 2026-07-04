import app from "./firebase-init.js";
import { signInWithEmailPassword, signUpWithEmailPassword, signOutCurrentUser, subscribeToAuthState } from "./auth.js";
import { subscribeToCollection } from "./firestore-service.js";
import { COLLECTIONS, COUNTRY_SUGGESTIONS_RU, CURRENCIES, CITY_SUGGESTIONS_RU, DEFAULT_CATEGORIES, EXPENSE_SPLIT_TYPES, TRIP_ROLES } from "./config.js";
import { addParticipant, removeParticipant } from "./participants.js";
import { addExpense, removeExpense, updateExpense } from "./expenses.js";
import { calculateBalances } from "./balances.js";
import { buildInviteMessage, getJoinCodeFromUrl, resolveTripFromInviteUrl } from "./invites.js";
import { createTrip, deleteTripCascade, filterTrips, findTripByJoinCode, updateTrip } from "./trips.js";
import { logActivity } from "./history.js";
import { addFriend, subscribeToUserProfile, upsertUserProfile } from "./users.js";

const DISPLAY_NAME_KEY = "travel-mvp-display-name";
const CURRENT_USER_FALLBACK = "Пользователь";

const state = {
	currentUser: null,
	userProfile: null,
	displayName: loadDisplayName(),
	authMode: "signin",
	allTrips: [],
	allUsers: [],
	allParticipants: [],
	allExpenses: [],
	allActivities: [],
	allNotifications: [],
	selectedTripId: null,
	activeTab: "overview",
	editingExpenseId: null,
	splitMode: EXPENSE_SPLIT_TYPES.even,
	selectedParticipantIds: [],
	newTripCountries: [],
	newTripCities: [],
	filterCountries: [],
	filterCities: [],
	filterWasApplied: false,
	filterMode: "all",
	inviteJoinCode: getJoinCodeFromUrl(),
	inviteHandledTripId: null,
};

const DOM = {};
const unsubscribers = [];
let unsubscribeProfile = null;

function loadDisplayName() {
	const storedName = window.localStorage.getItem(DISPLAY_NAME_KEY);
	if (storedName) {
		return storedName;
	}

	return "";
}

function saveDisplayName(name) {
	const resolved = name.trim() || CURRENT_USER_FALLBACK;
	state.displayName = resolved;
	window.localStorage.setItem(DISPLAY_NAME_KEY, resolved);
	refreshUserBadge();
}

function cacheDom() {
	const ids = [
		"current-user-name",
		"role-pill",
		"btn-auth-open",
		"btn-theme-toggle",
		"btn-sign-out",
		"view-home",
		"view-trip",
		"trip-grid",
		"filter-form",
		"f-name",
		"f-date-from",
		"f-date-to",
		"f-country-input",
		"f-city-input",
		"f-country-wrap",
		"f-city-wrap",
		"f-country-suggestions",
		"f-city-suggestions",
		"btn-new-trip",
		"btn-back-home",
		"btn-invite",
		"btn-delete-trip",
		"btn-add-expense",
		"btn-add-expense-2",
		"btn-add-person",
		"trip-route",
		"trip-name",
		"trip-dates",
		"stat-budget",
		"stat-spent",
		"stat-people",
		"ov-currency",
		"ov-budget",
		"ov-places",
		"ov-owner",
		"suggested-people-wrap",
		"suggested-people",
		"people-list",
		"expense-list",
		"balance-list",
		"history-list",
		"modal-trip",
		"modal-person",
		"modal-invite",
		"modal-expense",
		"modal-auth",
		"auth-mode-signin",
		"auth-mode-signup",
		"auth-fullname-wrap",
		"auth-login-wrap",
		"auth-fullname",
		"auth-login",
		"auth-email",
		"auth-password",
		"auth-submit",
		"nt-name",
		"nt-date-start",
		"nt-date-end",
		"nt-currency",
		"nt-budget",
		"nt-countries-wrap",
		"nt-countries-input",
		"nt-countries-suggestions",
		"nt-cities-wrap",
		"nt-cities-input",
		"nt-cities-suggestions",
		"nt-submit",
		"np-login",
		"np-submit",
		"invite-link",
		"invite-copy",
		"expense-modal-title",
		"ex-title",
		"ex-payer",
		"ex-category",
		"ex-category-custom",
		"ex-amount",
		"ex-type",
		"ex-currency",
		"ex-participants",
		"split-equal",
		"split-manual",
		"manual-split-wrap",
		"ex-receipt",
		"ex-submit",
		"toast",
	];

	for (const id of ids) {
		DOM[id] = document.getElementById(id);
	}
}

function getCurrentUserId() {
	return state.currentUser?.uid ?? null;
}

function getCurrentUserName() {
	return state.userProfile?.fullName || state.userProfile?.login || state.currentUser?.email || state.displayName || CURRENT_USER_FALLBACK;
}

function setAuthModalVisible(visible) {
	if (visible) {
		DOM["modal-auth"]?.classList.add("active");
	} else {
		DOM["modal-auth"]?.classList.remove("active");
	}
}

function applyTheme(theme = localStorage.getItem("travel-mvp-theme") || "light") {
	const resolvedTheme = theme === "dark" ? "dark" : "light";
	document.documentElement.dataset.theme = resolvedTheme;
	if (DOM["btn-theme-toggle"]) {
		DOM["btn-theme-toggle"].textContent = resolvedTheme === "dark" ? "☀️" : "🌙";
		DOM["btn-theme-toggle"].setAttribute("aria-label", resolvedTheme === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
	}
	window.localStorage.setItem("travel-mvp-theme", resolvedTheme);
}

function toggleTheme() {
	const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
	applyTheme(nextTheme);
}

function refreshAuthUi() {
	const isAuthenticated = Boolean(state.currentUser);
	if (DOM["btn-auth-open"]) {
		DOM["btn-auth-open"].style.display = isAuthenticated ? "none" : "inline-flex";
	}
	if (DOM["btn-sign-out"]) {
		DOM["btn-sign-out"].style.display = isAuthenticated ? "inline-flex" : "none";
	}
	setAuthModalVisible(!isAuthenticated);
}

function formatMoney(amount, currency) {
	const value = Number(amount) || 0;
	const sign = value < 0 ? "−" : "";
	return `${sign}${Math.abs(value).toFixed(2)} ${currency}`;
}

function formatDate(value) {
	if (!value) {
		return "";
	}

	const date = value instanceof Date ? value : new Date(value);
	return date.toLocaleDateString("ru-RU", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function formatDateTime(value) {
	if (!value) {
		return "";
	}

	const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
	return date.toLocaleString("ru-RU", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function initials(name) {
	return String(name || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0])
		.slice(0, 2)
		.join("")
		.toUpperCase() || "?";
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

function showToast(message) {
	if (!DOM.toast) {
		return;
	}

	DOM.toast.textContent = message;
	DOM.toast.classList.add("show");
	clearTimeout(showToast._timer);
	showToast._timer = window.setTimeout(() => DOM.toast.classList.remove("show"), 2500);
}

function normalizeSuggestion(query, sourceList) {
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		return null;
	}

	const normalizedQuery = trimmedQuery.toLowerCase();
	const exactMatch = sourceList.find((item) => item.toLowerCase() === normalizedQuery);
	if (exactMatch) {
		return exactMatch;
	}

	const startsWithMatches = sourceList.filter((item) => item.toLowerCase().startsWith(normalizedQuery));
	if (startsWithMatches.length === 1) {
		return startsWithMatches[0];
	}

	if (startsWithMatches.length > 1) {
		return startsWithMatches[0];
	}

	const includesMatches = sourceList.filter((item) => item.toLowerCase().includes(normalizedQuery));
	if (includesMatches.length === 1) {
		return includesMatches[0];
	}

	return null;
}

function getTagInputMeta(inputId) {
	if (inputId === "nt-countries-input") {
		return {
			suggestionsId: "nt-countries-suggestions",
			values: state.newTripCountries,
			sourceList: COUNTRY_SUGGESTIONS_RU,
		};
	}

	if (inputId === "nt-cities-input") {
		return {
			suggestionsId: "nt-cities-suggestions",
			values: state.newTripCities,
			sourceList: CITY_SUGGESTIONS_RU,
		};
	}

	if (inputId === "f-country-input") {
		return {
			suggestionsId: "f-country-suggestions",
			values: state.filterCountries,
			sourceList: COUNTRY_SUGGESTIONS_RU,
		};
	}

	if (inputId === "f-city-input") {
		return {
			suggestionsId: "f-city-suggestions",
			values: state.filterCities,
			sourceList: CITY_SUGGESTIONS_RU,
		};
	}

	return null;
}

function renderTagSuggestions(inputId) {
	const meta = getTagInputMeta(inputId);
	const input = DOM[inputId];
	const suggestionsWrap = DOM[meta?.suggestionsId];

	if (!meta || !input || !suggestionsWrap) {
		return;
	}

	const query = input.value.trim().toLowerCase();
	const filtered = query
		? meta.sourceList.filter((item) => item.toLowerCase().includes(query) && !meta.values.includes(item))
		: [];

	if (filtered.length === 0) {
		suggestionsWrap.innerHTML = "";
		suggestionsWrap.classList.remove("active");
		return;
	}

	suggestionsWrap.innerHTML = filtered
		.slice(0, 8)
		.map((item) => `<button type="button" class="tag-suggestion-item" data-suggestion="${escapeHtml(item)}">${escapeHtml(item)}</button>`)
		.join("");
	suggestionsWrap.classList.add("active");

	suggestionsWrap.querySelectorAll("[data-suggestion]").forEach((button) => {
		button.addEventListener("click", () => {
			const canonicalValue = button.dataset.suggestion;
			if (!canonicalValue || meta.values.includes(canonicalValue)) {
				return;
			}

			meta.values.push(canonicalValue);
			input.value = "";
			renderTagInput(inputId);
		});
	});
}

function commitPendingTag(inputId) {
	const meta = getTagInputMeta(inputId);
	const input = DOM[inputId];

	if (!meta || !input) {
		return false;
	}

	const normalized = normalizeSuggestion(input.value, meta.sourceList);
	if (!normalized || meta.values.includes(normalized)) {
		input.value = normalized ? "" : input.value;
		renderTagSuggestions(inputId);
		return Boolean(normalized);
	}

	meta.values.push(normalized);
	input.value = "";
	renderTagInput(inputId);
	return true;
}

function clearTagSuggestions(inputId) {
	const meta = getTagInputMeta(inputId);
	const suggestionsWrap = DOM[meta?.suggestionsId];
	if (suggestionsWrap) {
		suggestionsWrap.innerHTML = "";
		suggestionsWrap.classList.remove("active");
	}
}

function openModal(id) {
	DOM[id]?.classList.add("active");
}

function closeModal(id) {
	DOM[id]?.classList.remove("active");
}

function switchView(viewId) {
	document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
	DOM[viewId]?.classList.add("active");
}

function currentTrip() {
	return state.allTrips.find((trip) => trip.id === state.selectedTripId) ?? null;
}

function tripParticipants(tripId) {
	const trip = currentTrip();
	const tripRecord = state.allTrips.find((item) => item.id === tripId);
	const sourceTrip = tripRecord ?? trip;
	const tripParticipantDocs = state.allParticipants.filter((participant) => participant.tripId === tripId);
	const map = new Map();

	if (sourceTrip?.ownerId) {
		map.set(sourceTrip.ownerId, {
			id: sourceTrip.ownerId,
			tripId,
			userId: sourceTrip.ownerId,
			name: sourceTrip.ownerName || state.displayName,
			role: TRIP_ROLES.owner,
		});
	}

	tripParticipantDocs.forEach((participant) => {
		map.set(participant.userId, {
			...participant,
			userId: participant.userId,
			id: participant.userId,
		});
	});

	return Array.from(map.values());
}

function tripExpenses(tripId) {
	return state.allExpenses.filter((expense) => expense.tripId === tripId);
}

function tripActivities(tripId) {
	return state.allActivities
		.filter((activity) => activity.tripId === tripId)
		.sort((left, right) => {
			const leftDate = left.createdAt?.toDate ? left.createdAt.toDate() : new Date(left.createdAt ?? 0);
			const rightDate = right.createdAt?.toDate ? right.createdAt.toDate() : new Date(right.createdAt ?? 0);
			return rightDate.getTime() - leftDate.getTime();
		});
}

function participantNameByUserId(tripId, userId) {
	const trip = currentTrip() ?? state.allTrips.find((item) => item.id === tripId);
	const participant = tripParticipants(tripId).find((entry) => entry.userId === userId || entry.id === userId);

	if (participant?.name) {
		return participant.name;
	}

	const userProfile = state.allUsers.find((user) => user.uid === userId || user.id === userId);
	if (userProfile?.fullName || userProfile?.login) {
		return userProfile.fullName || userProfile.login;
	}

	if (trip?.ownerId === userId) {
		return state.displayName;
	}

	return "—";
}

function isOwner(trip) {
	return trip?.ownerId && trip.ownerId === getCurrentUserId();
}

function currentUserRoleInTrip(trip) {
	if (!trip) {
		return TRIP_ROLES.member;
	}

	if (trip.ownerId === getCurrentUserId()) {
		return TRIP_ROLES.owner;
	}

	const participant = tripParticipants(trip.id).find((entry) => entry.userId === getCurrentUserId());
	return participant?.role ?? TRIP_ROLES.member;
}

function refreshUserBadge() {
	if (DOM["current-user-name"]) {
		DOM["current-user-name"].textContent = state.currentUser ? `Вы: ${getCurrentUserName()}` : "Вы: не авторизованы";
	}

	const trip = currentTrip();
	const role = currentUserRoleInTrip(trip);
	if (DOM["role-pill"]) {
		DOM["role-pill"].textContent = role === TRIP_ROLES.owner ? "владелец" : "участник";
		DOM["role-pill"].dataset.role = role;
	}
}

function renderTagInput(inputId) {
	const meta = getTagInputMeta(inputId);
	if (!meta) {
		return;
	}

	const wrapId = inputId === "nt-countries-input"
		? "nt-countries-wrap"
		: inputId === "nt-cities-input"
			? "nt-cities-wrap"
			: inputId === "f-country-input"
				? "f-country-wrap"
				: inputId === "f-city-input"
					? "f-city-wrap"
					: null;
	const wrap = DOM[wrapId];
	const input = DOM[inputId];

	if (!wrap || !input) {
		return;
	}

	wrap.querySelectorAll(".tag").forEach((tag) => tag.remove());

	meta.values.forEach((value, index) => {
		const tag = document.createElement("span");
		tag.className = "tag";
		tag.innerHTML = `${escapeHtml(value)} <button type="button" data-idx="${index}">×</button>`;
		tag.querySelector("button")?.addEventListener("click", () => {
			meta.values.splice(index, 1);
			renderTagInput(inputId);
		});
		wrap.insertBefore(tag, input);
	});

	renderTagSuggestions(inputId);
}

function wireTagInput(inputId, wrapId, values) {
	DOM[inputId]?.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === ",") {
			event.preventDefault();
			if (!commitPendingTag(inputId)) {
				showToast("Выберите значение из списка подсказок");
			}
			return;
		}

		if (event.key === "ArrowDown" && DOM[getTagInputMeta(inputId)?.suggestionsId]?.querySelector("[data-suggestion]")) {
			event.preventDefault();
			DOM[getTagInputMeta(inputId)?.suggestionsId]?.querySelector("[data-suggestion]")?.focus();
		}
	});

	DOM[inputId]?.addEventListener("focus", () => renderTagSuggestions(inputId));
	DOM[inputId]?.addEventListener("input", () => renderTagSuggestions(inputId));
	DOM[inputId]?.addEventListener("blur", () => {
		window.setTimeout(() => {
			commitPendingTag(inputId);
			clearTagSuggestions(inputId);
		}, 120);
	});
}

function getTripFilterValues() {
	const typedCountry = DOM["f-country-input"]?.value?.trim() ?? "";
	const typedCity = DOM["f-city-input"]?.value?.trim() ?? "";

	return {
		title: DOM["f-name"]?.value ?? "",
		dateFrom: DOM["f-date-from"]?.value ?? "",
		dateTo: DOM["f-date-to"]?.value ?? "",
		countries: state.filterCountries.length > 0 ? state.filterCountries : typedCountry ? [typedCountry] : [],
		cities: state.filterCities.length > 0 ? state.filterCities : typedCity ? [typedCity] : [],
	};
}

function renderHome() {
	const grid = DOM["trip-grid"];
	if (!grid) {
		return;
	}

	const filters = getTripFilterValues();
	const currentUserId = getCurrentUserId();
	const userTrips = state.allTrips.filter((trip) => trip.ownerId === currentUserId || (trip.participantIds ?? []).includes(currentUserId));
	const shouldUseSearchScope = state.filterMode === "search";
	const hasActiveFilters = Boolean(
		filters.title ||
		filters.dateFrom ||
	filters.dateTo ||
		(filters.countries ?? []).length ||
		(filters.cities ?? []).length
	);
	const searchScopeTrips = shouldUseSearchScope && hasActiveFilters ? state.allTrips : userTrips;
	const filteredTrips = filterTrips(searchScopeTrips, shouldUseSearchScope ? filters : {});

	grid.innerHTML = "";

	if (filteredTrips.length === 0) {
		if (state.filterWasApplied) {
			showToast("Поездок не найдено");
		}

		grid.innerHTML = `
			<div class="empty-state">
				<h3>Поездок не найдено</h3>
				<p>Измените параметры поиска или создайте новую поездку.</p>
			</div>
		`;
		return;
	}

	filteredTrips.forEach((trip) => {
		const participants = tripParticipants(trip.id);
		const expenses = tripExpenses(trip.id);
		const balances = calculateBalances(participants, expenses);
		const myBalance = balances.balances.find((balance) => balance.userId === currentUserId)?.balance ?? 0;
		const cls = myBalance > 0.005 ? "positive" : myBalance < -0.005 ? "negative" : "neutral";
		const label = myBalance > 0.005 ? "вам должны" : myBalance < -0.005 ? "вы должны" : "баланс закрыт";
		const route = `${(trip.countries ?? []).join(" · ")} — ${(trip.cities ?? []).join(", ")}`;
		const participantCount = Number(trip.participantCount) || participants.length;

		const card = document.createElement("article");
		card.className = "ticket";
		card.innerHTML = `
			<div class="ticket-head">
				<div class="ticket-route">${escapeHtml(route)}</div>
				<h3>${escapeHtml(trip.title)}</h3>
				<div class="ticket-meta"><span>${escapeHtml(formatDate(trip.dates?.start))} – ${escapeHtml(formatDate(trip.dates?.end))}</span><span>${escapeHtml(trip.currency)}</span></div>
			</div>
			<div class="perforation"></div>
			<div class="ticket-stub">
				<div class="stub-balance">
					<div class="label">${escapeHtml(label)}</div>
					<div class="amount mono ${cls}">${escapeHtml(formatMoney(Math.abs(myBalance), trip.currency))}</div>
				</div>
				<div class="stub-people">
					${participantCount} участников<br>
					<span style="color:var(--jade-dark); font-weight:600;">Открыть →</span>
				</div>
			</div>
		`;

		card.addEventListener("click", () => openTrip(trip.id));
		grid.appendChild(card);
	});
}

function renderSuggestedPeople(trip) {
	const wrap = DOM["suggested-people-wrap"];
	const list = DOM["suggested-people"];

	if (!wrap || !list || !trip) {
		return;
	}

	const currentParticipants = tripParticipants(trip.id);
	const currentIds = new Set(currentParticipants.map((participant) => participant.userId));
	const currentUserId = getCurrentUserId();
	const suggestionsMap = new Map();

	state.allParticipants
		.filter((participant) => participant.tripId !== trip.id)
		.forEach((participant) => {
			if (!participant.userId || participant.userId === currentUserId || currentIds.has(participant.userId)) {
				return;
			}

			if (!suggestionsMap.has(participant.userId) && participant.name) {
				suggestionsMap.set(participant.userId, participant);
			}
		});

	const suggestions = Array.from(suggestionsMap.values());

	if (suggestions.length === 0) {
		wrap.style.display = "none";
		return;
	}

	wrap.style.display = "block";
	list.innerHTML = suggestions
		.map((participant) => `
			<span class="suggested-chip">
				${escapeHtml(participant.name)} <button type="button" data-add-suggested="${escapeHtml(participant.userId)}">+ добавить</button>
			</span>
		`)
		.join("");

	list.querySelectorAll("[data-add-suggested]").forEach((button) => {
		button.addEventListener("click", async () => {
			const participant = suggestions.find((entry) => entry.userId === button.dataset.addSuggested);
			if (!participant || !trip || !isOwner(trip)) {
				showToast("Только владелец может добавлять профили");
				return;
			}

			const result = await addParticipant({
				tripId: trip.id,
				userId: participant.userId,
				name: participant.name,
				role: TRIP_ROLES.member,
			});

			if (!result.success) {
				showToast(result.error || "Не удалось добавить участника");
				return;
			}

			showToast(`${participant.name} добавлен(а) в поездку`);
		});
	});
}

async function ensureMembership(trip, role = TRIP_ROLES.member) {
	if (!trip || !state.currentUser) {
		return;
	}

	if (trip.ownerId === getCurrentUserId()) {
		return;
	}

	const currentUserId = getCurrentUserId();
	const existing = tripParticipants(trip.id).find((participant) => participant.userId === currentUserId);
	if (existing) {
		return;
	}

	await addParticipant({
		tripId: trip.id,
		userId: currentUserId,
		name: state.displayName,
		role,
	});
}

async function handleAutoInviteJoin() {
	if (!state.inviteJoinCode || state.inviteHandledTripId || !state.currentUser || state.allTrips.length === 0) {
		return;
	}

	const matchedTrip = state.allTrips.find((trip) => trip.joinCode === state.inviteJoinCode) ?? findTripByJoinCode(state.allTrips, state.inviteJoinCode);
	if (!matchedTrip) {
		return;
	}

	state.inviteHandledTripId = matchedTrip.id;
	await ensureMembership(matchedTrip, matchedTrip.ownerId === getCurrentUserId() ? TRIP_ROLES.owner : TRIP_ROLES.member);
	openTrip(matchedTrip.id);
	showToast("Вы присоединились к поездке по ссылке");
}

function renderTrip() {
	const trip = currentTrip();
	if (!trip) {
		refreshUserBadge();
		return;
	}

	const participants = tripParticipants(trip.id);
	const expenses = tripExpenses(trip.id);
	const activities = tripActivities(trip.id);
	const balances = calculateBalances(participants, expenses);
	const spent = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
	const ownerName = participantNameByUserId(trip.id, trip.ownerId);
	const role = currentUserRoleInTrip(trip);

	DOM["trip-route"].textContent = `${(trip.countries ?? []).join(" · ")} — ${(trip.cities ?? []).join(", ")}`;
	DOM["trip-name"].textContent = trip.title || "—";
	DOM["trip-dates"].textContent = `${formatDate(trip.dates?.start)} – ${formatDate(trip.dates?.end)} · ${trip.currency}`;

	DOM["stat-budget"].textContent = formatMoney(trip.totalBudget ?? 0, trip.currency);
	DOM["stat-spent"].textContent = formatMoney(spent, trip.currency);
	DOM["stat-people"].textContent = String(Number(trip.participantCount) || participants.length);

	DOM["ov-currency"].textContent = trip.currency;
	DOM["ov-budget"].textContent = formatMoney(trip.totalBudget ?? 0, trip.currency);
	DOM["ov-places"].textContent = `${(trip.countries ?? []).join(", ")} · ${(trip.cities ?? []).join(", ")}`;
	DOM["ov-owner"].textContent = ownerName;

	DOM["btn-invite"].disabled = !isOwner(trip);
	DOM["btn-delete-trip"].disabled = !isOwner(trip);
	DOM["btn-add-person"].disabled = !isOwner(trip);
	DOM["btn-invite"].title = isOwner(trip) ? "Пригласить участника" : "Только владелец может приглашать";
	DOM["btn-delete-trip"].title = isOwner(trip) ? "Удалить поездку полностью" : "Только владелец может удалить поездку";
	DOM["btn-add-person"].title = isOwner(trip) ? "Добавить участника" : "Только владелец может добавлять участников";

	if (DOM["role-pill"]) {
		DOM["role-pill"].dataset.role = role;
		DOM["role-pill"].textContent = role === TRIP_ROLES.owner ? "владелец" : "участник";
	}

	renderSuggestedPeople(trip);
	renderPeople(trip, participants);
	renderExpenses(trip, participants, expenses);
	renderTotals(trip, participants, expenses, balances);
	renderHistory(activities);
}

function renderPeople(trip, participants) {
	const list = DOM["people-list"];
	if (!list) {
		return;
	}

	list.innerHTML = participants
		.map((participant) => {
			const canRemove = isOwner(trip) && participant.userId !== trip.ownerId;
			const canLeave = !isOwner(trip) && participant.userId === getCurrentUserId();
			return `
			<div class="person-card">
				<div class="avatar">${escapeHtml(initials(participant.name))}</div>
				<div class="person-info">
					<div class="name">${escapeHtml(participant.name)}${participant.userId === getCurrentUserId() ? " (вы)" : ""}</div>
					<div class="sub">${participant.role === TRIP_ROLES.owner ? "владелец поездки" : "участник"}</div>
				</div>
				<div class="person-actions">
					${canRemove ? `<button class="icon-btn" data-remove-participant="${escapeHtml(participant.userId)}" title="Удалить участника">🗑</button>` : ""}
					${canLeave ? `<button class="icon-btn" data-leave-trip="${escapeHtml(participant.userId)}" title="Покинуть поездку">↩</button>` : ""}
				</div>
			</div>
			`;
		})
		.join("");

	list.querySelectorAll("[data-remove-participant]").forEach((button) => {
		button.addEventListener("click", async () => {
			const participant = participants.find((item) => item.userId === button.dataset.removeParticipant);
			if (!participant) {
				return;
			}

			if (participant.userId === trip.ownerId) {
				showToast("Владельца нельзя удалить");
				return;
			}

			const participantDoc = state.allParticipants.find((item) => item.tripId === trip.id && item.userId === participant.userId);
			if (!participantDoc) {
				showToast("Участник не найден");
				return;
			}

			const result = await removeParticipant(participantDoc.id, trip.id, participant.userId);
			if (!result.success) {
				showToast(result.error || "Не удалось удалить участника");
				return;
			}

			showToast("Участник удалён");
		});
	});

	list.querySelectorAll("[data-leave-trip]").forEach((button) => {
		button.addEventListener("click", async () => {
			const participant = participants.find((item) => item.userId === button.dataset.leaveTrip);
			if (!participant) {
				return;
			}

			const participantDoc = state.allParticipants.find((item) => item.tripId === trip.id && item.userId === participant.userId);
			if (!participantDoc) {
				showToast("Участник не найден");
				return;
			}

			const result = await removeParticipant(participantDoc.id, trip.id, participant.userId);
			if (!result.success) {
				showToast(result.error || "Не удалось выйти из поездки");
				return;
			}

			state.selectedTripId = null;
			switchView("view-home");
			renderHome();
			showToast("Вы покинули поездку");
		});
	});
}

function renderExpenses(trip, participants, expenses) {
	const wrap = DOM["expense-list"];
	if (!wrap) {
		return;
	}

	const sortedExpenses = [...expenses].sort((left, right) => {
		const leftDate = left.createdAt?.toDate ? left.createdAt.toDate() : new Date(left.createdAt ?? 0);
		const rightDate = right.createdAt?.toDate ? right.createdAt.toDate() : new Date(right.createdAt ?? 0);
		return rightDate.getTime() - leftDate.getTime();
	});

	if (sortedExpenses.length === 0) {
		wrap.innerHTML = `<div class="empty-state"><h3>Трат пока нет</h3><p>Добавьте первую трату кнопкой выше.</p></div>`;
		return;
	}

	wrap.innerHTML = sortedExpenses
		.map((expense) => {
			const payerName = participantNameByUserId(trip.id, expense.paidByUserId);
			const sharedCount = expense.splitByUserIds?.length ?? Object.keys(expense.splitAmounts ?? {}).length ?? 0;
			const receiptCount = expense.receiptUrls?.length ?? 0;
			const typeLabel = expense.expenseType === "personal" ? "личная" : expense.expenseType === "on_behalf" ? "за другого" : "общая";
			const splitLabel = expense.expenseType === "shared" ? ` · ${expense.splitType === EXPENSE_SPLIT_TYPES.even ? "поровну" : "вручную"}` : "";
			const participantsLabel = expense.expenseType === "personal" ? "за 1 чел." : `за ${sharedCount} чел.`;

			return `
				<div class="expense-row" data-expense-id="${escapeHtml(expense.id)}">
					<div class="expense-main">
						<span class="expense-cat">${escapeHtml(expense.category)}</span>
						<div class="expense-desc">
							<div class="title">${escapeHtml(expense.title)}</div>
							<div class="sub">Платил: ${escapeHtml(payerName)} · ${escapeHtml(typeLabel)} · ${escapeHtml(participantsLabel)}${splitLabel}${receiptCount ? ` · 📎 ${receiptCount}` : ""}</div>
						</div>
					</div>
					<div class="expense-amount">
						<div class="value">${escapeHtml(formatMoney(expense.amount, expense.currency))}</div>
						<div class="sub">${escapeHtml(formatDateTime(expense.createdAt))}</div>
					</div>
					<div class="expense-controls">
						<button class="icon-btn" title="Редактировать" data-edit-expense="${escapeHtml(expense.id)}">✎</button>
						<button class="icon-btn" title="Удалить" data-delete-expense="${escapeHtml(expense.id)}">🗑</button>
					</div>
				</div>
			`;
		})
		.join("");

	wrap.querySelectorAll("[data-edit-expense]").forEach((button) => {
		button.addEventListener("click", () => openExpenseModal(button.dataset.editExpense));
	});

	wrap.querySelectorAll("[data-delete-expense]").forEach((button) => {
		button.addEventListener("click", async () => {
			const expense = expenses.find((entry) => entry.id === button.dataset.deleteExpense);
			if (!expense || !window.confirm(`Удалить трату «${expense.title}»?`)) {
				return;
			}

			const result = await removeExpense(expense.id, {
				tripId: trip.id,
				title: expense.title,
				actorUserId: getCurrentUserId(),
			});

			if (!result.success) {
				showToast(result.error || "Не удалось удалить трату");
				return;
			}

			showToast("Трата удалена");
		});
	});
}

function renderTotals(trip, participants, expenses, balances) {
	const wrap = DOM["balance-list"];
	if (!wrap) {
		return;
	}

	if (balances.transactions.length === 0) {
		wrap.innerHTML = `<div class="settled-note">Все расчёты закрыты — никто никому не должен 🎉</div>`;
		return;
	}

	wrap.innerHTML = balances.transactions
		.map((transaction) => `
			<div class="balance-row">
				<span class="who">${escapeHtml(participantNameByUserId(trip.id, transaction.fromUserId))}</span>
				<span class="arrow">→ переводит →</span>
				<span class="who">${escapeHtml(participantNameByUserId(trip.id, transaction.toUserId))}</span>
				<span class="sum">${escapeHtml(formatMoney(transaction.amount, trip.currency))}</span>
			</div>
		`)
		.join("");
}

function renderHistory(activities) {
	const wrap = DOM["history-list"];
	if (!wrap) {
		return;
	}

	if (activities.length === 0) {
		wrap.innerHTML = `<div class="empty-state"><h3>Пока пусто</h3><p>Здесь появится история изменений трат.</p></div>`;
		return;
	}

	wrap.innerHTML = activities
		.map((activity) => `
			<div class="history-item">
				<div class="ts">${escapeHtml(formatDateTime(activity.createdAt))}</div>
				<div class="txt">${escapeHtml(activity.message)}</div>
			</div>
		`)
		.join("");
}

function prepareTripModal() {
	state.newTripCountries = [];
	state.newTripCities = [];
	DOM["nt-name"].value = "";
	DOM["nt-date-start"].value = "";
	DOM["nt-date-end"].value = "";
	DOM["nt-budget"].value = "";
	DOM["nt-currency"].innerHTML = CURRENCIES.map((currency) => `<option value="${currency}">${currency}</option>`).join("");
	DOM["nt-currency"].value = "EUR";
	DOM["nt-countries-input"].value = "";
	DOM["nt-cities-input"].value = "";
	renderTagInput("nt-countries-input");
	renderTagInput("nt-cities-input");
}

function prepareParticipantModal() {
	DOM["np-login"].value = "";
}

function prepareInviteModal() {
	const trip = currentTrip();
	if (!trip) {
		return;
	}

	const invite = buildInviteMessage(trip.title, trip.joinCode, window.location.href);
	DOM["invite-link"].value = invite.url;
}

function getExpenseFieldWrapper(controlId) {
	return DOM[controlId]?.closest(".field-wide") ?? null;
}

function setExpenseFieldLabel(controlId, text) {
	const label = getExpenseFieldWrapper(controlId)?.querySelector("label");
	if (label) {
		label.textContent = text;
	}
}

function syncExpenseForm(trip, existingSplits = null) {
	if (!trip) {
		return;
	}

	const participants = tripParticipants(trip.id);
	const expenseType = DOM["ex-type"]?.value ?? "shared";
	const payerId = DOM["ex-payer"]?.value || participants[0]?.userId || "";
	const isPersonal = expenseType === "personal";
	const isOnBehalf = expenseType === "on_behalf";
	const visibleParticipants = isPersonal
		? participants.filter((participant) => participant.userId === payerId)
		: isOnBehalf
			? participants.filter((participant) => participant.userId !== payerId)
			: participants;

	DOM["ex-payer"].innerHTML = participants
		.map((participant) => `<option value="${escapeHtml(participant.userId)}">${escapeHtml(participant.name)}</option>`)
		.join("");
	DOM["ex-payer"].value = payerId;

	const participantsField = getExpenseFieldWrapper("ex-participants");
	const splitField = DOM["split-equal"]?.closest(".field-wide") ?? null;
	const participantLabel = isOnBehalf ? "За кого" : "Участники траты";

	setExpenseFieldLabel("ex-participants", participantLabel);
	setExpenseFieldLabel("split-equal", "Как делим");

	if (participantsField) {
		participantsField.style.display = isPersonal ? "none" : "block";
	}

	if (splitField) {
		splitField.style.display = isSharedExpense(expenseType) ? "block" : "none";
	}

	if (isPersonal) {
		state.selectedParticipantIds = payerId ? [payerId] : participants.slice(0, 1).map((participant) => participant.userId);
		state.splitMode = EXPENSE_SPLIT_TYPES.even;
	} else if (isOnBehalf) {
		state.selectedParticipantIds = participants.map((participant) => participant.userId).filter((participantId) => participantId !== payerId);
		state.splitMode = EXPENSE_SPLIT_TYPES.even;
	} else if (state.selectedParticipantIds.length === 0) {
		state.selectedParticipantIds = participants.map((participant) => participant.userId);
	}

	renderParticipantPicker(trip, visibleParticipants);

	if (isSharedExpense(expenseType)) {
		setSplitMode(state.splitMode, existingSplits, trip, visibleParticipants);
	} else {
		DOM["split-equal"].classList.remove("active");
		DOM["split-manual"].classList.remove("active");
		DOM["manual-split-wrap"].style.display = "none";
	}
}

function isSharedExpense(expenseType) {
	return expenseType === "shared";
}

function prepareExpenseModal(expenseId = null) {
	const trip = currentTrip();
	if (!trip) {
		return;
	}

	const participants = tripParticipants(trip.id);
	const expense = expenseId ? tripExpenses(trip.id).find((entry) => entry.id === expenseId) : null;
	state.editingExpenseId = expenseId;
	const expenseType = expense?.expenseType ?? "shared";
	state.splitMode = expense?.splitType ?? EXPENSE_SPLIT_TYPES.even;
	state.selectedParticipantIds = expense?.splitByUserIds?.length ? [...expense.splitByUserIds] : participants.map((participant) => participant.userId);

	DOM["expense-modal-title"].textContent = expense ? "Редактировать трату" : "Новая трата";
	DOM["ex-title"].value = expense?.title ?? "";
	DOM["ex-amount"].value = expense?.amount ?? "";
	DOM["ex-payer"].value = expense?.paidByUserId ?? participants[0]?.userId ?? "";
	DOM["ex-type"].value = expenseType;
	DOM["ex-currency"].innerHTML = CURRENCIES.map((currency) => `<option value="${currency}">${currency}</option>`).join("");
	DOM["ex-currency"].value = expense?.currency ?? trip.currency;
	DOM["ex-category"].innerHTML = [
		...DEFAULT_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`),
		`<option value="__custom">Своя категория…</option>`,
	].join("");

	if (expense && !DEFAULT_CATEGORIES.includes(expense.category)) {
		DOM["ex-category"].value = "__custom";
		DOM["ex-category-custom"].style.display = "block";
		DOM["ex-category-custom"].value = expense.category;
	} else {
		DOM["ex-category"].value = expense?.category ?? DEFAULT_CATEGORIES[0];
		DOM["ex-category-custom"].style.display = "none";
		DOM["ex-category-custom"].value = "";
	}

	syncExpenseForm(trip, expense?.splitAmounts ?? null);
	DOM["ex-receipt"].value = "";
}

function renderParticipantPicker(trip, participants) {
	const wrap = DOM["ex-participants"];
	if (!wrap) {
		return;
	}

	wrap.innerHTML = participants
		.map((participant) => `
			<button type="button" class="pp-chip ${state.selectedParticipantIds.includes(participant.userId) ? "selected" : ""}" data-pid="${escapeHtml(participant.userId)}">${escapeHtml(participant.name)}</button>
		`)
		.join("");

	wrap.querySelectorAll(".pp-chip").forEach((chip) => {
		chip.addEventListener("click", () => {
			const participantId = chip.dataset.pid;
			if (!participantId) {
				return;
			}

			if (state.selectedParticipantIds.includes(participantId)) {
				state.selectedParticipantIds = state.selectedParticipantIds.filter((id) => id !== participantId);
			} else {
				state.selectedParticipantIds.push(participantId);
			}

			chip.classList.toggle("selected");
			if (state.splitMode === EXPENSE_SPLIT_TYPES.manual) {
				renderManualSplit(trip, participants, null);
			}
		});
	});
}

function setSplitMode(mode, existingSplits, trip, participants) {
	state.splitMode = mode;
	DOM["split-equal"].classList.toggle("active", mode === EXPENSE_SPLIT_TYPES.even);
	DOM["split-manual"].classList.toggle("active", mode === EXPENSE_SPLIT_TYPES.manual);
	DOM["manual-split-wrap"].style.display = mode === EXPENSE_SPLIT_TYPES.manual ? "flex" : "none";

	if (mode === EXPENSE_SPLIT_TYPES.manual) {
		renderManualSplit(trip, participants, existingSplits);
	}
}

function renderManualSplit(trip, participants, existingSplits) {
	const wrap = DOM["manual-split-wrap"];
	if (!wrap) {
		return;
	}

	wrap.innerHTML = state.selectedParticipantIds
		.map((participantId) => {
			const participant = participants.find((entry) => entry.userId === participantId || entry.id === participantId);
			const value = existingSplits?.[participantId] ?? "";
			return `
				<div class="manual-split-row">
					<span class="name">${escapeHtml(participant?.name ?? participantId)}</span>
					<input type="number" min="0" step="0.01" data-manual-pid="${escapeHtml(participantId)}" value="${escapeHtml(value)}">
				</div>
			`;
		})
		.join("");
}

function buildSplitAmounts(amount, participantIds) {
	const values = {};
	const share = Math.round((amount / participantIds.length) * 100) / 100;
	let assigned = 0;

	participantIds.forEach((participantId, index) => {
		if (index === participantIds.length - 1) {
			values[participantId] = Math.round((amount - assigned) * 100) / 100;
			return;
		}

		values[participantId] = share;
		assigned += share;
	});

	return values;
}

function collectManualSplitAmounts(participantIds) {
	const values = {};
	let total = 0;

	participantIds.forEach((participantId) => {
		const input = DOM["manual-split-wrap"].querySelector(`[data-manual-pid="${CSS.escape(participantId)}"]`);
		const value = Number(input?.value) || 0;
		values[participantId] = value;
		total += value;
	});

	return { values, total };
}

function getSelectedTripIdFromUrl() {
	return state.inviteJoinCode ? resolveTripFromInviteUrl(state.allTrips).trip?.id ?? null : null;
}

async function openTrip(tripId) {
	state.selectedTripId = tripId;
	state.activeTab = "overview";
	switchView("view-trip");
	document.querySelectorAll(".tab-btn").forEach((button) => button.classList.toggle("active", button.dataset.tab === state.activeTab));
	document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === state.activeTab));

	const trip = currentTrip();
	if (trip) {
		await ensureMembership(trip, trip.ownerId === getCurrentUserId() ? TRIP_ROLES.owner : TRIP_ROLES.member);
	}

	refreshUserBadge();
	renderTrip();
}

async function handleCreateTrip() {
	const committedCountry = commitPendingTag("nt-countries-input");
	const committedCity = commitPendingTag("nt-cities-input");
	if ((!committedCountry && DOM["nt-countries-input"]?.value.trim()) || (!committedCity && DOM["nt-cities-input"]?.value.trim())) {
		showToast("Выберите страну и город из списка подсказок");
		return;
	}

	const title = DOM["nt-name"].value.trim();
	const start = DOM["nt-date-start"].value;
	const end = DOM["nt-date-end"].value;
	const currency = DOM["nt-currency"].value;
	const totalBudget = Number(DOM["nt-budget"].value) || 0;

	if (!title) {
		showToast("Введите название поездки");
		return;
	}

	if (!start || !end) {
		showToast("Укажите даты поездки");
		return;
	}

	if (state.newTripCountries.length === 0) {
		showToast("Добавьте хотя бы одну страну");
		return;
	}

	if (state.newTripCities.length === 0) {
		showToast("Добавьте хотя бы один город");
		return;
	}

	const result = await createTrip({
		title,
		dates: { start, end },
		countries: [...state.newTripCountries],
		cities: [...state.newTripCities],
		totalBudget,
		currency,
		ownerId: getCurrentUserId(),
		ownerName: getCurrentUserName(),
	});

	if (!result.success) {
		showToast(result.error || "Не удалось создать поездку");
		return;
	}

	await logActivity(result.data, {
		type: "trip_created",
		message: `Создана поездка «${title}»`,
		actorUserId: getCurrentUserId(),
	});

	closeModal("modal-trip");
	showToast("Поездка создана");
	await openTrip(result.data);
}

async function handleAddParticipant() {
	const trip = currentTrip();
	if (!trip) {
		return;
	}

	if (!isOwner(trip)) {
		showToast("Только владелец может добавлять участников");
		return;
	}

	const login = DOM["np-login"].value.trim().toLowerCase();
	if (!login) {
		showToast("Введите логин участника");
		return;
	}

	const matchedUser = state.allUsers.find((user) => user.login === login || user.uid === login || user.email === login);
	if (!matchedUser) {
		showToast("Пользователь с таким логином не найден");
		return;
	}

	const existingParticipant = tripParticipants(trip.id).find((participant) => participant.userId === matchedUser.uid);
	if (existingParticipant) {
		showToast("Пользователь уже есть в поездке");
		return;
	}

	const result = await addParticipant({
		tripId: trip.id,
		userId: matchedUser.uid,
		name: matchedUser.fullName,
		email: matchedUser.email,
		role: TRIP_ROLES.member,
	});

	if (!result.success) {
		showToast(result.error || "Не удалось добавить участника");
		return;
	}

	await addFriend(getCurrentUserId(), matchedUser.uid);
	await addFriend(matchedUser.uid, getCurrentUserId());
	DOM["np-login"].value = "";
	closeModal("modal-person");
	showToast(`${matchedUser.fullName} добавлен(а) в поездку`);
}

async function handleInviteCopy() {
	const trip = currentTrip();
	if (!trip) {
		return;
	}

	if (!isOwner(trip)) {
		showToast("Только владелец может приглашать");
		return;
	}

	const invite = buildInviteMessage(trip.title, trip.joinCode, window.location.href);
	try {
		await navigator.clipboard.writeText(invite.url);
		showToast("Ссылка скопирована");
	} catch {
		DOM["invite-link"].select();
		showToast("Скопируйте ссылку вручную");
	}
}

async function handleDeleteTrip() {
	const trip = currentTrip();
	if (!trip) {
		return;
	}

	if (!isOwner(trip)) {
		showToast("Только владелец может удалить поездку");
		return;
	}

	if (!window.confirm(`Удалить поездку «${trip.title}» полностью? Это действие нельзя отменить.`)) {
		return;
	}

	const result = await deleteTripCascade(trip.id, {
		participantIds: state.allParticipants.filter((participant) => participant.tripId === trip.id).map((participant) => participant.id),
		expenseIds: state.allExpenses.filter((expense) => expense.tripId === trip.id).map((expense) => expense.id),
		activityIds: state.allActivities.filter((activity) => activity.tripId === trip.id).map((activity) => activity.id),
		notificationIds: state.allNotifications.filter((notification) => notification.tripId === trip.id).map((notification) => notification.id),
	});

	if (!result.success) {
		showToast(result.error || "Не удалось удалить поездку");
		return;
	}

	state.selectedTripId = null;
	closeModal("modal-expense");
	closeModal("modal-person");
	closeModal("modal-invite");
	closeModal("modal-trip");
	switchView("view-home");
	renderHome();
	showToast("Поездка удалена");
}

async function handleSaveExpense() {
	const trip = currentTrip();
	if (!trip) {
		return;
	}

	const title = DOM["ex-title"].value.trim();
	const amount = Number(DOM["ex-amount"].value);
	const payerId = DOM["ex-payer"].value;
	const currency = DOM["ex-currency"].value;
	const categoryValue = DOM["ex-category"].value;
	const category = categoryValue === "__custom" ? (DOM["ex-category-custom"].value.trim() || "Прочее") : categoryValue;
	const expenseType = DOM["ex-type"].value;
	const participantIds = [...state.selectedParticipantIds];

	if (!title) {
		showToast("Укажите описание траты");
		return;
	}

	if (!Number.isFinite(amount) || amount <= 0) {
		showToast("Укажите корректную сумму");
		return;
	}

	if (participantIds.length === 0) {
		showToast("Выберите хотя бы одного участника");
		return;
	}

	let splitByUserIds = participantIds;
	let splitAmounts = {};

	if (expenseType === "personal") {
		splitByUserIds = [payerId];
		splitAmounts = { [payerId]: amount };
	} else if (expenseType === "on_behalf") {
		splitByUserIds = participantIds.filter((participantId) => participantId !== payerId);
		if (splitByUserIds.length === 0) {
			showToast("Выберите хотя бы одного пользователя, за которого заплатили");
			return;
		}
		splitAmounts = buildSplitAmounts(amount, splitByUserIds);
	} else {
		if (state.splitMode === EXPENSE_SPLIT_TYPES.manual) {
			const manual = collectManualSplitAmounts(participantIds);
			if (Math.abs(manual.total - amount) > 0.01) {
				showToast(`Сумма долей (${manual.total.toFixed(2)}) не совпадает с суммой траты (${amount.toFixed(2)})`);
				return;
			}
			splitAmounts = manual.values;
		} else {
			splitAmounts = buildSplitAmounts(amount, participantIds);
		}
	}

	const receiptUrls = Array.from(DOM["ex-receipt"].files ?? []).map((file) => file.name);

	const payload = {
		tripId: trip.id,
		title,
		amount,
		paidByUserId: payerId,
		splitByUserIds,
		splitAmounts,
		splitType: state.splitMode,
		expenseType,
		currency,
		category,
		createdByUserId: getCurrentUserId(),
		receiptUrls,
	};

	const isEditing = Boolean(state.editingExpenseId);
	let result;
	if (state.editingExpenseId) {
		result = await updateExpense(state.editingExpenseId, {
			...payload,
			updatedByUserId: getCurrentUserId(),
			tripId: trip.id,
		});
	} else {
		result = await addExpense(payload);
	}

	if (!result.success) {
		showToast(result.error || "Не удалось сохранить трату");
		return;
	}

	closeModal("modal-expense");
	state.editingExpenseId = null;
	showToast(isEditing ? "Трата обновлена" : "Трата добавлена");
}

function openTripFromCard(tripId) {
	state.selectedTripId = tripId;
	state.activeTab = "overview";
	switchView("view-trip");
	renderTrip();
}

function openExpenseModal(expenseId = null) {
	const trip = currentTrip();
	if (!trip) {
		return;
	}

	prepareExpenseModal(expenseId);
	openModal("modal-expense");
}

function setAuthMode(mode) {
	state.authMode = mode;
	DOM["auth-mode-signin"]?.classList.toggle("active", mode === "signin");
	DOM["auth-mode-signup"]?.classList.toggle("active", mode === "signup");
	if (DOM["auth-fullname-wrap"]) {
		DOM["auth-fullname-wrap"].style.display = mode === "signup" ? "block" : "none";
	}
	if (DOM["auth-login-wrap"]) {
		DOM["auth-login-wrap"].style.display = mode === "signup" ? "block" : "none";
	}
}

function openAuthModal(mode = state.authMode) {
	setAuthMode(mode);
	setAuthModalVisible(true);
}

async function handleAuthSubmit() {
	const email = DOM["auth-email"]?.value.trim();
	const password = DOM["auth-password"]?.value ?? "";

	if (!email || !password) {
		showToast("Введите email и пароль");
		return;
	}

	if (state.authMode === "signup") {
		const fullName = DOM["auth-fullname"]?.value.trim();
		const login = DOM["auth-login"]?.value.trim().toLowerCase();

		if (!fullName || !login) {
			showToast("Введите имя, фамилию и логин");
			return;
		}

		if (!/^[a-z0-9._-]+$/.test(login)) {
			showToast("Логин должен быть на латинице без пробелов");
			return;
		}

		const result = await signUpWithEmailPassword({ email, password, fullName, login });
		if (!result.success) {
			showToast(result.error || "Не удалось зарегистрироваться");
			return;
		}

		showToast("Регистрация выполнена");
		return;
	}

	const result = await signInWithEmailPassword({ email, password });
	if (!result.success) {
		showToast(result.error || "Не удалось войти");
		return;
	}

	showToast("Вход выполнен");
}

function clearDataSubscriptions() {
	while (unsubscribers.length > 0) {
		const unsubscribe = unsubscribers.pop();
		unsubscribe?.();
	}

	if (unsubscribeProfile) {
		unsubscribeProfile();
		unsubscribeProfile = null;
	}

	state.allTrips = [];
	state.allUsers = [];
	state.allParticipants = [];
	state.allExpenses = [];
	state.allActivities = [];
	state.allNotifications = [];
	state.selectedTripId = null;
	state.userProfile = null;
}

function attachDataSubscriptions() {
	clearDataSubscriptions();

	if (!state.currentUser) {
		refreshUserBadge();
		renderHome();
		return;
	}

	const currentUserId = state.currentUser.uid;
	unsubscribeProfile = subscribeToUserProfile(currentUserId, (profile) => {
		state.userProfile = profile ? { id: profile.id, ...profile } : null;
		if (!state.userProfile && state.currentUser?.email) {
			const emailPrefix = state.currentUser.email.split("@")[0] || CURRENT_USER_FALLBACK;
			upsertUserProfile(currentUserId, {
				fullName: emailPrefix,
				login: emailPrefix.replace(/[^a-z0-9._-]/gi, "").toLowerCase() || emailPrefix.toLowerCase(),
				email: state.currentUser.email,
				friends: [],
			}).catch((error) => console.error(error));
			return;
		}
		if (state.userProfile?.fullName) {
			saveDisplayName(state.userProfile.fullName);
		}
		refreshUserBadge();
		renderHome();
		if (state.selectedTripId) {
			renderTrip();
		}
	});

	unsubscribers.push(
		subscribeToCollection(COLLECTIONS.users, (users) => {
			state.allUsers = users;
		}),
	);

	unsubscribers.push(
		subscribeToCollection(COLLECTIONS.trips, (trips) => {
			state.allTrips = trips;
			renderHome();

			if (!state.selectedTripId) {
				const autoTripId = getSelectedTripIdFromUrl();
				if (autoTripId) {
					state.selectedTripId = autoTripId;
					switchView("view-trip");
				}
			}

			handleAutoInviteJoin().catch((error) => console.error(error));

			if (state.selectedTripId && state.allTrips.some((trip) => trip.id === state.selectedTripId)) {
				renderTrip();
			}
		}),
	);

	unsubscribers.push(
		subscribeToCollection(COLLECTIONS.participants, (participants) => {
			state.allParticipants = participants;
			renderHome();

			if (state.selectedTripId) {
				renderTrip();
			}

			handleAutoInviteJoin().catch((error) => console.error(error));
		}),
	);

	unsubscribers.push(
		subscribeToCollection(COLLECTIONS.expenses, (expenses) => {
			state.allExpenses = expenses;
			renderHome();
			if (state.selectedTripId) {
				renderTrip();
			}
		}),
	);

	unsubscribers.push(
		subscribeToCollection(COLLECTIONS.activities, (activities) => {
			state.allActivities = activities;
			if (state.selectedTripId) {
				renderTrip();
			}
		}),
	);

	unsubscribers.push(
		subscribeToCollection(COLLECTIONS.notifications, (notifications) => {
			state.allNotifications = notifications;
		}),
	);

	refreshUserBadge();
	renderHome();

	const tripFromUrl = getSelectedTripIdFromUrl();
	if (tripFromUrl) {
		openTrip(tripFromUrl).catch((error) => console.error(error));
	}
}

function handleAuthState(user) {
	state.currentUser = user;
	if (!user) {
		clearDataSubscriptions();
		refreshUserBadge();
		refreshAuthUi();
		openAuthModal("signin");
		return;
	}

	refreshAuthUi();
	attachDataSubscriptions();
}

function attachStaticListeners() {
	DOM["filter-form"]?.addEventListener("submit", (event) => {
		event.preventDefault();
		commitPendingTag("f-country-input");
		commitPendingTag("f-city-input");
		state.filterMode = "search";
		state.filterWasApplied = true;
		renderHome();
	});

	DOM["f-name"]?.addEventListener("input", () => {
		state.filterMode = "all";
	});
	DOM["f-country-input"]?.addEventListener("input", () => {
		state.filterMode = "all";
	});
	DOM["f-city-input"]?.addEventListener("input", () => {
		state.filterMode = "all";
	});

	DOM["f-date-from"]?.addEventListener("change", () => {
		state.filterMode = "all";
	});
	DOM["f-date-to"]?.addEventListener("change", () => {
		state.filterMode = "all";
	});

	DOM["btn-new-trip"]?.addEventListener("click", () => {
		prepareTripModal();
		openModal("modal-trip");
	});

	DOM["btn-back-home"]?.addEventListener("click", () => {
		switchView("view-home");
		renderHome();
	});

	DOM["btn-theme-toggle"]?.addEventListener("click", toggleTheme);
	DOM["btn-auth-open"]?.addEventListener("click", () => openAuthModal("signin"));
	DOM["btn-sign-out"]?.addEventListener("click", async () => {
		const result = await signOutCurrentUser();
		if (!result.success) {
			showToast(result.error || "Не удалось выйти");
		}
	});

	DOM["auth-mode-signin"]?.addEventListener("click", () => openAuthModal("signin"));
	DOM["auth-mode-signup"]?.addEventListener("click", () => openAuthModal("signup"));
	DOM["auth-submit"]?.addEventListener("click", handleAuthSubmit);

	DOM["btn-invite"]?.addEventListener("click", () => {
		if (!isOwner(currentTrip())) {
			showToast("Только владелец может приглашать");
			return;
		}

		prepareInviteModal();
		openModal("modal-invite");
	});

	DOM["btn-delete-trip"]?.addEventListener("click", handleDeleteTrip);

	DOM["invite-copy"]?.addEventListener("click", handleInviteCopy);
	DOM["btn-add-person"]?.addEventListener("click", () => {
		if (!isOwner(currentTrip())) {
			showToast("Только владелец может добавлять участников");
			return;
		}

		prepareParticipantModal();
		openModal("modal-person");
	});

	DOM["btn-add-expense"]?.addEventListener("click", () => openExpenseModal(null));
	DOM["btn-add-expense-2"]?.addEventListener("click", () => openExpenseModal(null));

	DOM["nt-submit"]?.addEventListener("click", handleCreateTrip);
	DOM["np-submit"]?.addEventListener("click", handleAddParticipant);
	DOM["ex-submit"]?.addEventListener("click", handleSaveExpense);

	DOM["ex-category"]?.addEventListener("change", () => {
		DOM["ex-category-custom"].style.display = DOM["ex-category"].value === "__custom" ? "block" : "none";
	});

	DOM["ex-type"]?.addEventListener("change", () => {
		const trip = currentTrip();
		if (!trip) {
			return;
		}

		syncExpenseForm(trip);
	});

	DOM["ex-payer"]?.addEventListener("change", () => {
		const trip = currentTrip();
		if (!trip) {
			return;
		}

		syncExpenseForm(trip);
	});

	DOM["split-equal"]?.addEventListener("click", () => {
		const trip = currentTrip();
		if (!trip) {
			return;
		}

		setSplitMode(EXPENSE_SPLIT_TYPES.even, null, trip, tripParticipants(trip.id));
	});

	DOM["split-manual"]?.addEventListener("click", () => {
		const trip = currentTrip();
		if (!trip) {
			return;
		}

		setSplitMode(EXPENSE_SPLIT_TYPES.manual, null, trip, tripParticipants(trip.id));
	});

	document.querySelectorAll(".tab-btn").forEach((button) => {
		button.addEventListener("click", () => {
			state.activeTab = button.dataset.tab;
			document.querySelectorAll(".tab-btn").forEach((item) => item.classList.toggle("active", item.dataset.tab === state.activeTab));
			document.querySelectorAll(".tab-panel").forEach((item) => item.classList.toggle("active", item.dataset.panel === state.activeTab));
		});
	});

	document.querySelectorAll("[data-close]").forEach((button) => {
		button.addEventListener("click", () => closeModal(button.dataset.close));
	});

	document.querySelectorAll(".modal-overlay").forEach((overlay) => {
		overlay.addEventListener("click", (event) => {
			if (event.target === overlay) {
				closeModal(overlay.id);
			}
		});
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			document.querySelectorAll(".modal-overlay.active").forEach((overlay) => closeModal(overlay.id));
		}
	});
}

async function bootstrapApp() {
	const unsubscribeAuth = subscribeToAuthState((user) => {
		handleAuthState(user);
	});
	unsubscribers.push(unsubscribeAuth);

	refreshUserBadge();
	attachStaticListeners();
	refreshAuthUi();

	window.travelMvp = {
		app,
		state,
		trips: {
			createTrip,
			updateTrip,
			findTripByJoinCode,
			filterTrips,
		},
		participants: {
			addParticipant,
		},
		expenses: {
			addExpense,
			updateExpense,
			removeExpense,
		},
		balances: {
			calculateBalances,
		},
		invites: {
			buildInviteMessage,
			getJoinCodeFromUrl,
			resolveTripFromInviteUrl,
		},
		auth: {
			signInWithEmailPassword,
			signUpWithEmailPassword,
			signOutCurrentUser,
			subscribeToAuthState,
		},
	};

	renderHome();
}

document.addEventListener("DOMContentLoaded", () => {
	cacheDom();
	wireTagInput("nt-countries-input");
	wireTagInput("nt-cities-input");
	bootstrapApp().catch((error) => {
		console.error("Bootstrap failed:", error);
	});
});