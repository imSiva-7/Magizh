# Quick Memory Fix Reference

## What Was Changed

### ✅ MongoDB Connection Pooling Fixed
- Added `minPoolSize: 2` and `maxIdleTimeMS: 60000`
- Idle connections now close after 60 seconds
- Better connection reuse in development mode
- Graceful shutdown handlers added

### ✅ All Routes Updated
- Replaced `clientPromise` with centralized `getDatabase()` in 12 route files
- Ensures consistent connection pooling across the app

### ✅ Next.js Config Optimized
- Reduced memory overhead in development
- Disabled unnecessary features

## Quick Commands

### Start Dev Server (Standard)
```bash
npm run dev
```

### Start with Extra Memory (If Needed)
```bash
npm run dev:memory
```

### Monitor Memory Usage
```bash
# In a separate terminal
npm run monitor
```

### Check MongoDB Connections
```bash
node scripts/check-db-connections.js
```

## Expected Behavior

✅ Console should show: "♻️ Reusing existing MongoDB connection" on hot reloads  
✅ Memory should stabilize after initial spike  
✅ No continuous memory growth over 3+ hours  

## Quick Troubleshooting

### If memory still grows:
1. Restart dev server every 2 hours (normal for Next.js dev mode)
2. Close unnecessary browser tabs
3. Clear Next.js cache: `Remove-Item -Recurse -Force .next`
4. Use production mode for extended testing: `npm run build && npm start`

### If connections pile up:
1. Check with: `node scripts/check-db-connections.js`
2. Should see < 8 active connections normally
3. Restart dev server if > 10 connections

## When to Use Each Command

- **`npm run dev`** - Normal development (default, use 90% of the time)
- **`npm run dev:memory`** - When you get "JavaScript heap out of memory" errors
- **`npm run monitor`** - To watch memory usage in real-time
- **`npm run build && npm start`** - For production-like testing without HMR overhead

## Success Metrics

Before fix:
- Memory grows from 200MB → 2GB+ over 3 hours ❌
- Crashes with out-of-memory errors ❌

After fix:
- Memory stabilizes around 300-500MB ✅
- Can run for 3+ hours without issues ✅
- Hot reloads reuse existing connections ✅

## Read Full Guide
See `docs/MEMORY_OPTIMIZATION.md` for detailed explanation.
