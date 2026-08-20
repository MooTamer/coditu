import { SectionHead, SiteSection } from "@/components/site/shell";
import { WorkGallery } from "@/components/site/work-gallery.client";
import { work } from "@/lib/marketing-content";

export function Work() {
  return (
    <SiteSection id="work" label="Work">
      <SectionHead
        id="work-title"
        n="01"
        title="Selected work"
        meta={`${work.length} projects`}
      />
      <WorkGallery items={work} />
    </SiteSection>
  );
}
