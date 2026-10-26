// Account balances are all-time values, independent of the activity date filter.
export function customerAccountDue(account) {
  const cents = value => Math.round((Number(value) || 0) * 100);
  return Math.max(0, cents(account?.totalAmount) - cents(account?.paidAmount)) / 100;
}

export function totalCustomerDue(customers) {
  return customers.reduce((sum, customer) => sum + Math.round((customer.currentDue || 0) * 100), 0) / 100;
}
