"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Building2, Check, FolderPlus, Pencil, X } from "lucide-react";

import { useToast } from "@/components/app/toast.client";
import { Mono } from "@/components/coditu/mono";
import { settle } from "@/lib/action-result";
import {
  createClientRecord,
  createProject,
  setProjectArchived,
  updateClientRecord,
  updateProject,
} from "@/lib/actions/projects";
import type { ArchivedProject, ClientSummary, ProjectSummary } from "@/lib/data/projects";
import { cn } from "@/lib/utils";

const FIELD =
  "h-[34px] w-full rounded-control border border-[var(--hairline-strong)] bg-[var(--canvas)] px-[10px] text-[13.5px] text-[var(--ink)]";
const ACTION =
  "inline-flex h-8 shrink-0 items-center gap-[6px] whitespace-nowrap rounded-control border border-[var(--hairline)] px-[10px] text-[12.5px] text-[var(--ink-muted)] transition-colors duration-[var(--dur-micro)] hover:border-[var(--hairline-strong)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45";
const PRIMARY =
  "signal-gradient h-[34px] rounded-control px-4 text-[13px] font-semibold text-[#07090E] disabled:opacity-60";

/** `Nile Atelier partner portal` → `nile-atelier-partner-portal`. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Clients and projects, administered from the screen that lists them.
 *
 * Until now both could only be created in SQL, which made "take on a new
 * client" the one thing this app could not do — see F2.1 of the thread brief.
 *
 * Two details worth knowing before changing anything here:
 *
 *  - **The slug is an address.** Renaming one keeps the old address working, so
 *    the form says so out loud rather than letting somebody discover it. The
 *    alias is written by `updateProject` in the same call.
 *  - **A project is archived, never deleted.** Deleting cascades to sprints, to
 *    items, and to the hours logged against them, which are what an invoice was
 *    built from.
 */
export function ProjectAdmin({
  projects,
  clients,
  archived,
  canManage,
}: {
  projects: ProjectSummary[];
  clients: ClientSummary[];
  archived: ArchivedProject[];
  /** Admin or lead. RLS refuses everyone else's write regardless. */
  canManage: boolean;
}) {
  const [pane, setPane] = useState<"none" | "project" | "client">("none");

  if (!canManage) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPane((was) => (was === "project" ? "none" : "project"))}
          aria-expanded={pane === "project"}
          className="inline-flex h-[34px] items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-[14px] text-[13.5px] font-medium hover:bg-[var(--canvas)]"
        >
          <FolderPlus size={14} strokeWidth={1.9} aria-hidden />
          {pane === "project" ? "Cancel" : "New project"}
        </button>

        <button
          type="button"
          onClick={() => setPane((was) => (was === "client" ? "none" : "client"))}
          aria-expanded={pane === "client"}
          className={ACTION}
        >
          <Building2 size={13} strokeWidth={1.9} aria-hidden />
          {pane === "client" ? "Cancel" : "New client"}
        </button>

        <Mono size="meta" className="text-[var(--ink-faint)]">
          {clients.length} {clients.length === 1 ? "client" : "clients"} ·{" "}
          {projects.length} live
          {archived.length ? ` · ${archived.length} archived` : ""}
        </Mono>
      </div>

      {pane === "project" ? (
        <NewProjectForm clients={clients} onDone={() => setPane("none")} />
      ) : null}
      {pane === "client" ? <NewClientForm onDone={() => setPane("none")} /> : null}

      {clients.length ? <ClientList clients={clients} /> : null}
      {archived.length ? <ArchivedList archived={archived} /> : null}
    </div>
  );
}

