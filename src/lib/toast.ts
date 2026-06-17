// Lazy toast facade. sonner (~9KB gzip) is only needed when a toast actually
// fires (save errors, file-change warnings) — never at startup. This keeps it
// out of the eager bundle: callers use the same `toast.error/success/warning`
// API, but the sonner module + <Toaster> mount on first use.

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: ToastAction;
  cancel?: { label: string; onClick?: () => void };
}

let requestMount: (() => void) | undefined;

// App registers a callback that mounts the (lazy) <Toaster> on first toast.
export function onToasterNeeded(fn: () => void): void {
  requestMount = fn;
}

type Kind = "error" | "success" | "warning";

function emit(kind: Kind, message: string, opts?: ToastOptions): void {
  requestMount?.();
  void import("sonner").then((m) => {
    (m.toast[kind] as (msg: string, opts?: ToastOptions) => void)(message, opts);
  });
}

export const toast = {
  error: (message: string, opts?: ToastOptions): void => emit("error", message, opts),
  success: (message: string, opts?: ToastOptions): void => emit("success", message, opts),
  warning: (message: string, opts?: ToastOptions): void => emit("warning", message, opts),
};
