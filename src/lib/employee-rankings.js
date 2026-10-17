import { getTodayDate } from "./india-date.mjs";

export function rankEmployeeHours(totals) {
  const sorted = totals.filter(row => row.empID && Number.isSafeInteger(row.hundredths) && row.hundredths > 0)
    .sort((a, b) => b.hundredths - a.hundredths || String(a.empID).localeCompare(String(b.empID)));
  const ties = new Map();
  for (const row of sorted) ties.set(row.hundredths, (ties.get(row.hundredths) || 0) + 1);
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row.hundredths !== sorted[index - 1].hundredths) rank = index + 1;
    return { empID: String(row.empID), name: row.name || String(row.empID), totalHours: row.hundredths / 100, completedDays: row.completedDays, rank, tied: ties.get(row.hundredths) > 1 };
  });
}

export async function getEmployeeRankings(db, month, today = getTodayDate()) {
  const totals = await db.collection("employee").aggregate([
    { $match: { [`attendance.${month}.days`]: { $exists: true }, empID: { $nin: [null, ""] } } },
    { $project: { empID: 1, name: 1, days: { $objectToArray: { $ifNull: [`$attendance.${month}.days`, {}] } } } },
    { $unwind: "$days" },
    { $project: { empID: 1, name: 1, date: "$days.v.date", checkIn: "$days.v.checkIn", checkOut: "$days.v.checkOut", hours: { $convert: { input: "$days.v.hoursWorked", to: "double", onError: 0, onNull: 0 } } } },
    { $match: { date: { $regex: `^${month}-`, $lte: today }, checkIn: { $exists: true, $nin: [null, ""] }, checkOut: { $exists: true, $nin: [null, ""] }, hours: { $gt: 0, $lte: 24 } } },
    { $group: { _id: "$empID", name: { $first: "$name" }, hundredths: { $sum: { $round: [{ $multiply: ["$hours", 100] }, 0] } }, completedDays: { $sum: 1 } } },
    { $project: { _id: 0, empID: "$_id", name: 1, hundredths: 1, completedDays: 1 } },
  ]).toArray();
  return rankEmployeeHours(totals);
}