function NewProjectForm({ clients, onDone }: { clients: ClientSummary[]; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [name, setName] = useState("");
  // Kept in step with the name until somebody types their own, because a slug
  // that quietly drifts from the name is a URL nobody can guess.
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [keyPrefix, setKeyPrefix] = useState("");
  const [scope, setScope] = useState("");

  const effectiveSlug = slugTouched ? slug : slugify(name);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await settle(
        () =>
          createProject({
            clientId,
            name: name.trim(),
            slug: effectiveSlug,
            scope: scope.trim() || null,
            ...(keyPrefix.trim() ? { keyPrefix: keyPrefix.trim() } : {}),
          }),
        "That project did not save."
      );
      if (result.ok) {
        toast(`${name.trim()} is open. Its first sprint is the next step.`);
        onDone();
        router.refresh();
        return;
      }
      setError(result.error ?? "That project did not save.");
    });
  }

  if (clients.length === 0) {
    return (
      <p className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] px-5 py-4 text-[13.5px] text-[var(--ink-muted)]">
        A project belongs to a client, and there are none yet. Add the client first.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-label="New project"
      className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-5"
    >
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Client
          </Mono>
          <select
            className={FIELD}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Name
          </Mono>
          <input
            className={FIELD}
            required
            maxLength={120}
            enterKeyHint="next"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Address
          </Mono>
          <input
            className={FIELD}
            required
            maxLength={48}
            enterKeyHint="next"
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
          <Mono size="meta" className="text-[var(--ink-faint)]">
            /app/projects/{effectiveSlug || "…"}
          </Mono>
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Key prefix
          </Mono>
          <input
            className={FIELD}
            maxLength={8}
            placeholder="from the address"
            enterKeyHint="next"
            value={keyPrefix}
            onChange={(event) => setKeyPrefix(event.target.value.toUpperCase())}
          />
          <Mono size="meta" className="text-[var(--ink-faint)]">
            {keyPrefix ? `${keyPrefix}-1, ${keyPrefix}-2 …` : "COD-1, COD-2 … — derived if left blank"}
          </Mono>
        </label>

        <label className="flex flex-col gap-[6px] sm:col-span-2">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Scope
          </Mono>
          <input
            className={FIELD}
            maxLength={500}
            enterKeyHint="done"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className={PRIMARY}>
          {pending ? "Opening…" : "Open project"}
        </button>
        <Mono size="meta" className="text-[var(--ink-faint)]">
          the address is permanent — a rename keeps the old one working
        </Mono>
        {error ? (
          <p role="alert" className="basis-full text-[13px] text-[var(--rose)]">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function NewClientForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [accentHex, setAccentHex] = useState("");

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await settle(
        () =>
          createClientRecord({
            name: name.trim(),
            websiteUrl: websiteUrl.trim() || null,
            accentHex: accentHex.trim() || null,
          }),
        "That client did not save."
      );
      if (result.ok) {
        toast(`${name.trim()} is on the list.`);
        onDone();
        router.refresh();
        return;
      }
      setError(result.error ?? "That client did not save.");
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-label="New client"
      className="rounded-list border border-[var(--hairline)] bg-[var(--raised)] p-5"
    >
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Name
          </Mono>
          <input
            className={FIELD}
            required
            maxLength={120}
            enterKeyHint="next"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Website
          </Mono>
          <input
            className={FIELD}
            type="url"
            inputMode="url"
            enterKeyHint="next"
            placeholder="https://"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
        </label>

        <label className="flex flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            Accent
          </Mono>
          <input
            className={FIELD}
            maxLength={7}
            placeholder="#2B57FF"
            enterKeyHint="done"
            value={accentHex}
            onChange={(event) => setAccentHex(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} aria-busy={pending} className={PRIMARY}>
          {pending ? "Adding…" : "Add client"}
        </button>
        {error ? (
          <p role="alert" className="basis-full text-[13px] text-[var(--rose)]">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * The rename and archive controls for one project row, rendered by the list.
 *
 * Its own component so the list page stays a Server Component and only this
 * strip is interactive.
 */
export function ProjectRowControls({ project }: { project: ProjectSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [slug, setSlug] = useState(project.slug);
  const [scope, setScope] = useState(project.scope ?? "");

  function save() {
    startTransition(async () => {
      const movingSlug = slug.trim() !== project.slug;
      const result = await settle(
        () =>
          updateProject({
            projectId: project.id,
            name: name.trim(),
            slug: slug.trim(),
            scope: scope.trim() || null,
          }),
        "That change did not save."
      );
      if (result.ok) {
        setEditing(false);
        toast(
          movingSlug
            ? `Renamed. /app/projects/${project.slug} still works.`
            : `${name.trim()} saved.`
        );
        router.refresh();
        return;
      }
      toast(result.error ?? "That change did not save.");
    });
  }

  function archive() {
    startTransition(async () => {
      const result = await settle(
        () => setProjectArchived({ projectId: project.id, isArchived: true }),
        "That change did not save."
      );
      toast(
        result.ok
          ? `${project.name} is archived. Nothing was deleted.`
          : result.error ?? "That change did not save."
      );
      if (result.ok) router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex basis-full flex-wrap items-end gap-3">
        <label className="flex min-w-[160px] flex-1 flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {`Name of ${project.name}`}
          </Mono>
          <input
            className={FIELD}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex min-w-[140px] flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {`Address of ${project.name}`}
          </Mono>
          <input
            className={FIELD}
            value={slug}
            maxLength={48}
            onChange={(event) => setSlug(event.target.value)}
          />
        </label>
        <label className="flex min-w-[160px] flex-1 flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {`Scope of ${project.name}`}
          </Mono>
          <input
            className={FIELD}
            value={scope}
            maxLength={500}
            onChange={(event) => setScope(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label={`Save ${project.name}`}
          className={cn(ACTION, "h-[34px]")}
        >
          <Check size={14} strokeWidth={2} aria-hidden />
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(project.name);
            setSlug(project.slug);
            setScope(project.scope ?? "");
          }}
          aria-label={`Cancel editing ${project.name}`}
          className={cn(ACTION, "h-[34px]")}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        aria-label={`Edit ${project.name}`}
        className={ACTION}
      >
        <Pencil size={13} strokeWidth={1.8} aria-hidden />
      </button>
      <button
        type="button"
        onClick={archive}
        disabled={pending}
        aria-label={`Archive ${project.name}`}
        title={`Archive ${project.name} — it leaves this list, nothing is deleted`}
        className={ACTION}
      >
        <Archive size={13} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}

/**
 * The clients, and the one thing you need to do to one after creating it.
 *
 * A client's name appears on the sprint header, the project list and the client
 * report — a typo in it is on a screen somebody shows a client. `updateClientRecord`
 * existed the moment it was written and was called by nothing, which is the exact
 * shape this whole brief is about; this is its caller.
 */
function ClientList({ clients }: { clients: ClientSummary[] }) {
  return (
    <section
      aria-label="Clients"
      className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
    >
      <h2 className="border-b border-[var(--hairline)] px-5 py-3 text-[13px] font-medium text-[var(--ink-muted)]">
        Clients
      </h2>
      {clients.map((client) => (
        <ClientRow key={client.id} client={client} />
      ))}
    </section>
  );
}

function ClientRow({ client }: { client: ClientSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [websiteUrl, setWebsiteUrl] = useState(client.websiteUrl ?? "");

  function save() {
    startTransition(async () => {
      const result = await settle(
        () =>
          updateClientRecord({
            clientId: client.id,
            name: name.trim(),
            websiteUrl: websiteUrl.trim() || null,
          }),
        "That change did not save."
      );
      if (result.ok) {
        setEditing(false);
        router.refresh();
        return;
      }
      toast(result.error ?? "That change did not save.");
    });
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--hairline)] px-5 py-3 last:border-b-0">
        <label className="flex min-w-[160px] flex-1 flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {`Name of ${client.name}`}
          </Mono>
          <input
            className={FIELD}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-[6px]">
          <Mono size="eyebrow" className="text-[var(--ink-faint)]">
            {`Website of ${client.name}`}
          </Mono>
          <input
            className={FIELD}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label={`Save ${client.name}`}
          className={cn(ACTION, "h-[34px]")}
        >
          <Check size={14} strokeWidth={2} aria-hidden />
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setName(client.name);
            setWebsiteUrl(client.websiteUrl ?? "");
          }}
          aria-label={`Cancel editing ${client.name}`}
          className={cn(ACTION, "h-[34px]")}
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 border-b border-[var(--hairline)] px-5 py-3 transition-opacity duration-[var(--dur-micro)] last:border-b-0",
        pending && "opacity-50"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px]">{client.name}</span>
        {client.websiteUrl ? (
          <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
            {client.websiteUrl.replace(/^https?:\/\/(www\.)?/, "")}
          </Mono>
        ) : null}
      </span>
      <Mono size="meta" className="shrink-0 text-[var(--ink-faint)]">
        {client.projectCount} {client.projectCount === 1 ? "project" : "projects"}
      </Mono>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={pending}
        aria-label={`Edit ${client.name}`}
        className={ACTION}
      >
        <Pencil size={13} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
}

function ArchivedList({ archived }: { archived: ArchivedProject[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function restore(project: ArchivedProject) {
    startTransition(async () => {
      const result = await settle(
        () => setProjectArchived({ projectId: project.id, isArchived: false }),
        "That change did not save."
      );
      toast(result.ok ? `${project.name} is back.` : result.error ?? "That change did not save.");
      if (result.ok) router.refresh();
    });
  }

  return (
    <section
      aria-label="Archived projects"
      className="overflow-hidden rounded-list border border-[var(--hairline)] bg-[var(--raised)]"
    >
      <h2 className="border-b border-[var(--hairline)] px-5 py-3 text-[13px] font-medium text-[var(--ink-muted)]">
        Archived
      </h2>
      {archived.map((project) => (
        <div
          key={project.id}
          className="flex flex-wrap items-center gap-4 border-b border-[var(--hairline)] px-5 py-3 last:border-b-0"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px]">{project.name}</span>
            <Mono size="meta" className="block truncate text-[var(--ink-faint)]">
              {project.clientName}
            </Mono>
          </span>
          <button
            type="button"
            onClick={() => restore(project)}
            disabled={pending}
            aria-label={`Restore ${project.name}`}
            className={ACTION}
          >
            <ArchiveRestore size={13} strokeWidth={1.8} aria-hidden />
            Restore
          </button>
        </div>
      ))}
    </section>
  );
}
