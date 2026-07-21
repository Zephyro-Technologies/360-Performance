// App-styled confirmation dialog, as a promise.
//
// The dashboard used the browser's native window.confirm() in ~19 places. That renders Chrome's own
// dialog: it carries the page's origin ("localhost:5173 says…"), can't be styled, ignores the app's
// typography, and on some browsers offers "prevent this page from creating more dialogs" — which
// would silently disable every confirmation in the app, turning a guarded delete into a one-click
// one. It also blocks the JS thread, so nothing can render underneath it.
//
// This keeps the ergonomics that made window.confirm() attractive — a one-line guard inside an
// existing handler — by resolving a promise instead of taking a callback:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title: `Delete ${p.name}?`, destructive: true }))) return;
//
// Built on the shadcn AlertDialog already in @360/ui (Radix): focus is trapped, Esc and the overlay
// cancel, and focus returns to the trigger afterwards — none of which the native dialog gave us.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@360/ui/alert-dialog";
import { cn } from "@360/ui/utils";

export interface ConfirmOptions {
  title: string;
  /** Optional second line — the consequence, when it isn't obvious from the title. */
  description?: ReactNode;
  /** Defaults to "Delete" when destructive, otherwise "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for anything that destroys or reverses something. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  // Held across renders so the dialog's buttons settle the promise the caller is awaiting.
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    return new Promise<boolean>((resolve) => {
      // A second confirm while one is open would orphan the first caller's promise — decline it.
      resolver.current?.(false);
      resolver.current = resolve;
      setOpts(next);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog
        open={opts != null}
        // Covers Esc, the overlay, and the close button — all of them mean "no".
        onOpenChange={(open) => { if (!open) settle(false); }}
      >
        {opts && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{opts.title}</AlertDialogTitle>
              {/* A description is always present so the dialog is announced properly (Radix
                  requires one). Most confirmations are a single self-contained question
                  ("Delete ORD-1200?"); rather than repeating the title — which a screen reader
                  would then read twice — those get a short visually-hidden instruction. */}
              <AlertDialogDescription className={opts.description ? undefined : "sr-only"}>
                {opts.description ?? "Choose Confirm to continue, or Cancel to go back."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>{opts.cancelLabel ?? "Cancel"}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => settle(true)}
                className={cn(opts.destructive && "bg-[#cc0000] text-white hover:bg-[#a30000]")}
              >
                {opts.confirmLabel ?? (opts.destructive ? "Delete" : "Confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
