import { arrayRemove, arrayUnion, serverTimestamp } from "firebase/firestore";
import { COLLECTIONS } from "./config.js";
import { setDocument, subscribeToDocument, updateDocument } from "./firestore-service.js";

const USERS_COLLECTION = COLLECTIONS.users;

/**
 * Creates or updates a user profile stored under the auth uid.
 * @param {string} userId
 * @param {{fullName: string, login: string, email: string, friends?: string[]}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function upsertUserProfile(userId, payload) {
	return setDocument(
		USERS_COLLECTION,
		userId,
		{
			uid: userId,
			fullName: payload.fullName.trim(),
			login: payload.login.trim().toLowerCase(),
			email: payload.email.trim().toLowerCase(),
			friends: Array.isArray(payload.friends) ? payload.friends : [],
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		},
		false,
	);
}

/**
 * Updates a user profile.
 * @param {string} userId
 * @param {object} data
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function updateUserProfile(userId, data) {
	return updateDocument(USERS_COLLECTION, userId, {
		...data,
		updatedAt: serverTimestamp(),
	});
}

/**
 * Subscribes to a single user profile.
 * @param {string} userId
 * @param {(profile: ({id: string, [key: string]: unknown} | null)) => void} callback
 * @returns {() => void}
 */
export function subscribeToUserProfile(userId, callback) {
	return subscribeToDocument(USERS_COLLECTION, userId, callback);
}

/**
 * Adds a user to another user's friends list.
 * @param {string} userId
 * @param {string} friendUserId
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function addFriend(userId, friendUserId) {
	return updateDocument(USERS_COLLECTION, userId, {
		friends: arrayUnion(friendUserId),
		updatedAt: serverTimestamp(),
	});
}

/**
 * Removes a user from another user's friends list.
 * @param {string} userId
 * @param {string} friendUserId
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function removeFriend(userId, friendUserId) {
	return updateDocument(USERS_COLLECTION, userId, {
		friends: arrayRemove(friendUserId),
		updatedAt: serverTimestamp(),
	});
}