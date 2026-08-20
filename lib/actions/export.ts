"use server";

import { z } from "zod";

import { buildExportPayload } from "@/lib/data/export";
import { generateCsv } from "@/lib/export/csv";
import { generateMarkdown } from "@/lib/export/markdown";
import { exportSlug } from "@/lib/export/types";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * Renders an export.
 *
 * The preview and the download call this same action, so what you read is
 * byte-for-byte what you get. The scoping guarantee is upstream in
 * `buildExportPayload`: this takes a slug and a sprint number and cannot be
 * handed a list of items from anywhere else.
 */

const input = z.object({
  slug: z.string().min(1).max(120),
  sprintNumber: z.number().int().positive(),
  format: z.enum(["csv", "md"]),
  /** null means "everything"; a list narrows it. */
  selectedKeys: z.array(z.string().max(40)).max(1000).nullable(),
  options: z.object({
    criteria: z.boolean(),
    hours: z.boolean(),
    comments: z.boolean(),
    owners: z.boolean(),
  }),
});

export interface RenderResult {
  ok: boolean;
  text?: string;
  filename?: string;
  lines?: number;
  error?: string;
}

export async function renderExport(raw: unknown): Promise<RenderResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That export request did not make sense." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const payload = await buildExportPayload(
    parsed.data.slug,
    parsed.data.sprintNumber,
    parsed.data.selectedKeys,
    parsed.data.options
  );

  if (!payload) return { ok: false, error: "That sprint no longer exists." };

  const text =
    parsed.data.format === "csv" ? generateCsv(payload) : generateMarkdown(payload);

  return {
    ok: true,
    text,
    filename: `${exportSlug(payload)}.${parsed.data.format}`,
    lines: text.split("\n").length,
  };
}

/* -------------------------------------------------------------------------- */

const listInput = z.object({
  slug: z.string().min(1).max(120),
  sprintNumber: z.number().int().positive(),
});

export interface ExportItemSummaryDTO {
  key: string;
  title: string;
  minutesLogged: number;
  isDraft: boolean;
}

/**
 * The item list for the export dialog's selector.
 *
 * Fetched when the dialog opens rather than shipped with every page: the shell
 * layout cannot know which sprint is on screen, and sending twelve items to
 * `/app/people` to support a dialog nobody opened is the wrong trade.
 */
export async function listExportItems(
  raw: unknown
): Promise<{ ok: boolean; items?: ExportItemSummaryDTO[]; error?: string }> {
  const parsed = listInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That sprint request did not make sense." };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "You are not signed in." };

  const payload = await buildExportPayload(parsed.data.slug, parsed.data.sprintNumber, null);
  if (!payload) return { ok: false, error: "That sprint no longer exists." };

  return {
    ok: true,
    items: payload.items.map((item) => ({
      key: item.key,
      title: item.title,
      minutesLogged: item.minutesLogged,
      isDraft: item.status === "draft",
    })),
  };
}
