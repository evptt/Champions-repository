import { serverTimestamp } from "firebase/firestore";
import { COLLECTIONS, DEFAULT_CATEGORIES, EXPENSE_SPLIT_TYPES } from "./config.js";
import { createDocument, deleteDocument, subscribeToCollectionWhere, updateDocument } from "./firestore-service.js";
import { createNotification } from "./notifications.js";
import { logActivity } from "./history.js";

const EXPENSES_COLLECTION = COLLECTIONS.expenses;

function normalizeSplitAmounts(amount, splitByUserIds, splitAmounts = null) {
  if (splitAmounts && typeof splitAmounts === "object") {
    return splitAmounts;
  }

  if (!Array.isArray(splitByUserIds) || splitByUserIds.length === 0) {
    return {};
  }

  const share = amount / splitByUserIds.length;
  const normalized = {};
  let allocated = 0;

  splitByUserIds.forEach((userId, index) => {
    const isLast = index === splitByUserIds.length - 1;
    const value = isLast ? amount - allocated : share;
    const roundedValue = Number(value.toFixed(2));
    normalized[userId] = roundedValue;
    allocated += roundedValue;
  });

  return normalized;
}

function normalizeExpenseType(expenseType) {
  if (expenseType === "personal" || expenseType === "on_behalf" || expenseType === "shared") {
    return expenseType;
  }

  return "shared";
}

function buildExpenseSplitAmounts(expenseType, amount, payerId, splitByUserIds, splitAmounts) {
  const normalizedType = normalizeExpenseType(expenseType);
  const normalizedParticipants = Array.from(new Set((splitByUserIds ?? []).filter(Boolean)));

  if (normalizedType === "personal") {
    return {
      splitByUserIds: [payerId],
      splitAmounts: { [payerId]: amount },
    };
  }

  if (normalizedType === "on_behalf") {
    const beneficiaries = normalizedParticipants.filter((participantId) => participantId !== payerId);
    const recipients = beneficiaries.length > 0 ? beneficiaries : normalizedParticipants;
    const manualSplit = splitAmounts && Object.keys(splitAmounts).length > 0 ? splitAmounts : normalizeSplitAmounts(amount, recipients, null);
    return {
      splitByUserIds: recipients,
      splitAmounts: manualSplit,
    };
  }

  const recipients = normalizedParticipants.length > 0 ? normalizedParticipants : [payerId];
  const manualSplit = splitAmounts && Object.keys(splitAmounts).length > 0 ? splitAmounts : normalizeSplitAmounts(amount, recipients, null);
  return {
    splitByUserIds: recipients,
    splitAmounts: manualSplit,
  };
}

/**
 * Creates an expense document.
 * @param {{tripId: string, title: string, amount: number, paidByUserId: string, splitByUserIds?: string[], splitAmounts?: Record<string, number>, currency?: string, category?: string, note?: string, splitType?: string, expenseType?: string, createdByUserId?: string, receiptUrls?: string[]}} payload
 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
 */
export async function addExpense(payload) {
  const amount = Number(payload.amount);
  const splitType = payload.splitType ?? EXPENSE_SPLIT_TYPES.even;
  const expenseType = normalizeExpenseType(payload.expenseType);
  const splitByUserIds = payload.splitByUserIds ?? [];
  const normalizedSplits = buildExpenseSplitAmounts(expenseType, amount, payload.paidByUserId, splitByUserIds, payload.splitAmounts ?? null);
  const effectiveSplitByUserIds = normalizedSplits.splitByUserIds;
  const splitAmounts = normalizedSplits.splitAmounts;

  const splitTotal = Object.values(splitAmounts).reduce((sum, value) => sum + Number(value || 0), 0);
  if (splitType === EXPENSE_SPLIT_TYPES.manual && Math.abs(splitTotal - amount) > 0.01) {
    return {
      success: false,
      error: "Сумма ручных долей не совпадает с суммой траты.",
    };
  }

  const expenseData = {
    tripId: payload.tripId,
    title: payload.title.trim(),
    amount,
    paidByUserId: payload.paidByUserId,
    expenseType,
    splitByUserIds: effectiveSplitByUserIds,
    splitAmounts,
    currency: payload.currency ?? "USD",
    category: payload.category ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1],
    note: payload.note?.trim() ?? "",
    splitType,
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
      targetUserId: null,
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
  const amount = Number(data.amount);
  const expenseType = normalizeExpenseType(data.expenseType);
  const normalizedSplits = buildExpenseSplitAmounts(expenseType, amount, data.paidByUserId, data.splitByUserIds ?? [], data.splitAmounts ?? null);

  const result = await updateDocument(EXPENSES_COLLECTION, expenseId, {
    ...data,
    expenseType,
    splitByUserIds: normalizedSplits.splitByUserIds,
    splitAmounts: normalizedSplits.splitAmounts,
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
 * @param {{tripId?: string, title?: string, amount?: number, currency?: string, actorUserId?: string}} [context]
 * @returns {Promise<{success: boolean, data?: null, error?: string}>}
 */
export async function removeExpense(expenseId, context = {}) {
  const result = await deleteDocument(EXPENSES_COLLECTION, expenseId);
  if (result.success && context.tripId) {
    await logActivity(context.tripId, {
      type: "expense_deleted",
      message: `Удалена трата${context.title ? `: ${context.title}` : ""}`,
      actorUserId: context.actorUserId ?? null,
    });
  }

  return result;
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
