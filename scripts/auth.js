import {
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	signInAnonymously,
	signInWithEmailAndPassword,
	signOut,
} from "firebase/auth";
import { auth } from "./firebase-init.js";
import { upsertUserProfile } from "./users.js";

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
 * Registers a new Firebase Auth user and stores a profile document.
 * @param {{email: string, password: string, fullName: string, login: string}} payload
 * @returns {Promise<{success: boolean, data?: import('firebase/auth').User, error?: string}>}
 */
export async function signUpWithEmailPassword(payload) {
	try {
		const credential = await createUserWithEmailAndPassword(auth, payload.email.trim(), payload.password);
		const profileResult = await upsertUserProfile(credential.user.uid, {
			fullName: payload.fullName,
			login: payload.login,
			email: payload.email,
			friends: [],
		});

		if (!profileResult.success) {
			return { success: false, error: profileResult.error };
		}

		return { success: true, data: credential.user };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось зарегистрировать пользователя.",
		};
	}
}

/**
 * Signs in an existing Firebase Auth user.
 * @param {{email: string, password: string}} payload
 * @returns {Promise<{success: boolean, data?: import('firebase/auth').User, error?: string}>}
 */
export async function signInWithEmailPassword(payload) {
	try {
		const credential = await signInWithEmailAndPassword(auth, payload.email.trim(), payload.password);
		return { success: true, data: credential.user };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось войти в аккаунт.",
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
