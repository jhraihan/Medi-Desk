import { useCallback, useEffect, useState } from "react";
import { apiError } from "./errors.js";

// Runs load() on mount, whenever load changes, and on reload(). An answer that
// arrives after a newer request started is dropped, so quick filter changes can't
// leave an older result on screen.
export function useLoader(load, fallbackError = "Could not load this page.") {
  const [state, setState] = useState({ data: null, error: "", isLoading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;

    async function run() {
      setState((current) => ({ ...current, isLoading: true }));
      try {
        const data = await load();
        if (active) setState({ data, error: "", isLoading: false });
      } catch (problem) {
        if (active) {
          setState((current) => ({
            ...current,
            error: apiError(problem, fallbackError),
            isLoading: false,
          }));
        }
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [load, tick, fallbackError]);

  const reload = useCallback(() => setTick((count) => count + 1), []);
  return { ...state, reload };
}

// The value, once it has stopped changing for `delay` ms. Keeps search boxes from
// sending a request per keystroke.
export function useDebounced(value, delay = 300) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

// Calls fn every `ms` while the tab is visible, and once straight away when the
// tab comes back, so a queue left open in the background doesn't poll for nothing.
// With immediate, fn also runs as soon as it is set up, and again whenever fn changes.
export function usePolling(fn, ms, { immediate = false } = {}) {
  useEffect(() => {
    let timer = null;

    function start() {
      stop();
      timer = setInterval(fn, ms);
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        fn();
        start();
      }
    }

    if (immediate) fn();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fn, ms, immediate]);
}
