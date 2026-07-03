import { arrayRemove, arrayUnion, serverTimestamp } from "firebase/firestore";
import { COLLECTIONS, TRIP_ROLES } from "./config.js";
import { createDocument, deleteDocument, subscribeToCollectionWhere, updateDocument } from "./firestore-service.js";

const PARTICIPANTS_COLLECTION = COLLECTIONS.participants;
const TRIPS_COLLECTION = COLLECTIONS.trips;

/**
 * Adds a participant to a trip.
 * @param {{tripId: string, userId: string, name?: string, role?: string}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function addParticipant(payload) {
  const participantData = {
    tripId: payload.tripId,
    userId: payload.userId,
    name: payload.name?.trim() ?? "",
    role: payload.role ?? TRIP_ROLES.member,
    email: payload.email?.trim() ?? "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const creationResult = await createDocument(PARTICIPANTS_COLLECTION, participantData);
  if (!creationResult.success) {
    return creationResult;
  }

  if (payload.tripId && payload.userId) {
    await updateDocument(TRIPS_COLLECTION, payload.tripId, {
      participantIds: arrayUnion(payload.userId),
      roles: {
        [payload.userId]: payload.role ?? TRIP_ROLES.member,
      },
      updatedAt: serverTimestamp(),
    });
  }

  return creationResult;
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
  const deletionResult = await deleteDocument(PARTICIPANTS_COLLECTION, participantId);
  if (!deletionResult.success) {
    return deletionResult;
  }

  if (tripId && userId) {
    await updateDocument(TRIPS_COLLECTION, tripId, {
      participantIds: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
  }

  return deletionResult;
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