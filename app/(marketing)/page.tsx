import { Faq } from "./_components/faq";
import { Footer } from "./_components/footer";
import { Hero } from "./_components/hero";
import { Insights } from "./_components/insights";
import { Navbar } from "./_components/navbar";
import { Process } from "./_components/process";
import { Services } from "./_components/services";
import { Team } from "./_components/team";
import { Testimonials } from "./_components/testimonials";
import { UseCases } from "./_components/use-cases";
import { Work } from "./_components/work";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_20%_-10%,rgba(56,189,248,0.13),transparent_42%),radial-gradient(circle_at_86%_8%,rgba(59,130,246,0.1),transparent_38%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 landing-grid landing-noise" />

      <Navbar />
      <main>
        <Hero />
        <UseCases />
        <Services />
        <Work />
        <Process />
        <Team />
        <Testimonials />
        <Insights />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
