/**
 * The sprint segment renders its page and a parallel `@modal` slot.
 *
 * Clicking an item intercepts into the modal; a hard navigation to the same URL
 * has nothing to intercept and renders the full page instead. Both read the
 * same component, so the two can never drift.
 */
export default function SprintLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
