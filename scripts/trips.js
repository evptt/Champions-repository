import { serverTimestamp } from "firebase/firestore";
import { COLLECTIONS, TRIP_ROLES } from "./config.js";
import { createDocument, deleteDocument, subscribeToCollection, updateDocument } from "./firestore-service.js";

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
			currency: payload.currency ?? "USD",
			joinCode: generateJoinCode(),
			roles: {
				[payload.ownerId]: TRIP_ROLES.owner,
			},
			participantIds: [payload.ownerId],
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		};

		return await createDocument(TRIPS_COLLECTION, tripData);
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
 * @param {{title?: string, date?: string, country?: string, city?: string}} filters
 * @returns {Array<object>}
 */
export function filterTrips(trips, filters = {}) {
	const titleQuery = filters.title?.trim().toLowerCase() ?? "";
	const dateQuery = filters.date?.trim() ?? "";
	const countryQuery = filters.country?.trim().toLowerCase() ?? "";
	const cityQuery = filters.city?.trim().toLowerCase() ?? "";

	return trips.filter((trip) => {
		const titleMatches = !titleQuery || trip.title?.toLowerCase().includes(titleQuery);
		const dateMatches = !dateQuery || trip.dates?.start === dateQuery || trip.dates?.end === dateQuery;
		const countryMatches =
			!countryQuery || (trip.countries ?? []).some((country) => String(country).toLowerCase().includes(countryQuery));
		const cityMatches =
			!cityQuery || (trip.cities ?? []).some((city) => String(city).toLowerCase().includes(cityQuery));

		return titleMatches && dateMatches && countryMatches && cityMatches;
	});
}
