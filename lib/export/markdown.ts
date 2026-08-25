import { hours } from "@/lib/format";
import { WORK_ITEM_STATUSES } from "@/lib/work-items";
import type { ExportPayload } from "./types";

/**
 * The Markdown export.
 *
 * Written for an AI agent, so it front-loads the facts one needs to act: the
 * project and client, the window, how many items of how many, the hours, the
 * statuses that exist, and the two conventions the team relies on. An agent
 * reading only the first fifteen lines should already know what it is looking
 * at — that is the whole design of this format.
 *
 * Contract in docs/04-EXPORT-SPEC.md; `tests/export-markdown.test.ts` pins it.
 */
export function generateMarkdown(payload: ExportPayload): string {
  const { project, sprint, items, options } = payload;
  const lines: string[] = [];

  const logged = items.reduce((total, item) => total + item.minutesLogged, 0);
  const estimate = items.reduce((total, item) => total + item.estimateMinutes, 0);

  lines.push(`# ${project.clientName} — ${sprint.name}`);
  lines.push("");

  const url = project.clientUrl ? `, ${project.clientUrl.replace(/^https?:\/\//, "")}` : "";
  lines.push(`- project: ${project.name} (${project.clientName}${url})`);
  lines.push(
    `- window: ${sprint.startsOn ?? "—"} → ${sprint.endsOn ?? "—"}` +
      (sprint.daysRemaining !== null
        ? ` (${sprint.daysRemaining} days remaining as of ${payload.today})`
        : "")
  );
  lines.push(`- items in export: ${items.length} of ${payload.totalItems}`);
  lines.push(`- hours: ${hours(logged)} logged / ${hours(estimate)} estimated`);
  lines.push(`- statuses used: ${WORK_ITEM_STATUSES.join(", ")}`);
  lines.push(
    "- convention: items sharing a `grouping` integer overlap in logic/UI and are taken by one developer"
  );
  lines.push("- convention: a highlighted block means discuss before implementing");
  lines.push("");

  if (sprint.notes) {
    lines.push("## Sprint notes");
    lines.push("");
    // Quoted, with the highlight paragraph kept bold — the emphasis IS the
    // convention, so stripping it would lose the meaning.
    for (const line of sprint.notes.split("\n")) {
      lines.push(line.trim() ? `> ${line.trim()}` : ">");
    }
    lines.push("");
  }

  lines.push("## Items");

  items.forEach((item, index) => {
    lines.push("");
    lines.push(`### ${index + 1}. ${item.key} — ${item.title}`);
    lines.push("");
    lines.push("| field | value |");
    lines.push("| --- | --- |");
    lines.push(`| status | \`${item.status}\` |`);
    lines.push(`| type | \`${item.type}\` |`);
    lines.push(`| grouping | ${item.grouping ? `\`${item.grouping}\`` : "—"} |`);
    // After grouping, and named rather than counted: the Markdown export exists
    // for an agent reading the sprint, and "which web parts does this touch" is
    // one of the first questions it has to answer.
    lines.push(
      `| components | ${item.components.length ? item.components.map((name) => `\`${name}\``).join(", ") : "not attributed"} |`
    );

    if (options.owners) {
      lines.push(`| assignee | ${item.assignee?.fullName ?? "unassigned"} |`);
      lines.push(`| reviewer | ${item.reviewer?.fullName ?? "—"} |`);
    }

    lines.push(`| deadline | ${item.deadline ?? "—"} |`);

    if (options.hours) {
      lines.push(
        `| hours | ${hours(item.minutesLogged)} logged / ${hours(item.estimateMinutes)} estimated |`
      );
    }

    lines.push("");
    if (item.description) lines.push(item.description);

    if (item.highlight) {
      lines.push("");
      lines.push(`> **Discuss before implementing:** ${item.highlight}`);
    }

    if (options.criteria && item.criteria.length) {
      lines.push("");
      lines.push("**Acceptance criteria**");
      lines.push("");
      for (const criterion of item.criteria) {
        lines.push(`- [${criterion.isDone ? "x" : " "}] ${criterion.body}`);
      }
    }

    if (options.comments && item.comments.length) {
      lines.push("");
      lines.push("**Discussion**");
      lines.push("");
      for (const comment of item.comments) {
        lines.push(`- ${comment.author} (${comment.when}): ${comment.text}`);
      }
    }

    if (options.comments && item.activity.length) {
      lines.push("");
      lines.push("**Activity**");
      lines.push("");
      for (const entry of item.activity) lines.push(`- ${entry}`);
    }

    if (options.hours && item.entries.length) {
      lines.push("");
      lines.push("**Time entries**");
      lines.push("");
      for (const entry of item.entries) {
        lines.push(`- ${entry.workedOn} — ${hours(entry.minutes)} h`);
      }
    }
  });

  lines.push("");
  return lines.join("\n");
}
