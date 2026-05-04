"""Tests validating _run_async doesn't cause coroutine reuse errors.

Focus: The _run_async() function uses asyncio.run() which:
1. Creates a fresh event loop
2. Executes coroutine exactly once
3. Closes loop automatically
4. No coroutine reutilization possible
"""

import pytest


class TestRunAsyncNoCoroutineReuse:
    """Tests validating _run_async implementation prevents coroutine reuse."""

    def test_run_async_uses_asyncio_run(self):
        """Verify: _run_async uses asyncio.run() which prevents coroutine reuse.

        The fix replaces loop.run_until_complete() pattern with asyncio.run()
        because:
        - asyncio.run() creates fresh loop (always)
        - asyncio.run() closes loop after (no reuse)
        - loop.run_until_complete() could retry with same coroutine (bug!)
        """
        from src.interface.workers.analysis_tasks import _run_async
        import inspect

        # Get source code of _run_async
        source = inspect.getsource(_run_async)

        # Verify it uses asyncio.run()
        assert "asyncio.run" in source, (
            f"_run_async should use asyncio.run() to prevent coroutine reuse. "
            f"Current implementation:\n{source}"
        )

        # Verify it does NOT use the problematic pattern
        assert "run_until_complete" not in source, (
            f"_run_async should NOT use loop.run_until_complete() because it can "
            f"cause coroutine reuse on error. Current implementation:\n{source}"
        )

    def test_run_async_executes_coroutine(self):
        """Verify: _run_async executes simple coroutines correctly."""
        from src.interface.workers.analysis_tasks import _run_async

        # Simple async function
        async def dummy_coro():
            return "success"

        # Execute
        result = _run_async(dummy_coro())

        # Verify result
        assert result == "success", "Coroutine should execute and return value"

    def test_run_async_propagates_exceptions(self):
        """Verify: _run_async propagates exceptions from coroutines."""
        from src.interface.workers.analysis_tasks import _run_async

        async def failing_coro():
            raise ValueError("Test error")

        # Should raise
        with pytest.raises(ValueError, match="Test error"):
            _run_async(failing_coro())

    def test_run_async_called_multiple_times_with_different_coroutines(self):
        """Verify: calling _run_async multiple times with different coroutines works.

        This tests the scenario in process_analysis:
        - _run_async(_process_analysis_async(...))  # First call
        - _run_async(_mark_analysis_failed(...))    # Second call (if first fails)
        - _run_async(_mark_analysis_retry_scheduled(...))  # Third call (if retrying)
        """
        from src.interface.workers.analysis_tasks import _run_async

        call_count = 0

        async def first_coro():
            nonlocal call_count
            call_count += 1
            return f"first:{call_count}"

        async def second_coro():
            nonlocal call_count
            call_count += 1
            return f"second:{call_count}"

        async def third_coro():
            nonlocal call_count
            call_count += 1
            return f"third:{call_count}"

        # Execute three independent coroutines
        result1 = _run_async(first_coro())
        result2 = _run_async(second_coro())
        result3 = _run_async(third_coro())

        # All should execute successfully
        assert result1 == "first:1", "First coroutine should execute"
        assert result2 == "second:2", "Second coroutine should execute"
        assert result3 == "third:3", "Third coroutine should execute"
        assert call_count == 3, "All three coroutines should have been called"

    def test_matching_tasks_run_async_uses_asyncio_run(self):
        """Verify: matching_tasks._run_async also uses asyncio.run()."""
        from src.interface.workers.matching_tasks import _run_async
        import inspect

        source = inspect.getsource(_run_async)

        # Verify it uses asyncio.run()
        assert "asyncio.run" in source, (
            f"matching_tasks._run_async should use asyncio.run(). "
            f"Current implementation:\n{source}"
        )
