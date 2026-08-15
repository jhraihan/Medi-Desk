import { useState, useRef } from "react";

export function useFlash(timeoutMs = 4000) {
  const [message, setMessage] = useState("");
  const timerRef = useRef(null);

  function trigger(msg) {
    setMessage(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(""), timeoutMs);
  }

  return [message, trigger];
}