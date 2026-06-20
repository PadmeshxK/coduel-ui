import type { Monaco } from '@monaco-editor/react'
import type { Position, editor } from 'monaco-editor'

// Monaco ships no language service for Python/C++ (only word-based suggestions). Rather than run a
// full LSP in the browser, we register curated completion providers: language keywords, the common
// builtins/STL, and handy snippets (incl. competitive-coding ones). Registered once, globally.

let registered = false

type Range = {
  startLineNumber: number
  endLineNumber: number
  startColumn: number
  endColumn: number
}
type Snip = [label: string, insert: string, detail: string]

const PY_KEYWORDS = [
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass',
  'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'lambda', 'yield', 'global',
  'nonlocal', 'assert', 'del', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'async', 'await',
]
const PY_BUILTINS = [
  'print', 'input', 'len', 'range', 'int', 'str', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
  'map', 'filter', 'sorted', 'reversed', 'enumerate', 'zip', 'sum', 'min', 'max', 'abs', 'round',
  'any', 'all', 'open', 'type', 'isinstance', 'ord', 'chr', 'format', 'append', 'split', 'join', 'strip',
]
const PY_SNIPPETS: Snip[] = [
  ['for', 'for ${1:i} in range(${2:n}):\n\t$0', 'for i in range(n)'],
  ['forin', 'for ${1:item} in ${2:iterable}:\n\t$0', 'for x in iterable'],
  ['while', 'while ${1:condition}:\n\t$0', 'while loop'],
  ['def', 'def ${1:name}(${2:args}):\n\t$0', 'function'],
  ['class', 'class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t$0', 'class'],
  ['ifmain', 'if __name__ == "__main__":\n\t${1:main()}', 'main guard'],
  ['readint', 'n = int(input())', 'read an int'],
  ['readints', 'arr = list(map(int, input().split()))', 'read ints into a list'],
  ['readstr', 's = input()', 'read a line'],
]

const CPP_KEYWORDS = [
  'int', 'long', 'double', 'float', 'char', 'bool', 'void', 'auto', 'const', 'struct', 'class',
  'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'namespace', 'using', 'template', 'typename', 'public', 'private', 'protected', 'true', 'false',
  'nullptr', 'new', 'delete', 'sizeof', 'static', 'unsigned', 'enum', 'this', 'virtual', 'override',
]
const CPP_COMMON = [
  'std', 'cout', 'cin', 'endl', 'vector', 'string', 'pair', 'map', 'unordered_map', 'set',
  'unordered_set', 'queue', 'stack', 'priority_queue', 'sort', 'reverse', 'push_back', 'pop_back',
  'size', 'empty', 'begin', 'end', 'make_pair', 'to_string', 'stoi', 'max', 'min', 'swap', 'abs',
  'printf', 'scanf', 'memset', 'find', 'count', 'substr', 'length',
]
const CPP_SNIPPETS: Snip[] = [
  ['main', 'int main() {\n\t$0\n\treturn 0;\n}', 'main()'],
  ['cp', '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n\tios_base::sync_with_stdio(false);\n\tcin.tie(NULL);\n\t$0\n\treturn 0;\n}', 'competitive template'],
  ['forr', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}', 'for loop'],
  ['while', 'while (${1:cond}) {\n\t$0\n}', 'while loop'],
  ['vec', 'vector<${1:int}> ${2:v}(${3:n});', 'vector'],
  ['cout', 'cout << ${1} << endl;', 'print'],
  ['cin', 'cin >> ${1};', 'read'],
  ['inc', '#include <${1:bits/stdc++.h}>', 'include'],
]

export function registerCompletions(monaco: Monaco) {
  if (registered) return
  registered = true

  const Kind = monaco.languages.CompletionItemKind
  const asSnippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

  const items = (range: Range, keywords: string[], builtins: string[], snippets: Snip[]) => [
    ...keywords.map((label) => ({ label, kind: Kind.Keyword, insertText: label, range })),
    ...builtins.map((label) => ({ label, kind: Kind.Function, insertText: label, range })),
    ...snippets.map(([label, insertText, detail]) => ({
      label,
      kind: Kind.Snippet,
      insertText,
      insertTextRules: asSnippet,
      detail,
      range,
    })),
  ]

  const completionProvider = (
    keywords: string[],
    builtins: string[],
    snippets: Snip[],
  ): Parameters<typeof monaco.languages.registerCompletionItemProvider>[1] => ({
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const word = model.getWordUntilPosition(position)
      const range: Range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      return { suggestions: items(range, keywords, builtins, snippets) }
    },
  })

  monaco.languages.registerCompletionItemProvider(
    'python',
    completionProvider(PY_KEYWORDS, PY_BUILTINS, PY_SNIPPETS),
  )
  monaco.languages.registerCompletionItemProvider(
    'cpp',
    completionProvider(CPP_KEYWORDS, CPP_COMMON, CPP_SNIPPETS),
  )
}
