import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology",
  description: "How PieRadar discovers pies, keeps them in sync and calculates uncapped returns.",
};

export default function Methodology() {
  return (
    <article className="mx-auto max-w-[720px] pb-10">
      <h1 className="text-[28px] font-bold tracking-tight md:text-[36px]">How PieRadar works</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        PieRadar is an independent index of public Trading 212 pies. Here is exactly where every number comes from, how fresh it is, and where
        it can be wrong.
      </p>

      <Section title="Uncapped returns">
        <p>
          Trading 212 clips the headline return on pie cards (you&apos;ll often see <Mono>+20.00%</Mono> on very different pies). PieRadar never
          uses that figure for ranking. We compute every return ourselves from market prices:
        </p>
        <ul>
          <li>
            For a window starting on day <Mono>S</Mono>, we take a buy-and-hold position at the pie&apos;s <em>current target weights</em> on{" "}
            <Mono>S</Mono> and mark it to the latest live price: <Mono>Σ wᵢ · Pᵢ(now) / Pᵢ(S) − 1</Mono>.
          </li>
          <li>
            Windows: Today, 1M (30d), 3M (91d), 6M (182d), YTD, 1Y (365d), and All-time (since the pie was created).
          </li>
          <li>
            <strong>AAR</strong> is the compound annual growth rate over the longest window (5, 3, 2 or 1 years) for which at least 95% of the
            pie&apos;s weight has price history. The window is shown next to the number.
          </li>
          <li>Prices are dividend- and split-adjusted daily closes, plus an intraday quote for today.</li>
          <li>
            When Trading 212&apos;s own figure is known we show it alongside, struck through when it was capped, so you can see the difference.
          </li>
        </ul>
      </Section>

      <Section title="Known limitations (read these)">
        <ul>
          <li>
            <strong>Current weights, back-applied.</strong> Long windows use today&apos;s targets. If a creator rebalanced recently, the 1Y figure
            reflects the pie as it is now, not the path holders actually experienced.
          </li>
          <li>
            <strong>Local currency.</strong> Each instrument&apos;s return is measured in its trading currency. A GBP account holding US stocks
            also experiences USD/GBP moves, which we don&apos;t yet include.
          </li>
          <li>
            <strong>New listings.</strong> A holding without price history at the start of a window is excluded and the rest is re-weighted. The
            detail page shows how much weight was covered whenever it&apos;s below 100%.
          </li>
          <li>No fees, FX costs, or fractional-share rounding are modelled.</li>
        </ul>
      </Section>

      <Section title="Target vs actual allocation">
        <p>
          Pies drift as prices move. &quot;Actual&quot; is each holding&apos;s weight after drifting from target since the pie&apos;s last rebalance (the last
          time its targets changed): <Mono>wᵢ · Pᵢ(now)/Pᵢ(rebalance)</Mono>, normalised. Today&apos;s change uses actual weights, because that&apos;s
          what a holder experiences.
        </p>
      </Section>

      <Section title="Keeping the index complete">
        <ul>
          <li>
            <strong>Discovery.</strong> A sweep walks the pie source every few minutes. Anything new is inserted immediately and synced at top
            priority, so a new public pie appears within minutes.
          </li>
          <li>
            <strong>Removals.</strong> A pie that is missing from a complete sweep, or whose page returns “not found”, is re-checked. It is only
            removed after <em>two consecutive</em> not-found responses, so a temporary outage never deletes pies. Removed pies that come back are
            restored automatically.
          </li>
          <li>
            <strong>Tiered refresh.</strong> Popular pies (≥10K copiers) and pies under a day old refresh every 5 minutes, pies with ≥500 copiers or
            under two weeks old every 30 minutes, and the long tail every 6 hours. Failures back off exponentially and are listed on the{" "}
            <Link href="/status">status page</Link>.
          </li>
          <li>
            <strong>Live re-marking.</strong> Instrument quotes refresh every minute while markets are open, and every pie&apos;s returns are recomputed
            right after. On-screen numbers poll every 15 seconds.
          </li>
          <li>
            <strong>Snapshots.</strong> One snapshot per pie per day (copiers, holdings, returns) builds an audit trail and copier history.
          </li>
        </ul>
      </Section>

      <Section title="Where the data comes from">
        <p>
          Trading 212 doesn&apos;t publish a list of every public pie, and it blocks automated access to share pages. PieRadar respects that.
          Real pies come from the <strong>official Trading 212 API</strong> (operator accounts, or owners importing their own public pies with a
          one-time key that is never stored) and from <strong>community submissions</strong> of share links. Every pie is labelled Verified,
          Submitted or Simulated, and every real pie links straight to Trading 212.
        </p>
        <p>
          Market data comes from a configurable provider (Polygon for US listings, Yahoo Finance as a fallback for UK and EU listings).
        </p>
      </Section>

      <Section title="Not financial advice">
        <p>
          PieRadar is an informational tool. Past performance, especially when back-applied to current weights, does not predict future results.
          PieRadar is not affiliated with Trading 212.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[14.5px] leading-relaxed text-muted [&_a]:text-accent [&_a:hover]:underline [&_li]:pl-1 [&_strong]:text-fg [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12.5px] text-fg">{children}</code>;
}
