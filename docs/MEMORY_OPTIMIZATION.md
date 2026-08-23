# Memory Optimization Guide

## Problem
Memory running out after `npm run dev` runs for ~3 hours in development mode.

## Root Causes

### 1. **Next.js Hot Module Reload (HMR)**
In development, Next.js uses HMR which can cause memory leaks over time:
- Each file change creates new module instances
- Old modules may not be garbage collected properly
- Event listeners and timers can accumulate

### 2. **MongoDB Connection Pooling**
- Multiple connections being created without proper cleanup
- Connections not being reused across hot reloads

## Solutions Implemented

### ✅ 1. Optimized MongoDB Connection (`src/lib/mongodb.js`)

**Changes:**
- Added `minPoolSize: 2` - Maintains minimum connections
- Added `maxIdleTimeMS: 60000` - Closes idle connections after 60 seconds
- Disabled `monitorCommands` in development to reduce overhead
- Added graceful shutdown handlers
- Better connection reuse with global variable in development

**How it works:**
```javascript
// In development, connection is stored globally
if (!global._mongoClientPromise) {
  // Create new connection
} else {
  // Reuse existing connection
}
```

### ✅ 2. Next.js Configuration (`next.config.mjs`)

**Added optimizations:**
- `workerThreads: false` - Reduces memory overhead
- `cpus: 1` - Limits CPU usage
- Disabled code splitting in development
- Deterministic module IDs

### ✅ 3. Centralized Database Access

All routes now use `getDatabase()` from `@/database/connectToMongoDB` which:
- Reuses the same connection pool
- Provides consistent error handling
- Returns database reference without creating new connections

## Monitoring Memory Usage

### Option 1: Built-in Node.js Inspector
```bash
# Start with memory profiling
node --inspect node_modules/.bin/next dev
```
Then open `chrome://inspect` in Chrome to see memory usage.

### Option 2: Custom Monitor Script
```bash
# In a separate terminal while dev server is running
node scripts/monitor-memory.js
```

### Option 3: Simple Command
```bash
# Check memory usage of running process
# Windows PowerShell:
Get-Process -Name node | Select-Object ProcessName, WS, PM
```

## Best Practices for Development

### 1. **Restart Dev Server Regularly**
```bash
# Instead of running for 3+ hours, restart every 1-2 hours
npm run dev
```

### 2. **Use Production Build for Long Testing**
```bash
npm run build
npm start
```
Production mode doesn't have HMR overhead.

### 3. **Limit Open Files**
Close unnecessary files in your editor - each open file watched by Next.js uses memory.

### 4. **Clear Node Cache Periodically**
```bash
# If memory issues persist
Remove-Item -Recurse -Force .next
npm run dev
```

### 5. **Increase Node.js Memory Limit** (Temporary workaround)
```bash
# In package.json, update dev script:
"dev": "node --max-old-space-size=4096 node_modules/next/dist/bin/next dev"
```
This gives Node.js 4GB instead of default ~2GB.

## Checking for Memory Leaks

### Signs of Memory Leaks:
- ✅ Process memory grows continuously
- ✅ Slower response times over time
- ✅ System becomes unresponsive
- ✅ "JavaScript heap out of memory" errors

### Where to Look:
1. **Event Listeners** - Ensure they're cleaned up
2. **Timers** - Clear `setInterval`/`setTimeout`
3. **Database Cursors** - Ensure cursors are closed
4. **Global Variables** - Avoid accumulating data in global scope
5. **Cache** - Clear caches periodically

## Additional MongoDB Optimizations

### 1. Monitor Active Connections
Add this to your code temporarily to check connection counts:
```javascript
// In any API route
const db = await getDatabase();
const status = await db.admin().serverStatus();
console.log('Active connections:', status.connections.current);
console.log('Available connections:', status.connections.available);
```

### 2. Ensure Cursors Are Closed
```javascript
// Good practice
const cursor = collection.find(query);
const results = await cursor.toArray();
await cursor.close(); // Explicitly close

// Better practice - toArray() auto-closes
const results = await collection.find(query).toArray();
```

### 3. Use Lean Queries
```javascript
// Return plain JavaScript objects instead of Mongoose documents
const results = await collection.find(query).lean();
```

## Environment Variables

Add to `.env.local` for debugging:
```env
# Enable MongoDB debugging
MONGO_DEBUG=true

# Increase Node.js memory (use in package.json script)
NODE_OPTIONS=--max-old-space-size=4096
```

## When to Restart Dev Server

Restart if you notice:
- Memory usage > 1.5GB
- Dev server becomes sluggish
- Hot reload takes >5 seconds
- After major code changes
- Every 2-3 hours of continuous development

## Production Considerations

The changes made are safe for production and actually improve performance:
- Connection pooling is more efficient
- Connections are cleaned up properly
- Memory usage is more stable

## Testing the Fix

1. Start dev server: `npm run dev`
2. Monitor memory: Open Task Manager (Windows) or Activity Monitor (Mac)
3. Use the app normally for 1-2 hours
4. Memory should stabilize and not continuously grow
5. Check that "♻️ Reusing existing MongoDB connection" appears in console on hot reloads

## If Issues Persist

If memory issues continue:

1. **Check other dependencies** - Some npm packages have memory leaks
2. **Profile with Chrome DevTools** - Use `chrome://inspect`
3. **Upgrade Node.js** - Ensure you're on latest LTS version
4. **Check for circular references** - These prevent garbage collection
5. **Review recent code changes** - Look for accumulating data structures

## Summary

✅ MongoDB connections now properly pooled and reused  
✅ Idle connections close after 60 seconds  
✅ Next.js configured for lower memory usage  
✅ All routes use centralized `getDatabase()` function  
✅ Graceful shutdown handlers added  
✅ Monitoring tools provided  

The memory leak should be significantly reduced or eliminated. Monitor for 3+ hours to confirm.
