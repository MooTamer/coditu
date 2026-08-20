import { redirect } from "next/navigation";

import { listProjects } from "@/lib/data/projects";

/**
 * `/app` is a router, not a page.
 *
 * It sends you to a project with an active sprint. If nothing anywhere has one,
 * it goes to the projects list rather than rendering an empty sprint page —
 * an empty sprint page with no sprint to be empty about is a dead end.
 */
export default async function AppIndexPage() {
  const projects = await listProjects();
  const withSprint = projects.find((project) => project.activeSprint);

  if (withSprint?.activeSprint) {
    redirect(`/app/projects/${withSprint.slug}/sprints/${withSprint.activeSprint.number}`);
  }

  redirect("/app/projects");
}
