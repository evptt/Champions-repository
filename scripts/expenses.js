import { serverTimestamp } from "firebase/firestore";
import { COLLECTIONS, DEFAULT_CATEGORIES, EXPENSE_SPLIT_TYPES } from "./config.js";
import { createDocument, deleteDocument, subscribeToCollectionWhere, updateDocument } from "./firestore-service.js";
import { createNotification } from "./notifications.js";
import { logActivity } from "./history.js";

const EXPENSES_COLLECTION = COLLECTIONS.expenses;

/**
 * Creates an expense document.
 * @param {{tripId: string, title: string, amount: number, paidByUserId: string, splitByUserIds?: string[], currency?: string, category?: string, note?: string, splitType?: string, createdByUserId?: string, receiptUrls?: string[]}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function addExpense(payload) {
  const expenseData = {
    tripId: payload.tripId,
    title: payload.title.trim(),
    amount: Number(payload.amount),
    paidByUserId: payload.paidByUserId,
    splitByUserIds: payload.splitByUserIds ?? [],
    currency: payload.currency ?? "USD",
    category: payload.category ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1],
    note: payload.note?.trim() ?? "",
    splitType: payload.splitType ?? EXPENSE_SPLIT_TYPES.even,
    createdByUserId: payload.createdByUserId ?? payload.paidByUserId,
    receiptUrls: payload.receiptUrls ?? [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const result = await createDocument(EXPENSES_COLLECTION, expenseData);
  if (result.success) {
    await logActivity(payload.tripId, {
      type: "expense_created",
      message: `Добавлена трата: ${expenseData.title}`,
      actorUserId: expenseData.createdByUserId,
    });

    await createNotification({
      tripId: payload.tripId,
      type: "expense_created",
      message: `Новая трата: ${expenseData.title}`,
      createdByUserId: expenseData.createdByUserId,
    });
  }

  return result;
}

/**
 * Updates an expense document.
 * @param {string} expenseId
 * @param {object} data
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function updateExpense(expenseId, data) {
  const result = await updateDocument(EXPENSES_COLLECTION, expenseId, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  if (result.success && data.tripId) {
    await logActivity(data.tripId, {
      type: "expense_updated",
      message: `Изменена трата`,
      actorUserId: data.updatedByUserId ?? null,
    });
  }

  return result;
}

/**
 * Deletes an expense document.
 * @param {string} expenseId
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function removeExpense(expenseId) {
  return deleteDocument(EXPENSES_COLLECTION, expenseId);
}

/**
 * Subscribes to expenses in a specific trip.
 * @param {string} tripId
 * @param {(expenses: Array<object>) => void} callback
 * @returns {() => void}
 */
export function subscribeToTripExpenses(tripId, callback) {
  return subscribeToCollectionWhere(EXPENSES_COLLECTION, "tripId", "==", tripId, callback);
}
