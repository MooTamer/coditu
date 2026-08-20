import type { ReactNode } from "react";

/**
 * The report escapes the app shell.
 *
 * It is a document, not a screen inside the tool — and `…/report/pdf` prints
 * this route directly, so a rail and a topbar would end up in a file sent to a
 * client. `.report-root` is what the print rules key on.
 */
export default function ReportLayout({ children }: { children: ReactNode }) {
  return (
    <div className="report-root light" style={{ background: "#ffffff", minHeight: "100dvh" }}>
      {children}
    </div>
  );
}
