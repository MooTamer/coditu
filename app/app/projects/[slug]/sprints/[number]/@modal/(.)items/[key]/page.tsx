import { notFound } from "next/navigation";

import { ItemDetailBody } from "@/components/app/item-detail";
import { ItemModal } from "@/components/app/item-modal.client";
import { todayInCairo } from "@/lib/data/sprint";
import { listActiveProfiles } from "@/lib/data/profiles";
import { getWorkItem } from "@/lib/data/work-item";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * The intercepted modal. Same body as the full page, wrapped in a dialog.
 */
export default async function InterceptedItemPage({
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
    <ItemModal itemKey={item.key}>
      <ItemDetailBody
          item={item}
          today={todayInCairo()}
          canToggleCriteria={canToggle}
          people={people}
        />
    </ItemModal>
  );
}
