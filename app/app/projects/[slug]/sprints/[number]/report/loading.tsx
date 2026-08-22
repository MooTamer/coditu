/**
 * The report is a document, not a screen inside the tool — its layout escapes
 * the app shell onto white — so it needs a fallback of its own.
 *
 * Without this file the nearest boundary above is the sprint's, and a reader
 * waiting for a client report would watch a *sprint table* skeleton assemble
 * itself on a white page. Deliberately hand-drawn rather than built from
 * `components/app/skeleton.tsx`: nothing here may reference an app token,
 * because `…/report/pdf` prints this same tree and the document is white in
 * both themes.
 */
export default function Loading() {
  const bar = (width: string, height: number, top = 0) => (
    <div
      style={{
        width,
        height,
        marginTop: top,
        borderRadius: 6,
        background: "rgba(11, 14, 20, 0.08)",
      }}
    />
  );

  return (
    <main
      role="status"
      aria-label="Loading the report"
      style={{ maxWidth: 900, margin: "0 auto", padding: "48px 32px" }}
    >
      {bar("140px", 12)}
      {bar("min(28ch, 100%)", 30, 18)}
      {bar("min(46ch, 100%)", 14, 12)}

      <div style={{ marginTop: 40 }}>{bar("100%", 10)}</div>

      {/* Eight rows in one element, the same way `.cd-skeleton-rows` does it —
          written out here rather than reused, because that class is built on
          `--hairline` and this document is white in both themes. */}
      <div
        style={{
          height: 8 * 52,
          backgroundRepeat: "repeat-y",
          backgroundImage: [
            "linear-gradient(to bottom, transparent 0 51px, rgba(11,14,20,0.08) 51px 52px)",
            "linear-gradient(to bottom, transparent 0 20px, rgba(11,14,20,0.08) 20px 33px, transparent 33px 52px)",
            "linear-gradient(to bottom, transparent 0 17px, rgba(11,14,20,0.08) 17px 35px, transparent 35px 52px)",
          ].join(","),
          backgroundSize: "100% 52px, 42% 52px, 72px 52px",
          backgroundPosition: "0 0, 0 0, right 0 top 0",
        }}
      />
    </main>
  );
}
