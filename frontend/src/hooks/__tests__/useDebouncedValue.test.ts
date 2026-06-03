import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "../useDebouncedValue";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately on mount", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("does not update until delay has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    expect(result.current).toBe("a");

    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe("a");

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe("b");
  });

  it("updates to the latest value after delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "" } },
    );

    rerender({ value: "J" });
    rerender({ value: "Jo" });
    rerender({ value: "Joã" });
    rerender({ value: "João" });

    // Still old value — debounce reset on every keystroke
    expect(result.current).toBe("");

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("João");
  });

  it("resets the timer on every value change", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => { vi.advanceTimersByTime(200); });
    // mid-timer, change again
    rerender({ value: "c" });
    act(() => { vi.advanceTimersByTime(200); });
    // only 200ms since "c" — still old value
    expect(result.current).toBe("a");

    act(() => { vi.advanceTimersByTime(100); });
    // now 300ms since "c"
    expect(result.current).toBe("c");
  });

  it("cleans up the timer on unmount", () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    unmount();

    // After unmount, advancing timers should not cause state updates
    // (no "update on unmounted component" warnings)
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("a");
  });

  it("returns new value immediately if delay is 0", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 0),
      { initialProps: { value: "a" } },
    );

    rerender({ value: "b" });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe("b");
  });
});
