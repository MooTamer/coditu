import { DEFAULT_EXPORT_OPTIONS, type ExportPayload } from "@/lib/export/types";

/**
 * A payload built to exercise the awkward cases, not the happy path.
 *
 * The first item's title carries a comma AND a double quote, its description
 * has a newline, and one criterion contains the ` | ` join separator — every
 * one of those is a way a naive generator corrupts a file. If the golden files
 * still match after a change, the quoting still holds.
 */
export const EXPORT_FIXTURE: ExportPayload = {
  project: {
    name: "MEINEvim components",
    slug: "meinevim",
    clientName: "EVIM",
    clientUrl: "https://www.evim.de",
  },
  sprint: {
    id: "50000000-0000-4000-8000-000000000017",
    number: 17,
    name: "Sprint — Week 17",
    startsOn: "2026-08-17",
    endsOn: "2026-08-23",
    daysRemaining: 3,
    notes:
      "Please work this sprint on the issues in the order they are sorted in.\n\n**In the stories, there are highlighted sections, which means you need to discuss something before implementing — please reach out.**",
  },
  totalItems: 12,
  today: "2026-08-20",
  options: DEFAULT_EXPORT_OPTIONS,
  items: [
    {
      key: "COD-140",
      // A comma and a quote in one title — the two things that break a
      // split-on-comma parser.
      title: 'Add optional titles, and a "Show Title" toggle',
      description: "A unified optional title field.\nSecond line, with a comma.",
      highlight:
        "Confirm with EVIM whether the toggle default should differ for the Events webpart before implementing.",
      status: "dev_started",
      type: "story",
      grouping: null,
      assignee: { fullName: "Mohamed Tamer", initials: "MT" },
      reviewer: { fullName: "Abdelrahman Elkhateeb", initials: "AE" },
      deadline: "2026-08-21",
      estimateMinutes: 480,
      minutesLogged: 450,
      criteria: [
        { body: 'Each webpart has a "Show Title" toggle', isDone: true },
        // Contains the multi-value separator, which must survive intact.
        { body: "Spacing matches Link Kachel | at all breakpoints", isDone: false },
      ],
      comments: [
        {
          author: "Abdelrahman Elkhateeb",
          when: "2026-08-19 14:02",
          // A comma here too, so the comments cell exercises quoting.
          text: "Inline edit needs the same field ordering as the panel, otherwise editors lose the toggle.",
        },
      ],
      activity: ["MT changed status todo → dev_started · 2026-08-18 09:12"],
      entries: [
        { workedOn: "2026-08-18", minutes: 180 },
        { workedOn: "2026-08-19", minutes: 270 },
      ],
    },
    {
      key: "COD-144",
      title: "Newspart changes",
      description: "Layout and metadata changes to the news webpart.",
      highlight: null,
      status: "todo",
      type: "change_request",
      grouping: 2,
      assignee: null,
      reviewer: null,
      deadline: "2026-08-23",
      estimateMinutes: 180,
      minutesLogged: 0,
      criteria: [],
      comments: [],
      activity: [],
      entries: [],
    },
  ],
};
