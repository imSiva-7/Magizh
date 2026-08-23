/**
 * Memory monitoring script for Node.js applications
 * Run with: node scripts/monitor-memory.js
 */

const formatBytes = (bytes) => {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
};

const logMemoryUsage = () => {
  const usage = process.memoryUsage();
  
  console.log('\n📊 Memory Usage:');
  console.log('  RSS (Resident Set Size):', formatBytes(usage.rss));
  console.log('  Heap Total:', formatBytes(usage.heapTotal));
  console.log('  Heap Used:', formatBytes(usage.heapUsed));
  console.log('  External:', formatBytes(usage.external));
  console.log('  Array Buffers:', formatBytes(usage.arrayBuffers));
  
  const heapPercentage = ((usage.heapUsed / usage.heapTotal) * 100).toFixed(2);
  console.log(`  Heap Usage: ${heapPercentage}%`);
  
  // Warning thresholds
  if (usage.heapUsed > 500 * 1024 * 1024) {
    console.warn('⚠️  HIGH MEMORY USAGE DETECTED (>500MB)');
  }
  
  if (heapPercentage > 90) {
    console.warn('⚠️  HEAP NEARLY FULL (>90%)');
  }
};

// Log memory every 30 seconds
const intervalMs = 30000;
console.log(`Starting memory monitoring (every ${intervalMs / 1000}s)...`);
console.log('Press Ctrl+C to stop\n');

logMemoryUsage();
setInterval(logMemoryUsage, intervalMs);

// Log on exit
process.on('SIGINT', () => {
  console.log('\n\nFinal memory stats:');
  logMemoryUsage();
  process.exit(0);
});
