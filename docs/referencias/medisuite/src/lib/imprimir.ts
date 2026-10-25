// Impresión de un documento HTML sin scripts en línea (compatible con CSP `script-src 'self'`):
// se escribe en un iframe oculto del mismo origen y se llama a print() desde esta ventana.
export function imprimirHTML(html: string, titulo = 'Documento') {
  const f = document.createElement('iframe')
  f.setAttribute('aria-hidden', 'true')
  f.title = titulo
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' })
  document.body.appendChild(f)
  const doc = f.contentDocument
  const win = f.contentWindow
  if (!doc || !win) return f.remove()
  doc.open()
  doc.write(html.replace(/<script[\s\S]*?<\/script>/gi, ''))
  doc.close()
  const lanzar = () => {
    try {
      win.focus()
      win.print()
    } finally {
      setTimeout(() => f.remove(), 60_000)
    }
  }
  // espera a que carguen imágenes/estilos del documento
  if (doc.readyState === 'complete') setTimeout(lanzar, 50)
  else win.addEventListener('load', () => setTimeout(lanzar, 50), { once: true })
}
