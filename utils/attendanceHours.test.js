import { attendanceDayHours, completedAttendanceAverage, formatAttendanceHours, formatAttendanceAverage } from "./attendanceHours";

test("decimal hours display as hours and minutes with correct rollover", () => {
  expect(formatAttendanceHours(9.12)).toBe("9h 07m");
  expect(formatAttendanceHours(8.999)).toBe("9h 00m");
  expect(formatAttendanceHours(0)).toBe("0h 00m");
});

test("durations come from completed times and retain seconds at the average boundary", () => {
  const day = { status: "present", checkIn: "08:00:00", checkOut: "16:29:59", hoursWorked: 99 };
  expect(attendanceDayHours(day)).toBe((8 * 3600 + 29 * 60 + 59) / 3600);
  expect(completedAttendanceAverage([day]).average).toBeLessThan(8.5);
  expect(formatAttendanceAverage(completedAttendanceAverage([day]).average)).toBe("8h 29m 59s");
  expect(formatAttendanceAverage(8.5)).toBe("8h 30m 00s");
  expect(attendanceDayHours({ ...day, checkOut: null })).toBe(0);
  expect(attendanceDayHours({ ...day, checkOut: "07:59" })).toBe(0);
  expect(attendanceDayHours({ ...day, checkIn: "25:00" })).toBe(0);
});

test("incomplete attendance does not reduce the completed-day average", () => {
  expect(completedAttendanceAverage([
    { status: "present", checkIn: "09:00", checkOut: "18:00", hoursWorked: 9 },
    { status: "present", checkIn: "09:00", checkOut: "19:00", hoursWorked: 10 },
    { status: "present", checkIn: "09:00", hoursWorked: 0 },
    { status: "paid_leave", hoursWorked: 0 },
  ])).toEqual({ days: 2, hours: 19, average: 9.5 });
  expect(completedAttendanceAverage()).toEqual({ days: 0, hours: 0, average: null });
});
