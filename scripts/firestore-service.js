import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	onSnapshot,
	query,
	where,
	updateDoc,
} from "firebase/firestore";
import { db } from "./firebase-init.js";

/**
 * Returns a collection reference by name.
 * @param {string} collectionName
 * @returns {import('firebase/firestore').CollectionReference}
 */
export function getCollectionRef(collectionName) {
	return collection(db, collectionName);
}

/**
 * Returns a document reference by collection name and document id.
 * @param {string} collectionName
 * @param {string} documentId
 * @returns {import('firebase/firestore').DocumentReference}
 */
export function getDocumentRef(collectionName, documentId) {
	return doc(db, collectionName, documentId);
}

/**
 * Adds a document to a collection.
 * @param {string} collectionName
 * @param {object} data
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function createDocument(collectionName, data) {
	try {
		const documentRef = await addDoc(getCollectionRef(collectionName), data);
		return { success: true, data: documentRef.id };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось создать документ.",
		};
	}
}

/**
 * Updates a document in a collection.
 * @param {string} collectionName
 * @param {string} documentId
 * @param {object} data
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function updateDocument(collectionName, documentId, data) {
	try {
		await updateDoc(getDocumentRef(collectionName, documentId), data);
		return { success: true, data: null };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось обновить документ.",
		};
	}
}

/**
 * Deletes a document from a collection.
 * @param {string} collectionName
 * @param {string} documentId
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function deleteDocument(collectionName, documentId) {
	try {
		await deleteDoc(getDocumentRef(collectionName, documentId));
		return { success: true, data: null };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Не удалось удалить документ.",
		};
	}
}

/**
 * Subscribes to a collection in realtime.
 * @param {string} collectionName
 * @param {(items: Array<{id: string, [key: string]: unknown}>) => void} callback
 * @returns {() => void}
 */
export function subscribeToCollection(collectionName, callback) {
	return onSnapshot(getCollectionRef(collectionName), (snapshot) => {
		const items = snapshot.docs.map((documentSnapshot) => ({
			id: documentSnapshot.id,
			...documentSnapshot.data(),
		}));

		callback(items);
	});
}

/**
 * Subscribes to documents matching a simple field filter.
 * @param {string} collectionName
 * @param {string} fieldName
 * @param {'==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'not-in'} operator
 * @param {unknown} value
 * @param {(items: Array<{id: string, [key: string]: unknown}>) => void} callback
 * @returns {() => void}
 */
export function subscribeToCollectionWhere(collectionName, fieldName, operator, value, callback) {
	const collectionQuery = query(getCollectionRef(collectionName), where(fieldName, operator, value));

	return onSnapshot(collectionQuery, (snapshot) => {
		const items = snapshot.docs.map((documentSnapshot) => ({
			id: documentSnapshot.id,
			...documentSnapshot.data(),
		}));

		callback(items);
	});
}

/**
 * Subscribes to a single document in realtime.
 * @param {string} collectionName
 * @param {string} documentId
 * @param {(item: ({id: string, [key: string]: unknown} | null)) => void} callback
 * @returns {() => void}
 */
export function subscribeToDocument(collectionName, documentId, callback) {
	return onSnapshot(getDocumentRef(collectionName, documentId), (snapshot) => {
		callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
	});
}
