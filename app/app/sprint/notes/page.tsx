import { redirect } from "next/navigation";

import { listProjects } from "@/lib/data/projects";

/**
 * `/app/sprint/notes` — "take me to the notes for whatever sprint is running".
 *
 * The returned handoff's navigation hierarchy names this route by hand:
 * *"`/app/sprint/notes` — Sprint notes — universal editor, publish, version
 * history."* It is an **entrance**, not an address, exactly as `/app/sprint` is:
 * this application's canonical URL is
 * `/app/projects/[slug]/sprints/[number]/notes`, because invariant 1 lives in
 * the URL and a note that does not say which sprint it belongs to is a note you
 * cannot share.
 *
 * With nothing active anywhere it goes to the projects list rather than
 * rendering an empty notes page, which is a dead end with nothing to act on —
 * the same answer `/app/sprint` gives.
 */
export default async function ActiveSprintNotesPage() {
  const projects = await listProjects();
  const withSprint = projects.find((project) => project.activeSprint);

  if (withSprint?.activeSprint) {
    redirect(`/app/projects/${withSprint.slug}/sprints/${withSprint.activeSprint.number}/notes`);
  }

  redirect("/app/projects");
}
