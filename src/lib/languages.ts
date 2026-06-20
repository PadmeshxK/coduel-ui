import type { Language } from '../types'

/*
  Languages offered in the editor. The backend currently judges only PYTHON — add entries here
  as the execution engine gains support (the backend `Language` enum must gain the value too,
  then add it to the `Language` type in types/index.ts).
*/
export const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'PYTHON', label: 'Python 3.13' },
  { value: 'CPP', label: 'C++20' },
]

/** Maps our Language to Monaco's language id (for syntax highlighting). */
export const MONACO_LANGUAGE: Record<Language, string> = {
  PYTHON: 'python',
  CPP: 'cpp',
}

/** Maps our Language to a source-file extension (the console's filename label). */
export const FILE_EXT: Record<Language, string> = {
  PYTHON: 'py',
  CPP: 'cpp',
}
