/**
 * Calculates participant balances and settlement transactions.
 * @param {Array<{id?: string, userId?: string, name?: string}>} participants
 * @param {Array<{amount?: number, paidByUserId?: string, splitByUserIds?: string[], participantIds?: string[]}>} expenses
 * @returns {{balances: Array<{userId: string, balance: number}>, transactions: Array<{fromUserId: string, toUserId: string, amount: number}>}}
 */
export function calculateBalances(participants = [], expenses = []) {
  const participantIds = participants
    .map((participant) => participant.userId ?? participant.id)
    .filter(Boolean);

  const balanceMap = new Map(participantIds.map((userId) => [userId, 0]));

  for (const expense of expenses) {
    const amount = Number(expense.amount) || 0;
    if (amount <= 0) {
      continue;
    }

    const payerId = expense.paidByUserId ?? expense.paidBy ?? expense.createdBy ?? null;
    const splitIds = (expense.splitByUserIds ?? expense.participantIds ?? participantIds).filter(Boolean);

    if (payerId) {
      balanceMap.set(payerId, (balanceMap.get(payerId) ?? 0) + amount);
    }

    if (splitIds.length === 0) {
      continue;
    }

    const share = amount / splitIds.length;

    for (const userId of splitIds) {
      balanceMap.set(userId, (balanceMap.get(userId) ?? 0) - share);
    }
  }

  const creditors = [];
  const debtors = [];

  for (const [userId, balance] of balanceMap.entries()) {
    if (balance > 0) {
      creditors.push({ userId, balance });
    } else if (balance < 0) {
      debtors.push({ userId, balance: Math.abs(balance) });
    }
  }

  creditors.sort((first, second) => second.balance - first.balance);
  debtors.sort((first, second) => second.balance - first.balance);

  const transactions = [];
  let creditorIndex = 0;

  for (const debtor of debtors) {
    let remainingDebt = debtor.balance;

    while (remainingDebt > 0 && creditorIndex < creditors.length) {
      const creditor = creditors[creditorIndex];
      const transferAmount = Math.min(remainingDebt, creditor.balance);

      transactions.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: Number(transferAmount.toFixed(2)),
      });

      remainingDebt -= transferAmount;
      creditor.balance -= transferAmount;

      if (creditor.balance <= 0.00001) {
        creditorIndex += 1;
      }
    }
  }

  return {
    balances: Array.from(balanceMap.entries()).map(([userId, balance]) => ({
      userId,
      balance: Number(balance.toFixed(2)),
    })),
    transactions,
  };
}