import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { SectionLabel } from '../components/ui/SectionLabel'
import { Pill } from '../components/ui/Pill'
import { Avatar } from '../components/ui/Avatar'

const SWATCHES: [string, string][] = [
  ['bg-paper', 'paper'],
  ['bg-paper-2', 'paper-2'],
  ['bg-ink', 'ink'],
  ['bg-ink-soft', 'ink-soft'],
  ['bg-line', 'line'],
  ['bg-accent', 'accent'],
  ['bg-accent-2', 'accent-2'],
  ['bg-gold', 'gold'],
]

export function Styleguide() {
  return (
    <>
      <div className="mt-8">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">
          ● Design System
        </div>
        <h1 className="font-display text-[54px] font-extrabold leading-none tracking-[-0.035em]">
          Primitives
        </h1>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-[22px]">
        <Card>
          <SectionLabel>Typography</SectionLabel>
          <div className="mt-4 space-y-3">
            <p className="font-display text-[40px] font-extrabold leading-none tracking-[-0.035em]">
              Display / Bricolage
            </p>
            <p className="text-lg">
              Body — Space Grotesk, the workhorse UI font for everything readable.
            </p>
            <p className="font-mono text-sm text-ink-soft">
              mono — JetBrains Mono · labels, code, timers
            </p>
          </div>
        </Card>

        <Card>
          <SectionLabel>Buttons</SectionLabel>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary">Submit solution</Button>
            <Button variant="secondary">Run</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary" size="sm">
              Find a duel
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </Card>

        <Card>
          <SectionLabel>Pills &amp; tags</SectionLabel>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill>arrays</Pill>
            <Pill>hash map</Pill>
            <Pill className="text-accent-2">
              <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent-2" />
              in progress
            </Pill>
            <Pill className="text-accent">medium</Pill>
          </div>
        </Card>

        <Card>
          <SectionLabel>Avatars</SectionLabel>
          <div className="mt-4 flex items-center gap-4">
            <Avatar initial="P" size={30} />
            <Avatar
              initial="A"
              size={44}
              gradient="linear-gradient(135deg,#caa05a,#B8893B)"
            />
            <Avatar
              initial="K"
              size={56}
              gradient="linear-gradient(135deg,#7FB47A,#2E6B4F)"
            />
          </div>
        </Card>

        <Card className="col-span-2">
          <SectionLabel>Palette</SectionLabel>
          <div className="mt-4 flex flex-wrap gap-3">
            {SWATCHES.map(([cls, name]) => (
              <div key={name} className="flex flex-col items-center gap-2">
                <div className={`h-12 w-12 rounded-lg border border-line ${cls}`} />
                <span className="font-mono text-[10px] text-ink-soft">{name}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
