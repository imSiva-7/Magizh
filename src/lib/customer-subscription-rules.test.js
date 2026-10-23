import { nextDate, scheduledOn, subscriptionFields, subscriptionOrder } from "./customer-subscription-rules";

const input = () => ({ startDate: "2026-10-23", endDate: "2026-11-01", weekdays: [1, 2, 3, 4, 5], items: [{ product: "Milk", quantity: 2, ratePerUnit: 50 }], gstType: "inclusive", affectStockValue: false });
test("schedule includes selected weekdays and boundaries but excludes skipped dates", () => {
  const subscription = { ...input(), skipDates: ["2026-10-26"] };
  expect(scheduledOn(subscription, "2026-10-23")).toBe(true);
  for (const date of ["2026-10-22", "2026-10-24", "2026-10-26", "2026-11-02"]) expect(scheduledOn(subscription, date)).toBe(false);
});
test.each([["2026-12-31", "2027-01-01"], ["2028-02-28", "2028-02-29"], ["2026-02-28", "2026-03-01"]])("date cursor crosses %s correctly", (date, next) => expect(nextDate(date)).toBe(next));
test.each([
  { startDate: "2026-02-30" }, { startDate: "2026-10-22" }, { endDate: "2026-10-22" },
  { weekdays: [] }, { weekdays: [7] }, { weekdays: ["1"] }, { gstType: "invalid" }, { affectStockValue: "false" },
  { items: [] }, { items: [{ product: "Milk", quantity: -1, ratePerUnit: 50 }] },
  { items: [{ product: "Unknown", quantity: 1, ratePerUnit: 50 }] },
  { items: [{ product: "Milk", quantity: 1, ratePerUnit: "NaN" }] },
])("rejects invalid subscription %j", invalid => expect(() => subscriptionFields({ ...input(), ...invalid }, "2026-10-23")).toThrow());
test("subscription snapshots rates and derives totals including exclusive GST", () => {
  const subscription = subscriptionFields({ ...input(), gstType: "exclusive" }, "2026-10-23");
  const order = subscriptionOrder(subscription, { _id: "customer", customerName: "Test", milkPrice: 999 }, "2026-10-23");
  expect(order).toMatchObject({ totalAmount: 105, paymentStatus: "Not Paid", affectStockValue: false, items: [{ quantity: 2, ratePerUnit: 50, totalAmount: 105 }] });
});
