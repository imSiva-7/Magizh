/**
 * Check MongoDB connection pool statistics
 * Run with: node scripts/check-db-connections.js
 */

import getDatabase from '../src/database/connectToMongoDB.js';

async function checkConnections() {
  try {
    console.log('🔍 Checking MongoDB connection stats...\n');
    
    const db = await getDatabase();
    
    // Get server status
    const serverStatus = await db.admin().serverStatus();
    
    console.log('📊 Connection Statistics:');
    console.log('  Current Connections:', serverStatus.connections.current);
    console.log('  Available Connections:', serverStatus.connections.available);
    console.log('  Total Created:', serverStatus.connections.totalCreated);
    console.log('  Active Connections:', serverStatus.connections.active || 'N/A');
    
    // Get database stats
    const dbStats = await db.stats();
    console.log('\n📊 Database Statistics:');
    console.log('  Database:', dbStats.db);
    console.log('  Collections:', dbStats.collections);
    console.log('  Data Size:', (dbStats.dataSize / 1024 / 1024).toFixed(2), 'MB');
    console.log('  Storage Size:', (dbStats.storageSize / 1024 / 1024).toFixed(2), 'MB');
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📚 Collections:');
    collections.forEach(col => {
      console.log('  -', col.name);
    });
    
    // Check if connection pool is healthy
    const totalConnections = serverStatus.connections.current;
    const maxPoolSize = 10; // From our config
    
    console.log('\n✅ Connection Pool Health:');
    if (totalConnections < maxPoolSize * 0.8) {
      console.log('  Status: HEALTHY');
      console.log(`  Using ${totalConnections}/${maxPoolSize} connections`);
    } else if (totalConnections < maxPoolSize) {
      console.log('  Status: WARNING - High connection usage');
      console.log(`  Using ${totalConnections}/${maxPoolSize} connections`);
    } else {
      console.log('  Status: CRITICAL - Connection pool saturated');
      console.log(`  Using ${totalConnections}/${maxPoolSize} connections`);
    }
    
    console.log('\n✅ Check completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error checking connections:', error.message);
    process.exit(1);
  }
}

checkConnections();
