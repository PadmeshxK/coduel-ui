import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { Reveal } from '../components/ui/Reveal'
import { Loader } from '../components/ui/Loader'
import { problemApi } from '../lib/api'
import { useAsync } from '../hooks/useAsync'

export function Practice() {
  const { data, loading, error } = useAsync(() => problemApi.getPage(0, 50), [])
  const problems = data?.content ?? []

  return (
    <>
      <div className="mb-8 mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">
          ● Practice
        </div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[54px] lg:leading-none">
          Problem set
        </h1>
        <p className="mt-4 text-ink-soft">
          {loading
            ? 'Loading…'
            : `${problems.length} problem${problems.length === 1 ? '' : 's'} `}
        </p>
      </div>

      {error && (
        <Card>
          <p className="font-mono text-sm text-accent">Couldn't load problems: {error}</p>
        </Card>
      )}

      {!error && loading && problems.length === 0 && (
        <Card className="grid place-items-center py-16">
          <Loader label="Loading problems" />
        </Card>
      )}

      {!error && !loading && problems.length === 0 && (
        <Card>
          <p className="text-ink-soft">No problems yet — seed some on the backend.</p>
        </Card>
      )}

      {!error && problems.length > 0 && (
        <Reveal>
        <Card className="!p-0">
          {problems.map((p, i) => (
            <Link
              key={p.slug}
              to={`/practice/${p.slug}`}
              className={`flex items-center gap-4 px-[22px] py-5 transition hover:bg-black/[0.03] dark:hover:bg-white/[0.03] ${
                i > 0 ? 'border-t border-line' : ''
              }`}
            >
              <span className="font-mono text-sm text-ink-soft">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[17px] font-semibold">{p.title}</span>
              <span className="ml-auto font-mono text-xs text-ink-soft">solve →</span>
            </Link>
          ))}
        </Card>
        </Reveal>
      )}
    </>
  )
}
