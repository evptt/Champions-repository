import { serverTimestamp } from "firebase/firestore";
import { COLLECTIONS, TRIP_ROLES } from "./config.js";
import { createDocument, deleteDocument, subscribeToCollection, updateDocument } from "./firestore-service.js";
import { logActivity } from "./history.js";

const TRIPS_COLLECTION = COLLECTIONS.trips;

/**
 * Generates a short join code for invitations.
 * @param {number} length
 * @returns {string}
 */
export function generateJoinCode(length = 6) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const values = crypto.getRandomValues(new Uint8Array(length));
	return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

/**
 * Creates a new trip document.
 * @param {{title: string, dates?: {start?: string, end?: string}, countries?: string[], cities?: string[], totalBudget?: number, ownerId: string, currency?: string, description?: string}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function createTrip(payload) {
	try {
		const tripData = {
			title: payload.title.trim(),
			description: payload.description?.trim() ?? "",
			dates: {
				start: payload.dates?.start ?? "",
				end: payload.dates?.end ?? "",
			},
			countries: Array.isArray(payload.countries) ? payload.countries.filter(Boolean) : [],
			cities: Array.isArray(payload.cities) ? payload.cities.filter(Boolean) : [],
			totalBudget: Number(payload.totalBudget) || 0,
			ownerId: payload.ownerId,
			ownerName: payload.ownerName ?? "",
			currency: payload.currency ?? "USD",
			joinCode: generateJoinCode(),
			guestIds: [],
			participantCount: 1,
			roles: {
				[payload.ownerId]: TRIP_ROLES.owner,
			},
			participantIds: [payload.ownerId],
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		};

		const result = await createDocument(TRIPS_COLLECTION, tripData);

		return result;
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось создать поездку.",
		};
	}
}

/**
 * Updates a trip document.
 * @param {string} tripId
 * @param {object} data
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function updateTrip(tripId, data) {
	return updateDocument(TRIPS_COLLECTION, tripId, {
		...data,
		updatedAt: serverTimestamp(),
	});
}

/**
 * Deletes a trip document.
 * @param {string} tripId
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function deleteTrip(tripId) {
	return deleteDocument(TRIPS_COLLECTION, tripId);
}

/**
 * Deletes a trip and related documents from auxiliary collections.
 * @param {string} tripId
 * @param {{participantIds?: Array<string>, expenseIds?: Array<string>, activityIds?: Array<string>, notificationIds?: Array<string>}} relatedDocs
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function deleteTripCascade(tripId, relatedDocs = {}) {
	try {
		const participantIds = relatedDocs.participantIds ?? [];
		const expenseIds = relatedDocs.expenseIds ?? [];
		const activityIds = relatedDocs.activityIds ?? [];
		const notificationIds = relatedDocs.notificationIds ?? [];

		for (const participantId of participantIds) {
			await deleteDocument(COLLECTIONS.participants, participantId);
		}

		for (const expenseId of expenseIds) {
			await deleteDocument(COLLECTIONS.expenses, expenseId);
		}

		for (const activityId of activityIds) {
			await deleteDocument(COLLECTIONS.activities, activityId);
		}

		for (const notificationId of notificationIds) {
			await deleteDocument(COLLECTIONS.notifications, notificationId);
		}

		return await deleteDocument(TRIPS_COLLECTION, tripId);
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось удалить поездку.",
		};
	}
}

/**
 * Subscribes to the trips collection in realtime.
 * @param {(trips: Array<object>) => void} callback
 * @returns {() => void}
 */
export function subscribeToTrips(callback) {
	return subscribeToCollection(TRIPS_COLLECTION, callback);
}

/**
 * Finds a trip by join code from a list of trips already loaded in memory.
 * @param {Array<{id: string, joinCode?: string}>} trips
 * @param {string} joinCode
 * @returns {{id: string, joinCode?: string} | null}
 */
export function findTripByJoinCode(trips, joinCode) {
	const normalizedCode = joinCode.trim().toUpperCase();
	return trips.find((trip) => trip.joinCode === normalizedCode) ?? null;
}

/**
 * Returns trips filtered by one or more search criteria.
 * @param {Array<object>} trips
 * @param {{title?: string, dateFrom?: string, dateTo?: string, countries?: Array<string>, cities?: Array<string>}} filters
 * @returns {Array<object>}
 */
export function filterTrips(trips, filters = {}) {
	const titleQuery = filters.title?.trim().toLowerCase() ?? "";
	const dateFromQuery = filters.dateFrom?.trim() ?? "";
	const dateToQuery = filters.dateTo?.trim() ?? "";
	const countryQueries = Array.isArray(filters.countries)
		? filters.countries.filter(Boolean).map((country) => country.trim().toLowerCase())
		: [];
	const cityQueries = Array.isArray(filters.cities)
		? filters.cities.filter(Boolean).map((city) => city.trim().toLowerCase())
		: [];

	const parseDate = (value) => {
		if (!value) {
			return null;
		}

		const date = new Date(`${value}T00:00:00`);
		return Number.isNaN(date.getTime()) ? null : date;
	};

	return trips.filter((trip) => {
		const titleMatches = !titleQuery || trip.title?.toLowerCase().includes(titleQuery);

		const tripStartDate = parseDate(trip.dates?.start);
		const tripEndDate = parseDate(trip.dates?.end);
		const fromDate = parseDate(dateFromQuery);
		const toDate = parseDate(dateToQuery);
		let dateMatches = true;

		if (fromDate) {
			dateMatches = Boolean(tripEndDate && tripEndDate >= fromDate);
		}

		if (dateMatches && toDate) {
			dateMatches = Boolean(tripStartDate && tripStartDate <= toDate);
		}

		const countryMatches =
			countryQueries.length === 0 ||
			(trip.countries ?? []).some((country) =>
				countryQueries.some((query) => String(country).toLowerCase().includes(query)),
			);
		const cityMatches =
			cityQueries.length === 0 ||
			(trip.cities ?? []).some((city) => cityQueries.some((query) => String(city).toLowerCase().includes(query)));

		return titleMatches && dateMatches && countryMatches && cityMatches;
	});
}
