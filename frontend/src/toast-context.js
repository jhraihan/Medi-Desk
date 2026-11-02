import { createContext, useContext } from "react";

export const ToastContext = createContext(null);

// toast.success(message) and toast.error(message). Results show in a corner of the
// screen, so they are seen even when the button pressed was far down the page.
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
