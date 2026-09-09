import { NextResponse } from "next/server";
import getDatabase from "@/database/connectToMongoDB";

/**
 * Migration API: Add attendance and advances fields to existing employees
 * 
 * Call this ONCE to migrate existing employees:
 * POST http://localhost:3000/api/migrate/employee-attendance
 */
export async function POST(request) {
  try {
    const db = await getDatabase();
    
    console.log('🚀 Starting employee migration...');

    // Find all employees without attendance/advances fields
    const employeesWithoutFields = await db.collection('employee').find({
      $or: [
        { attendance: { $exists: false } },
        { advances: { $exists: false } }
      ]
    }).toArray();

    console.log(`📋 Found ${employeesWithoutFields.length} employee(s) to migrate`);

    if (employeesWithoutFields.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All employees already have attendance and advances fields!",
        migrated: 0,
        employees: []
      });
    }

    // Update all employees
    const result = await db.collection('employee').updateMany(
      {
        $or: [
          { attendance: { $exists: false } },
          { advances: { $exists: false } }
        ]
      },
      {
        $set: {
          attendance: {},
          advances: {},
          updatedAt: new Date()
        }
      }
    );

    console.log(`✅ Migration completed! Modified: ${result.modifiedCount} employee(s)`);

    // Verify migration
    const verifiedEmployees = await db.collection('employee').find({
      empID: { $in: employeesWithoutFields.map(e => e.empID) }
    }).toArray();

    const migrationDetails = verifiedEmployees.map(emp => ({
      empID: emp.empID,
      name: emp.name,
      hasAttendance: emp.attendance !== undefined,
      hasAdvances: emp.advances !== undefined
    }));

    return NextResponse.json({
      success: true,
      message: `Successfully migrated ${result.modifiedCount} employee(s)`,
      migrated: result.modifiedCount,
      employees: migrationDetails
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: "Migration failed",
        details: error.message
      },
      { status: 500 }
    );
  }
}

// GET to check migration status
export async function GET(request) {
  try {
    const db = await getDatabase();

    const totalEmployees = await db.collection('employee').countDocuments();
    
    const employeesWithFields = await db.collection('employee').countDocuments({
      attendance: { $exists: true },
      advances: { $exists: true }
    });

    const employeesNeedingMigration = await db.collection('employee').countDocuments({
      $or: [
        { attendance: { $exists: false } },
        { advances: { $exists: false } }
      ]
    });

    const needMigration = employeesNeedingMigration > 0;

    return NextResponse.json({
      totalEmployees,
      employeesWithFields,
      employeesNeedingMigration,
      needMigration,
      message: needMigration 
        ? `${employeesNeedingMigration} employee(s) need migration` 
        : "All employees are up to date!"
    });

  } catch (error) {
    console.error('❌ Migration check failed:', error);
    return NextResponse.json(
      {
        error: "Failed to check migration status",
        details: error.message
      },
      { status: 500 }
    );
  }
}
