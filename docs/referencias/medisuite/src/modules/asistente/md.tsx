// Renderizador de Markdown mínimo y seguro: todo el texto se inserta como nodos de texto de React (escapado).
import type { ReactNode } from 'react'

function inline(s: string, k = 0): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`)/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index))
    const key = `${k}-${m.index}`
    if (m[2] ?? m[3]) out.push(<strong key={key}>{m[2] ?? m[3]}</strong>)
    else if (m[4] ?? m[5]) out.push(<em key={key}>{m[4] ?? m[5]}</em>)
    else out.push(<code key={key} className="rounded bg-surface-2 px-1 text-[0.9em]">{m[6]}</code>)
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length} className="my-2">{para.flatMap((l, i) => (i ? [<br key={'b' + i} />, ...inline(l, i)] : inline(l, i)))}</p>)
    para = []
  }
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it, i)}</li>)
      blocks.push(list.ordered ? <ol key={blocks.length} className="my-2 list-decimal space-y-1 pl-5">{items}</ol> : <ul key={blocks.length} className="my-2 list-disc space-y-1 pl-5">{items}</ul>)
    }
    list = null
  }
  for (const raw of lines) {
    const l = raw.trimEnd()
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    const ul = l.match(/^\s*[-*•]\s+(.*)$/)
    const ol = l.match(/^\s*\d+[.)]\s+(.*)$/)
    if (h) {
      flushPara(); flushList()
      const cls = h[1].length === 1 ? 'mt-4 mb-2 text-lg font-semibold' : h[1].length === 2 ? 'mt-4 mb-1.5 text-base font-semibold text-brand-strong' : 'mt-3 mb-1 text-sm font-semibold'
      blocks.push(<div key={blocks.length} role="heading" aria-level={h[1].length} className={cls}>{inline(h[2])}</div>)
    } else if (ul || ol) {
      flushPara()
      const ordered = !!ol && !ul
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] } }
      list.items.push((ul ?? ol)![1])
    } else if (/^\s*(---+|\*\*\*+)\s*$/.test(l)) {
      flushPara(); flushList()
      blocks.push(<hr key={blocks.length} className="my-3 border-line" />)
    } else if (!l.trim()) {
      flushPara(); flushList()
    } else {
      flushList()
      para.push(l)
    }
  }
  flushPara(); flushList()
  return <div className="text-sm leading-relaxed">{blocks}</div>
}
