import app from "./firebase-init.js";
import { ensureAnonymousAuth, signOutCurrentUser, subscribeToAuthState } from "./auth.js";
import * as trips from "./trips.js";
import * as participants from "./participants.js";
import * as expenses from "./expenses.js";
import { calculateBalances } from "./balances.js";
import * as invites from "./invites.js";
import * as notifications from "./notifications.js";
import * as history from "./history.js";

/**
 * Bootstraps Firebase and makes the data API available to the UI layer.
 * @returns {Promise<{success: boolean, data?: unknown, error?: string}>}
 */
export async function bootstrapApp() {
	const authResult = await ensureAnonymousAuth();
	if (!authResult.success) {
		return authResult;
	}

	window.travelMvp = {
		app,
		trips,
		participants,
		expenses,
		calculateBalances,
		invites,
		notifications,
		history,
		auth: {
			ensureAnonymousAuth,
			signOutCurrentUser,
			subscribeToAuthState,
		},
	};

	return { success: true, data: window.travelMvp };
}

bootstrapApp().catch((error) => {
	console.error("Bootstrap failed:", error);
});