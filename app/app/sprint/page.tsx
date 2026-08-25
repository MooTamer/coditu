import { redirect } from "next/navigation";

import { listProjects } from "@/lib/data/projects";

/**
 * `/app/sprint` — "take me to whatever sprint is running".
 *
 * This is the router that used to live at `/app`, moved here when `/app` became
 * the workspace home. Keeping it matters for two reasons that are easy to miss:
 *
 * **The rail needs a stable href.** The navigation is a client component with no
 * idea which project has an active sprint, and giving it one would mean loading
 * the project list into the shell on every page. A fixed link to a server route
 * that knows the answer costs nothing until somebody clicks it.
 *
 * **The design's flat route is honoured without giving up the scoped URL.** The
 * prototype navigates to `/app/sprint`; this application's canonical sprint URL
 * is `/app/projects/[slug]/sprints/[number]`, because invariant 1 lives in the
 * URL — a sprint belongs to a project, and a URL that does not say which one is
 * a URL you cannot share. So `/app/sprint` is an entrance, not an address: it
 * resolves and redirects, and what ends up in the address bar is the real one.
 *
 * With nothing active anywhere it goes to the projects list rather than
 * rendering an empty sprint page, which is a dead end with nothing to act on.
 */
export default async function ActiveSprintPage() {
  const projects = await listProjects();
  const withSprint = projects.find((project) => project.activeSprint);

  if (withSprint?.activeSprint) {
    redirect(`/app/projects/${withSprint.slug}/sprints/${withSprint.activeSprint.number}`);
  }

  redirect("/app/projects");
}
