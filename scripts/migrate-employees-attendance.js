/**
 * Migration Script: Add attendance and advances objects to existing employees
 * 
 * This script updates all existing employee documents to include:
 * - attendance: {} (empty object for nested monthly attendance data)
 * - advances: {} (empty object for nested monthly advances)
 */

const { MongoClient } = require('mongodb');

// MongoDB connection string - update if needed
const MONGODB_URI = process.env.MONGODB_URI || 'your-mongodb-connection-string';
const DATABASE_NAME = 'your-database-name'; // Update this

async function migrateEmployees() {
  console.log('🚀 Starting employee migration...\n');

  let client;
  
  try {
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db(DATABASE_NAME);
    const employeeCollection = db.collection('employee');

    // Find all employees without attendance/advances fields
    const employeesWithoutFields = await employeeCollection.find({
      $or: [
        { attendance: { $exists: false } },
        { advances: { $exists: false } }
      ]
    }).toArray();

    console.log(`📋 Found ${employeesWithoutFields.length} employee(s) to migrate:\n`);

    if (employeesWithoutFields.length === 0) {
      console.log('✅ All employees already have attendance and advances fields!');
      return;
    }

    // Display employees that will be migrated
    employeesWithoutFields.forEach((emp, index) => {
      console.log(`${index + 1}. ${emp.name} (${emp.empID})`);
    });

    console.log('\n🔄 Starting migration...\n');

    // Update all employees
    const result = await employeeCollection.updateMany(
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

    console.log(`✅ Migration completed!`);
    console.log(`   - Matched: ${result.matchedCount} employee(s)`);
    console.log(`   - Modified: ${result.modifiedCount} employee(s)\n`);

    // Verify migration
    console.log('🔍 Verifying migration...\n');
    
    const verifiedEmployees = await employeeCollection.find({
      empID: { $in: employeesWithoutFields.map(e => e.empID) }
    }).toArray();

    verifiedEmployees.forEach((emp, index) => {
      const hasAttendance = emp.attendance !== undefined;
      const hasAdvances = emp.advances !== undefined;
      const status = hasAttendance && hasAdvances ? '✅' : '❌';
      
      console.log(`${status} ${emp.name} (${emp.empID})`);
      console.log(`   - attendance: ${hasAttendance ? '✅ Present' : '❌ Missing'}`);
      console.log(`   - advances: ${hasAdvances ? '✅ Present' : '❌ Missing'}`);
    });

    console.log('\n✅ Migration verification complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

// Run migration
migrateEmployees()
  .then(() => {
    console.log('\n🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });
