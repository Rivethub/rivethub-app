import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "./ui";

/**
 * A modal dialog: Escape and the backdrop close it, focus moves in on open,
 * Tab stays inside, and focus returns to the opener on close.
 */
export function Modal({
  label,
  onClose,
  children,
  placement = "center",
  className,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  placement?: "center" | "top" | "sheet";
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("[autofocus], input, button, a[href], [tabindex]:not([tabindex='-1'])");
    (first ?? panel.current)?.focus();
    return () => opener?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>("input, button, a[href], select, textarea, [tabindex]:not([tabindex='-1'])")].filter((el) => !el.hasAttribute("disabled"));
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div aria-hidden="true" className={cx("absolute inset-0", placement === "sheet" ? "bg-black/50" : "bg-background/55 backdrop-blur-[1px]")} onClick={onClose} />
      <div
        className={cx(
          "pointer-events-none absolute inset-0 flex px-4",
          placement === "center" && "items-center justify-center",
          placement === "top" && "items-start justify-center pt-[12vh]",
          placement === "sheet" && "items-end px-0",
        )}
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className={cx(
            "pointer-events-auto flex max-h-[85vh] w-full flex-col overflow-auto border border-input bg-card shadow-[0_24px_60px_rgba(0,0,0,.35)] outline-none",
            placement === "sheet" ? "rounded-t-[20px] border-x-0 border-b-0 pb-[max(env(safe-area-inset-bottom),20px)]" : "max-w-[640px] rounded-[14px]",
            className,
          )}
        >
          {placement === "sheet" && <span aria-hidden="true" className="mx-auto mt-2.5 mb-1 h-[5px] w-10 shrink-0 rounded-full bg-input" />}
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
