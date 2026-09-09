/**
 * Migration Script: Move attendance data from separate collection to nested structure
 * 
 * This script:
 * 1. Reads all records from 'attendance' collection
 * 2. Groups them by employeeId and month
 * 3. Updates employee documents with nested attendance data
 * 4. Optionally deletes old attendance collection
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'production';

async function migrateAttendanceData() {
  console.log('🚀 Starting attendance data migration...\n');

  let client;
  
  try {
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db(DATABASE_NAME);
    const attendanceCollection = db.collection('attendance');
    const employeeCollection = db.collection('employee');

    // Get all attendance records
    const allAttendance = await attendanceCollection.find({}).toArray();
    console.log(`📋 Found ${allAttendance.length} attendance record(s) to migrate\n`);

    if (allAttendance.length === 0) {
      console.log('✅ No attendance records to migrate!');
      return;
    }

    // Group by employeeId
    const employeeGroups = {};
    
    allAttendance.forEach(record => {
      const empID = record.employeeId;
      if (!employeeGroups[empID]) {
        employeeGroups[empID] = [];
      }
      employeeGroups[empID].push(record);
    });

    console.log(`👥 Found ${Object.keys(employeeGroups).length} unique employee(s)\n`);

    // Process each employee
    let migratedCount = 0;
    let errorCount = 0;

    for (const [empID, records] of Object.entries(employeeGroups)) {
      console.log(`\n🔄 Processing Employee: ${empID} (${records.length} record(s))`);

      // Check if employee exists
      const employee = await employeeCollection.findOne({ empID });
      
      if (!employee) {
        console.log(`   ⚠️  Employee ${empID} not found in employee collection, skipping...`);
        errorCount++;
        continue;
      }

      // Initialize attendance structure if needed
      if (!employee.attendance) {
        employee.attendance = {};
      }

      // Group records by month and day
      records.forEach(record => {
        const monthKey = record.date.substring(0, 7); // "2026-09"
        const dayKey = record.date.substring(8, 10); // "08"

        // Initialize month if doesn't exist
        if (!employee.attendance[monthKey]) {
          employee.attendance[monthKey] = {
            days: {},
            totalHours: 0,
            regularHours: 0,
            overtimeHours: 0,
            daysWorked: 0
          };
        }

        // Initialize day if doesn't exist
        if (!employee.attendance[monthKey].days[dayKey]) {
          employee.attendance[monthKey].days[dayKey] = {
            date: record.date,
            punches: [],
            checkIn: null,
            checkOut: null,
            hoursWorked: 0,
            regularHours: 0,
            overtimeHours: 0
          };
        }

        // Extract time from record (could be in 'time' field or timestamp)
        let timeValue = record.time;
        if (!timeValue && record.timestamp) {
          // Extract time from timestamp if 'time' field is missing
          const ts = new Date(record.timestamp);
          timeValue = ts.toISOString().substring(11, 19); // HH:MM:SS
        }

        // Add punch to the day
        employee.attendance[monthKey].days[dayKey].punches.push({
          time: timeValue,
          timestamp: record.timestamp,
          method: record.method || 'unknown',
          deviceId: record.deviceId || 'unknown'
        });
      });

      // Calculate check-in/out and hours for each day
      Object.keys(employee.attendance).forEach(monthKey => {
        const month = employee.attendance[monthKey];
        
        Object.keys(month.days).forEach(dayKey => {
          const day = month.days[dayKey];
          
          // Sort punches by time (handle missing time values)
          day.punches.sort((a, b) => {
            const timeA = a.time || '';
            const timeB = b.time || '';
            return timeA.localeCompare(timeB);
          });
          
          // First punch = check-in, Last punch = check-out
          day.checkIn = day.punches[0].time;
          
          if (day.punches.length > 1) {
            day.checkOut = day.punches[day.punches.length - 1].time;
            
            // Calculate hours worked
            const checkInTime = new Date(`${day.date}T${day.checkIn}`);
            const checkOutTime = new Date(`${day.date}T${day.checkOut}`);
            const diffMs = checkOutTime - checkInTime;
            const hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60));
            
            day.hoursWorked = parseFloat(hoursWorked.toFixed(2));
            day.regularHours = parseFloat(Math.min(hoursWorked, 10).toFixed(2));
            day.overtimeHours = parseFloat(Math.max(0, hoursWorked - 10).toFixed(2));
          }
        });
        
        // Calculate month totals
        const days = Object.values(month.days);
        month.totalHours = parseFloat(days.reduce((sum, d) => sum + d.hoursWorked, 0).toFixed(2));
        month.regularHours = parseFloat(days.reduce((sum, d) => sum + d.regularHours, 0).toFixed(2));
        month.overtimeHours = parseFloat(days.reduce((sum, d) => sum + d.overtimeHours, 0).toFixed(2));
        month.daysWorked = days.length;
      });

      // Update employee document
      const result = await employeeCollection.updateOne(
        { empID },
        { 
          $set: { 
            attendance: employee.attendance,
            updatedAt: new Date()
          } 
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`   ✅ Migrated ${records.length} record(s) for ${employee.name}`);
        
        // Show months migrated
        const months = Object.keys(employee.attendance);
        console.log(`   📅 Months: ${months.join(', ')}`);
        
        migratedCount++;
      } else {
        console.log(`   ⚠️  No changes for ${empID}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Migration Summary:`);
    console.log(`   - Total Records: ${allAttendance.length}`);
    console.log(`   - Employees Migrated: ${migratedCount}`);
    console.log(`   - Errors/Skipped: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    // Ask if want to delete old collection
    console.log('⚠️  NOTE: Old attendance collection still exists.');
    console.log('   To delete it, run: db.attendance.drop()');
    console.log('   Or uncomment the line below in this script.\n');
    
    // Uncomment to delete old collection after successful migration
    // await attendanceCollection.drop();
    // console.log('🗑️  Deleted old attendance collection\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Disconnected from MongoDB\n');
    }
  }
}

// Run migration
migrateAttendanceData()
  .then(() => {
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });
