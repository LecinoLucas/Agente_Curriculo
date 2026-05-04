# Fix: Cannot Reuse Already Awaited Coroutine

**Date:** 2026-05-03  
**Status:** ✅ Fixed  
**Error:** `RuntimeError: cannot reuse already awaited coroutine`

## Problem

The `_run_async()` helper function in `analysis_tasks.py` was causing coroutines to be reused, leading to runtime errors.

### Root Cause

```python
# BEFORE (BROKEN)
def _run_async(coro):
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)  # First execution
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)  # REUSES SAME COROUTINE!
```

**Problem:** If the first `loop.run_until_complete(coro)` fails with a `RuntimeError`, the same coroutine `coro` is passed to `loop.run_until_complete()` again. Once a coroutine is awaited, it cannot be reused.

## Solution

Replace with `asyncio.run()` which handles event loop creation and cleanup automatically:

```python
# AFTER (FIXED)
def _run_async(coro):
    return asyncio.run(coro)
```

### Why asyncio.run() is Better

1. **Creates fresh event loop** - No reuse possible
2. **Executes coroutine exactly once** - Guaranteed single execution
3. **Automatic cleanup** - Loop is closed after execution
4. **Simpler code** - No manual event loop management
5. **Thread-safe** - Creates a new loop even if one exists

## Changes Made

### Files Modified

1. **`src/interface/workers/analysis_tasks.py`**
   - Line 59: Replaced `_run_async()` implementation with `asyncio.run(coro)`
   - Used in 3 places:
     - Line 85: `_run_async(_process_analysis_async(...))`
     - Line 100: `_run_async(_mark_analysis_failed(...))`
     - Line 108: `_run_async(_mark_analysis_retry_scheduled(...))`

### Verified Correct

- **`src/interface/workers/matching_tasks.py`** (Line 17)
  - Already uses `asyncio.run()` correctly ✅

- **`src/interface/workers/dev_analysis_processor.py`**
  - Uses `asyncio.get_running_loop()` and `create_task()` correctly ✅
  - No changes needed

## Tests Added

**File:** `tests/integration/test_run_async_no_coroutine_reuse.py`

5 tests ensuring:
1. ✅ `_run_async` uses `asyncio.run()` (not `loop.run_until_complete`)
2. ✅ Executes simple coroutines correctly
3. ✅ Propagates exceptions from coroutines
4. ✅ Multiple sequential calls work without coroutine reuse
5. ✅ `matching_tasks._run_async` also uses correct pattern

**All tests passing:** 5/5 ✅

## Impact Analysis

### What Changed
- Analysis flow: `pending` → `processing` → `completed` now works without errors
- Error handling in analysis retry logic is now safe
- Failed analyses can be properly marked without coroutine reuse errors

### What Stayed the Same
- Business logic of analysis processing (unchanged)
- Pipeline scoring and matching (unchanged)
- Enqueue logic (unchanged)
- All API endpoints (unchanged)

## Verification Checklist

- ✅ No coroutine reuse possible with `asyncio.run()`
- ✅ Fresh event loop created for each call
- ✅ No manual loop management needed
- ✅ Exception handling preserved
- ✅ Tests validate the fix
- ✅ No regressions to other systems

## Example: How It Works Now

```
Analysis Task Flow (Celery Worker):
1. process_analysis() called
2. _run_async(_process_analysis_async(...))
   - Creates NEW event loop
   - Executes coroutine once
   - Closes loop
3. If error: _run_async(_mark_analysis_failed(...))
   - Creates NEW event loop (different instance)
   - Executes different coroutine
   - No reuse issue ✅
```

## References

- **Python Docs:** https://docs.python.org/3/library/asyncio.html#asyncio.run
- **Related Issue:** "cannot reuse already awaited coroutine" error
- **Affected Module:** Analysis processing worker (Celery task)
