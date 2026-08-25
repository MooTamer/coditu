import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCESS_PRESETS,
  CLIENT_CAPABILITIES,
  CAPABILITY_LABEL,
  CAPABILITY_REVEALS,
  SENSITIVE_CAPABILITIES,
  can,
  describeAccess,
  presetFor,
  resolveCapabilities,
  type ClientCapability,
} from "@/lib/client-access";

/**
 * The capability vocabulary is defined twice — once as a Postgres enum, once in
 * TypeScript — for the same reason the status vocabulary and the component
 * kinds are, and with the same risk. This reads the SQL text rather than the
 * database so it fails in CI on a machine with no Postgres.
 *
 * The drift that matters here is not a missing capability. It is an EXTRA one
 * in TypeScript: a capability the UI can offer and the database has never heard
 * of would be stored, would never match `= any(g.capabilities)`, and would
 * present as "I ticked it and it did nothing".
 */
const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260825110200_client_access.sql"
);

describe("capability vocabulary", () => {
  it("SQL and TypeScript agree on the enum members, in order", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const declaration = sql.slice(
      sql.indexOf("create type client_capability"),
      sql.indexOf("comment on type client_capability")
    );
    const inSql = [...declaration.matchAll(/'(\w+)'/g)].map(([, cap]) => cap as ClientCapability);

    expect(inSql).toEqual([...CLIENT_CAPABILITIES]);
  });

  it("every capability has a label and a plain sentence about what it reveals", () => {
    for (const capability of CLIENT_CAPABILITIES) {
      expect(CAPABILITY_LABEL[capability], capability).toBeTruthy();
      expect(CAPABILITY_REVEALS[capability], capability).toBeTruthy();
    }
  });

  it("names hours and files as sensitive, because an admin should be told twice", () => {
    expect(SENSITIVE_CAPABILITIES).toContain("view_effort");
    expect(SENSITIVE_CAPABILITIES).toContain("view_attachments");
  });
});

describe("presets", () => {
  it("Observer can read, and cannot write", () => {
    const observer = presetFor("observer");
    expect(observer).toContain("view_project");
    expect(observer).toContain("view_components");
    expect(observer).toContain("read_questions");
    expect(observer).not.toContain("reply_questions");
    expect(observer).not.toContain("start_questions");
  });

  it("Collaborator is Observer plus replying — a superset, never a different set", () => {
    const observer = presetFor("observer");
    const collaborator = presetFor("collaborator");

    for (const capability of observer) {
      expect(collaborator, capability).toContain(capability);
    }
    expect(collaborator).toContain("reply_questions");
  });

  it("neither preset grants hours, files, or opening a thread", () => {
    // The three explicit opt-ins. Hours are commercially sensitive, files can
    // carry anything, and a client who can open threads turns this into a
    // support inbox nobody agreed to staff.
    for (const name of ["observer", "collaborator"] as const) {
      expect(presetFor(name), name).not.toContain("view_effort");
      expect(presetFor(name), name).not.toContain("view_attachments");
      expect(presetFor(name), name).not.toContain("start_questions");
    }
  });

  it("every preset lists only capabilities that exist", () => {
    for (const name of Object.keys(ACCESS_PRESETS) as (keyof typeof ACCESS_PRESETS)[]) {
      for (const capability of ACCESS_PRESETS[name]) {
        expect(CLIENT_CAPABILITIES, `${name}/${capability}`).toContain(capability);
      }
    }
  });
});

describe("resolveCapabilities", () => {
  it("returns the preset's own list for a named preset, ignoring any custom set", () => {
    expect(resolveCapabilities("observer", ["view_effort"])).toEqual(presetFor("observer"));
  });

  it("takes the custom list only for the custom preset", () => {
    expect(resolveCapabilities("custom", ["view_project", "view_effort"])).toEqual([
      "view_project",
      "view_effort",
    ]);
  });

  it("drops anything it does not recognise rather than storing it", () => {
    // The failure this prevents: a hand-posted form field reaching the database
    // as a capability that no `= any(capabilities)` will ever match. It would
    // store cleanly and behave as though nothing was ticked.
    const resolved = resolveCapabilities("custom", [
      "view_project",
      "view_everything",
      "admin",
      "",
    ] as unknown as ClientCapability[]);

    expect(resolved).toEqual(["view_project"]);
  });

  it("de-duplicates, and returns capabilities in the canonical order", () => {
    // Canonical order so two grants with the same capabilities compare equal as
    // arrays, in a test and in a diff on the access screen.
    const resolved = resolveCapabilities("custom", [
      "read_questions",
      "view_project",
      "read_questions",
    ]);
    expect(resolved).toEqual(["view_project", "read_questions"]);
  });

  it("an empty custom set is empty, not a silent fallback to a preset", () => {
    // A contact with no capabilities is a real, reachable state — an admin
    // mid-way through setting one up. Quietly substituting Collaborator would
    // grant access nobody chose.
    expect(resolveCapabilities("custom", [])).toEqual([]);
  });
});

describe("can", () => {
  it("is true only for a capability actually present", () => {
    const granted: ClientCapability[] = ["view_project", "read_questions"];
    expect(can(granted, "view_project")).toBe(true);
    expect(can(granted, "view_effort")).toBe(false);
  });

  it("is false for an empty or missing grant rather than throwing", () => {
    expect(can([], "view_project")).toBe(false);
    expect(can(null, "view_project")).toBe(false);
    expect(can(undefined, "view_project")).toBe(false);
  });
});

describe("describeAccess", () => {
  it("says what a grant allows, in sentences an admin can check before saving", () => {
    const lines = describeAccess(["view_project", "view_effort"]);
    expect(lines.length).toBe(2);
    expect(lines.join(" ")).toContain(CAPABILITY_LABEL.view_project);
  });

  it("says plainly that nothing is granted rather than returning an empty list", () => {
    // An empty panel reads as "not loaded yet". A sentence reads as a decision.
    expect(describeAccess([])).toEqual(["No access yet — this contact will see nothing."]);
  });

  it("flags the sensitive ones so they cannot be ticked without being read", () => {
    const lines = describeAccess(["view_effort"]);
    expect(lines[0]).toContain(CAPABILITY_REVEALS.view_effort);
  });
});
