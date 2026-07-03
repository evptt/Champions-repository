import { serverTimestamp } from "firebase/firestore";
import { COLLECTIONS } from "./config.js";
import { createDocument, subscribeToCollectionWhere } from "./firestore-service.js";

const ACTIVITIES_COLLECTION = COLLECTIONS.activities;

/**
 * Adds an activity record for a trip.
 * @param {string} tripId
 * @param {{type: string, message: string, actorUserId?: string | null}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function logActivity(tripId, payload) {
	return createDocument(ACTIVITIES_COLLECTION, {
		tripId,
		type: payload.type,
		message: payload.message,
		actorUserId: payload.actorUserId ?? null,
		createdAt: serverTimestamp(),
	});
}

/**
 * Subscribes to activity history for a trip.
 * @param {string} tripId
 * @param {(items: Array<object>) => void} callback
 * @returns {() => void}
 */
export function subscribeToTripActivities(tripId, callback) {
	return subscribeToCollectionWhere(ACTIVITIES_COLLECTION, "tripId", "==", tripId, callback);
}