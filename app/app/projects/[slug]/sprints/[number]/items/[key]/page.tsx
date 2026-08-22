import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ItemDetailBody } from "@/components/app/item-detail";
import { Mono } from "@/components/coditu/mono";
import { StatusChipDot } from "@/components/coditu/status-chip";
import { Reveal } from "@/components/motion/reveal";
import { todayInCairo } from "@/lib/data/sprint";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getWorkItem } from "@/lib/data/work-item";
import { getCurrentProfile } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string; key: string }>;
}) {
  const { slug, number, key } = await params;
  const item = await getWorkItem(slug, Number(number), key);
  return { title: item ? `${item.key} — ${item.title}` : "Item" };
}

/**
 * The full page. Reached by a hard navigation, a shared link, or a refresh —
 * the same URL the modal shows, rendering the same body with a real heading and
 * a way back to the sprint.
 */
export default async function ItemPage({
  params,
}: {
  params: Promise<{ slug: string; number: string; key: string }>;
}) {
  const { slug, number, key } = await params;
  const item = await getWorkItem(slug, Number(number), key);
  if (!item) notFound();

  const [profile, people] = await Promise.all([getCurrentProfile(), listActiveProfiles()]);
  if (!profile) notFound();

  const canToggle =
    profile.role !== "engineer" ||
    item.assignee?.id === profile.id ||
    item.reviewer?.id === profile.id;

  return (
    <main className="flex flex-1 flex-col gap-5 p-[var(--app-gutter)]">
      <Reveal tier="section" as="header" className="flex flex-wrap items-center gap-3">
        <Link
          href={`/app/projects/${slug}/sprints/${number}`}
          className="flex h-[34px] items-center gap-2 rounded-control border border-[var(--hairline-strong)] px-3 text-[13.5px] hover:bg-[var(--raised)]"
        >
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          {item.sprint.name}
        </Link>
        <Mono size="key" className="text-[var(--accent)]">
          {item.key}
        </Mono>
        <StatusChipDot status={item.status} />
        <Mono size="meta" className="text-[var(--ink-faint)]">
          {item.project.clientName} · {item.project.name}
        </Mono>
      </Reveal>

      <Reveal
        tier="section"
        delay={0.06}
        className="overflow-hidden rounded-section border border-[var(--hairline)] bg-[var(--overlay)]"
      >
        <ItemDetailBody
          item={item}
          today={todayInCairo()}
          canToggleCriteria={canToggle}
          people={people}
          me={{
            id: profile.id,
            fullName: profile.full_name,
            initials: profile.initials,
            avatarUrl: profile.avatar_url,
          }}
        />
      </Reveal>
    </main>
  );
}
