import { onAuthStateChanged, signInAnonymously, signOut } from "firebase/auth";
import { auth } from "./firebase-init.js";

/**
 * Ensures the app has an authenticated anonymous Firebase user.
 * @returns {Promise<{success: boolean, data?: import('firebase/auth').User, error?: string}>}
 */
export async function ensureAnonymousAuth() {
	try {
		if (auth.currentUser) {
			return { success: true, data: auth.currentUser };
		}

		const credential = await signInAnonymously(auth);
		return { success: true, data: credential.user };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось выполнить анонимный вход.",
		};
	}
}

/**
 * Signs out the current Firebase user.
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function signOutCurrentUser() {
	try {
		await signOut(auth);
		return { success: true, data: null };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось выйти из аккаунта.",
		};
	}
}

/**
 * Subscribes to authentication state changes.
 * @param {(user: import('firebase/auth').User | null) => void} callback
 * @returns {() => void}
 */
export function subscribeToAuthState(callback) {
	return onAuthStateChanged(auth, callback);
}
