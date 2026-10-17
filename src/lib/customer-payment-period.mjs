const toCents = (value) => Math.round((Number(value) || 0) * 100);
const money = (field) => ({
  $convert: { input: field, to: "decimal", onError: 0, onNull: 0 },
});
const publicMoney = (field) => ({
  $convert: { input: { $round: [field, 2] }, to: "double" },
});

export function paymentPeriodRange(startDate, endDate) {
  const valid = (date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (
    (startDate && !valid(startDate)) ||
    (endDate && !valid(endDate)) ||
    (startDate && endDate && startDate > endDate)
  )
    throw Object.assign(new Error("Invalid date range"), { status: 400 });
  return {
    orderMatch:
      startDate || endDate
        ? {
            date: {
              ...(startDate ? { $gte: startDate } : {}),
              ...(endDate ? { $lte: endDate } : {}),
            },
          }
        : {},
    receiptMatch:
      startDate || endDate
        ? {
            __paymentDate: {
              ...(startDate
                ? { $gte: new Date(`${startDate}T00:00:00+05:30`) }
                : {}),
              ...(endDate
                ? {
                    $lt: new Date(
                      Date.parse(`${endDate}T00:00:00+05:30`) + 86400000,
                    ),
                  }
                : {}),
            },
          }
        : {},
  };
}
export function paymentPeriodPipelines(startDate, endDate) {
  const { orderMatch, receiptMatch } = paymentPeriodRange(startDate, endDate);
  return {
    orders: [
      { $match: orderMatch },
      {
        $group: {
          _id: { customer: { $toString: "$customerId" }, date: "$date" },
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: money("$totalAmount") },
        },
      },
      {
        $group: {
          _id: "$_id.customer",
          totalOrders: { $sum: "$totalOrders" },
          totalAmount: { $sum: "$totalAmount" },
          daily: {
            $push: {
              date: "$_id.date",
              totalOrders: "$totalOrders",
              totalAmount: publicMoney("$totalAmount"),
            },
          },
        },
      },
      {
        $project: {
          totalOrders: 1,
          totalAmount: publicMoney("$totalAmount"),
          daily: 1,
        },
      },
    ],
    receipts: [
      { $unwind: "$payments" },
      {
        $set: {
          __paymentDate: {
            $convert: {
              input: "$payments.date",
              to: "date",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      { $match: receiptMatch },
      {
        $group: {
          _id: {
            customer: { $toString: "$_id" },
            date: {
              $dateToString: {
                date: "$__paymentDate",
                format: "%Y-%m-%d",
                timezone: "Asia/Kolkata",
                onNull: null,
              },
            },
          },
          receiptCount: { $sum: 1 },
          receivedAmount: { $sum: money("$payments.amount") },
        },
      },
      {
        $group: {
          _id: "$_id.customer",
          receiptCount: { $sum: "$receiptCount" },
          receivedAmount: { $sum: "$receivedAmount" },
          daily: {
            $push: {
              date: "$_id.date",
              receivedAmount: publicMoney("$receivedAmount"),
              receiptCount: "$receiptCount",
            },
          },
        },
      },
      {
        $project: {
          receiptCount: 1,
          receivedAmount: publicMoney("$receivedAmount"),
          daily: 1,
        },
      },
    ],
  };
}
export function combinePaymentPeriod(orders, receipts) {
  const customers = new Map();
  const get = (id) => {
    if (!customers.has(String(id)))
      customers.set(String(id), {
        customerId: String(id),
        totalOrders: 0,
        totalAmount: 0,
        receiptCount: 0,
        receivedAmount: 0,
        netChange: 0,
        salesDaily: [],
        receiptsDaily: [],
      });
    return customers.get(String(id));
  };
  for (const row of orders)
    if (row._id != null && String(row._id) !== "global") {
      const customer = get(row._id);
      customer.totalOrders += Number(row.totalOrders) || 0;
      customer.salesDaily.push(...(row.daily || []));
      customer.totalAmount =
        (toCents(customer.totalAmount) + toCents(row.totalAmount)) / 100;
    }
  for (const row of receipts)
    if (row._id != null && String(row._id) !== "global") {
      const customer = get(row._id);
      customer.receiptCount += Number(row.receiptCount) || 0;
      customer.receiptsDaily.push(...(row.daily || []));
      customer.receivedAmount =
        (toCents(customer.receivedAmount) + toCents(row.receivedAmount)) / 100;
    }
  for (const customer of customers.values())
    customer.netChange =
      (toCents(customer.totalAmount) - toCents(customer.receivedAmount)) / 100;
  return {
    customers: [...customers.values()],
    overall: sumPaymentPeriod([...customers.values()]),
  };
}

export function paymentCardTrends(customers) {
  const days = new Map();
  const get = (date) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
    if (!days.has(date))
      days.set(date, { date, totalOrders: 0, sales: 0, receipts: 0 });
    return days.get(date);
  };
  for (const customer of customers) {
    for (const source of customer.salesDaily || []) {
      const day = get(source.date);
      if (day) {
        day.totalOrders += source.totalOrders || 0;
        day.sales += toCents(source.totalAmount);
      }
    }
    for (const source of customer.receiptsDaily || []) {
      const day = get(source.date);
      if (day) day.receipts += toCents(source.receivedAmount);
    }
  }
  const rows = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return Object.fromEntries(
    ["totalOrders", "totalAmount", "receivedAmount", "netChange"].map(
      (field) => [
        field,
        rows.map((day) => ({
          date: day.date,
          value:
            field === "totalOrders"
              ? day.totalOrders
              : field === "totalAmount"
                ? day.sales / 100
                : field === "receivedAmount"
                  ? day.receipts / 100
                  : (day.sales - day.receipts) / 100,
        })),
      ],
    ),
  );
}
export function sumPaymentPeriod(customers) {
  const totals = customers.reduce(
    (sum, row) => ({
      totalOrders: sum.totalOrders + (row.totalOrders || 0),
      receiptCount: sum.receiptCount + (row.receiptCount || 0),
      sales: sum.sales + toCents(row.totalAmount),
      receipts: sum.receipts + toCents(row.receivedAmount),
    }),
    { totalOrders: 0, receiptCount: 0, sales: 0, receipts: 0 },
  );
  return {
    totalOrders: totals.totalOrders,
    receiptCount: totals.receiptCount,
    totalAmount: totals.sales / 100,
    receivedAmount: totals.receipts / 100,
    netChange: (totals.sales - totals.receipts) / 100,
  };
}
export function matchesPeriodActivity(stats, filter) {
  if (!stats || (!stats.totalOrders && !stats.receiptCount)) return false;
  return (
    !filter ||
    (filter === "receipts" && stats.receiptCount > 0) ||
    (filter === "sales-only" && stats.totalOrders > 0 && !stats.receiptCount) ||
    (filter === "decrease" && stats.netChange < 0) ||
    (filter === "increase" && stats.netChange > 0)
  );
}
