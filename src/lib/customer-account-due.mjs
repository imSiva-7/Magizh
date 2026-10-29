// Account balances are all-time values, independent of the activity date filter.
export function customerAccountDue(account) {
  const cents = value => Math.round((Number(value) || 0) * 100);
  return Math.max(0, cents(account?.totalAmount) - cents(account?.paidAmount)) / 100;
}

export function totalCustomerDue(customers) {
  return customers.reduce((sum, customer) => sum + Math.round((customer.currentDue || 0) * 100), 0) / 100;
}

export function summarizeCustomerAccounts(accounts, customers = []) {
  const names = new Map(customers.map(customer => [String(customer._id), customer.customerName]));
  const rows = accounts.filter(account => account._id != null && String(account._id) !== "global").map(account => ({
    id: String(account._id),
    name: names.get(String(account._id)) || account.customerName || "Customer",
    paidAmount: Math.round((Number(account.paidAmount) || 0) * 100) / 100,
    currentDue: customerAccountDue(account),
  }));
  return {
    paidAmount: rows.reduce((sum, row) => sum + Math.round(row.paidAmount * 100), 0) / 100,
    dueAmount: totalCustomerDue(rows),
    customers: rows.filter(row => row.currentDue > 0).sort((a, b) => b.currentDue - a.currentDue),
  };
}
