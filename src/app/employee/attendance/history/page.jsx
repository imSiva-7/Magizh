"use client";

import { useState, useEffect, Suspense, useCallback, useMemo } from "react";
import { ToastContainer, toast } from "react-toastify";
import { useSession } from "next-auth/react";
import  {getTodayDate, month} from "@/utils/dateUtils.js"

export default function AttendanceHistory() {
  const [loading, setLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState(["hi", "bro"]);

  const fetchAttendanceRecords = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("yooo loo");
      if (!response.ok) throw new Error("Failed to Fetch Attendance Data");
      const data = await response.json();
      setAttendanceData(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error("Failed to Fetch Attendance Data");
      console.log("Error: " + error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAttendanceRecords();
  }, []);

  return (
    <div>
      <div>
        <h1>Employee Attendance</h1>
        {attendanceData.map((i, id) => {
          return <div key={id}>{i}</div>;
        })}
        {month()}
      </div>
    </div>
  );
}
