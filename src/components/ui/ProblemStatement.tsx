import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface ProblemStatementProps {
  text: string
  className?: string
}

// Codeforces statements delimit inline math with $$$...$$$; collapse that to $...$ which remark-math
// understands. The CF dataset also has an artifact where the delimiter got duplicated *inside*
// \text{...} (e.g. \text{$$$gcdSum$$$}) — strip those inner $$$ first, otherwise the naive collapse
// breaks brace pairing and KaTeX renders the raw source in red. Display math ($$...$$) is left as-is.
function normalize(text: string): string {
  return text
    .replace(/\\text\{\$\$\$(.*?)\$\$\$\}/g, '\\text{$1}')
    .replace(/\$\$\$/g, '$')
}

/** Renders a problem statement as Markdown + LaTeX (KaTeX). Styling lives in the `.problem-md` block. */
export function ProblemStatement({ text, className = '' }: ProblemStatementProps) {
  return (
    <div className={`problem-md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      >
        {normalize(text)}
      </ReactMarkdown>
    </div>
  )
}
