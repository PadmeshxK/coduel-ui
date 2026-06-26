// Lightweight syntax highlighting for chat code snippets — highlight.js core + only the languages we
// offer in the composer (keeps the bundle lean). Returns safe HTML (highlight.js escapes its input).
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

const MODULES: Record<string, Parameters<typeof hljs.registerLanguage>[1]> = {
  bash,
  c,
  cpp,
  go,
  java,
  javascript,
  json,
  python,
  rust,
  sql,
  typescript,
  xml,
}
for (const [id, mod] of Object.entries(MODULES)) hljs.registerLanguage(id, mod)

// Composer language label → highlight.js id.
const LABEL_TO_ID: Record<string, string> = {
  Python: 'python',
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  Java: 'java',
  'C++': 'cpp',
  C: 'c',
  Go: 'go',
  Rust: 'rust',
  SQL: 'sql',
  Bash: 'bash',
  JSON: 'json',
  HTML: 'xml',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Highlight code for the given language label → HTML (falls back to escaped plain text). */
export function highlightCode(code: string, label: string | null): string {
  const id = label ? LABEL_TO_ID[label] : undefined
  if (id && hljs.getLanguage(id)) {
    try {
      return hljs.highlight(code, { language: id, ignoreIllegals: true }).value
    } catch {
      // fall through to plain
    }
  }
  return escapeHtml(code)
}
