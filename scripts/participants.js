import { arrayRemove, arrayUnion, increment, runTransaction, serverTimestamp } from "firebase/firestore";
import { COLLECTIONS, TRIP_ROLES } from "./config.js";
import { getCollectionWhere, getDocumentRef, subscribeToCollectionWhere, updateDocument } from "./firestore-service.js";
import { db } from "./firebase-init.js";
import { createNotification } from "./notifications.js";
import { logActivity } from "./history.js";

const PARTICIPANTS_COLLECTION = COLLECTIONS.participants;
const TRIPS_COLLECTION = COLLECTIONS.trips;

/**
 * Adds a participant to a trip.
 * @param {{tripId: string, userId: string, name?: string, role?: string}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function addParticipant(payload) {
  const participantId = `${payload.tripId}_${payload.userId}`;

  const existingParticipants = await getCollectionWhere(PARTICIPANTS_COLLECTION, "tripId", "==", payload.tripId);
  const duplicate = existingParticipants.find((participant) => participant.userId === payload.userId);
  if (duplicate) {
    return {
      success: true,
      data: duplicate.id,
    };
  }

  const participantData = {
    tripId: payload.tripId,
    userId: payload.userId,
    name: payload.name?.trim() ?? "",
    role: payload.role ?? TRIP_ROLES.member,
    email: payload.email?.trim() ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const creationResult = await runTransaction(db, async (transaction) => {
    const participantRef = getDocumentRef(PARTICIPANTS_COLLECTION, participantId);
    const participantSnap = await transaction.get(participantRef);

    if (participantSnap.exists()) {
      return { created: false, participantId };
    }

    const tripRef = getDocumentRef(TRIPS_COLLECTION, payload.tripId);
    const tripSnap = await transaction.get(tripRef);
    if (!tripSnap.exists()) {
      throw new Error("Поездка не найдена.");
    }

    transaction.set(participantRef, participantData);
    transaction.update(tripRef, {
      participantIds: arrayUnion(payload.userId),
      guestIds: arrayUnion(payload.userId),
      participantCount: increment(1),
      [`roles.${payload.userId}`]: payload.role ?? TRIP_ROLES.member,
      updatedAt: serverTimestamp(),
    });

    return { created: true, participantId };
  }).catch((error) => ({
    created: false,
    error: error instanceof Error ? error.message : "Не удалось добавить участника.",
  }));

  if (creationResult.error) {
    return {
      success: false,
      error: creationResult.error,
    };
  }

  if (creationResult.created) {
    await logActivity(payload.tripId, {
      type: "participant_added",
      message: `Добавлен участник: ${participantData.name || payload.userId}`,
      actorUserId: payload.userId,
    });

    await createNotification({
      tripId: payload.tripId,
      type: "participant_added",
      message: `Вас добавили в поездку`,
      createdByUserId: payload.userId,
      targetUserId: payload.userId,
    });
  }

  return {
    success: true,
    data: participantId,
  };
}

/**
 * Updates a participant document.
 * @param {string} participantId
 * @param {object} data
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function updateParticipant(participantId, data) {
  return updateDocument(PARTICIPANTS_COLLECTION, participantId, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Removes a participant from a trip.
 * @param {string} participantId
 * @param {string} tripId
 * @param {string} userId
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function removeParticipant(participantId, tripId, userId) {
  const deletionResult = await runTransaction(db, async (transaction) => {
    const participantRef = getDocumentRef(PARTICIPANTS_COLLECTION, participantId);
    const participantSnap = await transaction.get(participantRef);
    if (!participantSnap.exists()) {
      return { deleted: false };
    }

    transaction.delete(participantRef);

    if (tripId && userId) {
      const tripRef = getDocumentRef(TRIPS_COLLECTION, tripId);
      transaction.update(tripRef, {
        participantIds: arrayRemove(userId),
        guestIds: arrayRemove(userId),
        participantCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    }

    return { deleted: true };
  }).catch((error) => ({
    deleted: false,
    error: error instanceof Error ? error.message : "Не удалось удалить участника.",
  }));

  if (deletionResult.error) {
    return {
      success: false,
      error: deletionResult.error,
    };
  }

  if (deletionResult.deleted && tripId && userId) {
    await logActivity(tripId, {
      type: "participant_removed",
      message: `Удалён участник`,
      actorUserId: userId,
    });
  }

  return {
    success: true,
    data: null,
  };
}

/**
 * Subscribes to participants in a specific trip.
 * @param {string} tripId
 * @param {(participants: Array<object>) => void} callback
 * @returns {() => void}
 */
export function subscribeToTripParticipants(tripId, callback) {
  return subscribeToCollectionWhere(PARTICIPANTS_COLLECTION, "tripId", "==", tripId, callback);
}

/**
 * Returns reusable participant profiles for a user across trips.
 * @param {Array<{userId: string, name?: string, email?: string}>} participants
 * @param {string} userId
 * @returns {Array<object>}
 */
export function getReusableParticipantProfiles(participants, userId) {
	return participants.filter((participant) => participant.userId === userId);
}