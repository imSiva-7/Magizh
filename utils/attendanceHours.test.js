import { completedAttendanceAverage, formatAttendanceHours } from "./attendanceHours";

test("decimal hours display as hours and minutes with correct rollover", () => {
  expect(formatAttendanceHours(9.12)).toBe("9h 07m");
  expect(formatAttendanceHours(8.999)).toBe("9h 00m");
  expect(formatAttendanceHours(0)).toBe("0h 00m");
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
