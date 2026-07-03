import { arrayUnion, serverTimestamp } from "firebase/firestore";
import { COLLECTIONS } from "./config.js";
import { createDocument, subscribeToCollectionWhere, updateDocument } from "./firestore-service.js";

const NOTIFICATIONS_COLLECTION = COLLECTIONS.notifications;

/**
 * Creates a notification for a trip.
 * @param {{tripId: string, type: string, message: string, createdByUserId?: string, targetUserId?: string}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function createNotification(payload) {
  return createDocument(NOTIFICATIONS_COLLECTION, {
    tripId: payload.tripId,
    type: payload.type,
    message: payload.message,
    createdByUserId: payload.createdByUserId ?? null,
    targetUserId: payload.targetUserId ?? null,
    readBy: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribes to notifications for a specific trip.
 * @param {string} tripId
 * @param {(notifications: Array<object>) => void} callback
 * @returns {() => void}
 */
export function subscribeToTripNotifications(tripId, callback) {
  return subscribeToCollectionWhere(NOTIFICATIONS_COLLECTION, "tripId", "==", tripId, callback);
}

/**
 * Marks a notification as read by a user.
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function markNotificationAsRead(notificationId, userId) {
  return updateDocument(NOTIFICATIONS_COLLECTION, notificationId, {
    readBy: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });
}