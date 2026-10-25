import { Suspense, useEffect, useMemo, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { Menu, Moon, Search, Sun, X, Plus, Lock, CloudUpload, WifiOff, FlaskConical, Loader2, RotateCcw } from 'lucide-react'
import { GROUPS, MODULES, canAccess, type ModuleDef } from './modules/registry'
import { useSettings, updateSettings, useCollection, setActivePatient, storageOk, usePendingWrites } from './lib/store'
import { boot, logout, retryLoad, useSession } from './lib/session'
import { Button, PatientPicker, useDialog } from './components/ui'
import { Toaster } from './components/toast'
import { Dialogos } from './components/dialogos'
import { ErrorBoundary } from './components/ErrorBoundary'
import { IdleWatcher, LoginPage, UserMenu } from './components/auth'
import { cx, nombreCompleto } from './lib/utils'

/** Módulos que el usuario actual puede abrir (por rol en modo servidor). */
function useModulosVisibles() {
  const ses = useSession()
  return useMemo(() => MODULES.filter((m) => canAccess(m, ses.mode, ses.user)), [ses.mode, ses.user])
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mods = useModulosVisibles()
  return (
    <>
      <div className={cx('fixed inset-0 z-30 bg-black/40 lg:hidden', open ? 'block' : 'hidden')} onClick={onClose} />
      <aside
        className={cx(
          'no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line px-4">
          <div className="grid size-8 place-items-center rounded-lg bg-brand text-white dark:text-black">
            <Plus className="size-5" strokeWidth={3} />
          </div>
          <div className="font-semibold tracking-tight">MediSuite</div>
          <button className="ml-auto lg:hidden" onClick={onClose} aria-label="Cerrar menú">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Módulos">
          {GROUPS.filter((g) => mods.some((m) => m.group === g && !m.hidden)).map((g) => (
            <div key={g} className="mb-3">
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</div>
              {mods.filter((m) => m.group === g && !m.hidden).map((m) => (
                <NavLink
                  key={m.id}
                  to={'/' + m.path.replace('/*', '')}
                  end={m.path === ''}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cx('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm', isActive ? 'bg-brand-soft font-medium text-brand-strong' : 'text-ink/80 hover:bg-surface-2')
                  }
                >
                  <m.icon className="size-4 shrink-0" />
                  {m.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const nav = useNavigate()
  const patients = useCollection('patients')
  const visibles = useModulosVisibles()
  const ref = useDialog(open, onClose)
  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
    }
  }, [open])
  const items = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const nq = norm(q)
    const mods = visibles.filter((m) => !m.hidden && norm(m.label + ' ' + m.description).includes(nq)).map((m) => ({
      key: 'm' + m.id,
      label: m.label,
      sub: m.description,
      run: () => nav('/' + m.path.replace('/*', '')),
    }))
    const pts = patients
      .filter((p) => norm(nombreCompleto(p) + ' ' + (p.curp ?? '')).includes(nq))
      .map((p) => ({
        key: 'p' + p.id,
        label: nombreCompleto(p),
        sub: 'Abrir expediente',
        run: () => {
          setActivePatient(p.id)
          nav('/pacientes/' + p.id)
        },
      }))
    return (q ? [...pts, ...mods] : [...mods.slice(0, 6), ...pts.slice(0, 5)]).slice(0, 12)
  }, [q, patients, nav, visibles])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar paciente o herramienta"
        className="mx-auto max-w-xl overflow-hidden rounded-xl bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-muted" aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="paleta-resultados"
            aria-activedescendant={items[sel] ? 'paleta-' + items[sel].key : undefined}
            aria-autocomplete="list"
            aria-label="Buscar paciente o herramienta"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSel(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, items.length - 1))
              if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
              if (e.key === 'Enter' && items[sel]) {
                items[sel].run()
                onClose()
              }
            }}
            placeholder="Buscar paciente o herramienta…"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <ul className="max-h-80 overflow-auto p-1" id="paleta-resultados" role="listbox" aria-label="Resultados">
          {items.map((it, i) => (
            <li
              key={it.key}
              id={'paleta-' + it.key}
              role="option"
              aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                it.run()
                onClose()
              }}
              className={cx('flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm', i === sel && 'bg-surface-2')}
            >
              <span className="font-medium">{it.label}</span>
              <span className="text-xs text-muted">{it.sub}</span>
            </li>
          ))}
          {items.length === 0 && <li role="presentation" className="px-3 py-6 text-center text-sm text-muted">Sin resultados</li>}
        </ul>
      </div>
    </div>
  )
}

function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => {
      window.removeEventListener('online', a)
      window.removeEventListener('offline', b)
    }
  }, [])
  return on
}

function Banners({ server }: { server: boolean }) {
  const online = useOnline()
  return (
    <>
      {!server && (
        <div className="no-print flex items-center justify-center gap-1.5 bg-brand-soft/70 px-4 py-1 text-center text-xs text-brand-strong">
          <FlaskConical className="size-3.5 shrink-0" />
          <span>
            <b>Modo demo</b> — datos en este navegador<span className="hidden sm:inline"> (sintéticos, no se envían a ningún servidor)</span>
          </span>
        </div>
      )}
      {!server && !storageOk && (
        <div className="bg-warn/15 px-4 py-1.5 text-center text-xs text-warn">Este navegador bloquea el almacenamiento local: los cambios se pierden al recargar.</div>
      )}
      {!online && (
        <div className="no-print flex items-center justify-center gap-1.5 bg-danger/12 px-4 py-1.5 text-center text-xs font-medium text-danger" role="alert">
          <WifiOff className="size-3.5 shrink-0" />
          {server ? 'Sin conexión a internet: los cambios no se guardarán hasta que vuelva la conexión.' : 'Sin conexión a internet: las funciones en línea (IA, telemedicina) no estarán disponibles.'}
        </div>
      )}
    </>
  )
}

function PendingIndicator() {
  const n = usePendingWrites()
  if (!n) return null
  return (
    <span className="hidden items-center gap-1 text-xs text-muted sm:flex" title={`${n} cambio(s) por confirmar`}>
      <CloudUpload className="size-3.5 animate-pulse" /> Guardando…
    </span>
  )
}

function SinPermiso({ m }: { m: ModuleDef }) {
  const ses = useSession()
  const soloServidor = m.serverOnly && ses.mode !== 'server'
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2">
        <Lock className="size-6 text-muted" />
      </div>
      <h1 className="mt-3 text-lg font-semibold">{soloServidor ? `${m.label} no está disponible en modo demo` : 'Sin permiso'}</h1>
      <p className="mt-1 text-sm text-muted">
        {soloServidor
          ? 'Esta sección administra cuentas y registros del servidor. Conecta MediSuite a su backend para usarla.'
          : `Tu rol no tiene acceso a «${m.label}». Si lo necesitas, pide al administrador que cambie tu rol.`}
      </p>
      <NavLinkHome />
    </div>
  )
}
function NavLinkHome() {
  const nav = useNavigate()
  return (
    <Button className="mt-4" onClick={() => nav('/')}>
      Ir al inicio
    </Button>
  )
}

function Skeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse px-4 py-5 sm:px-6" aria-busy="true" aria-label="Cargando datos">
      <div className="mb-2 h-7 w-56 rounded-lg bg-surface-2" />
      <div className="mb-6 h-4 w-80 max-w-full rounded bg-surface-2" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="h-72 rounded-xl border border-line bg-surface lg:col-span-2" />
        <div className="h-72 rounded-xl border border-line bg-surface" />
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Cargando expedientes del servidor…
      </p>
    </div>
  )
}

function Shell() {
  const [menu, setMenu] = useState(false)
  const [palette, setPalette] = useState(false)
  const settings = useSettings()
  const ses = useSession()
  const loc = useLocation()
  const server = ses.mode === 'server'
  const dark = settings.tema === 'oscuro'
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((p) => !p)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const loading = ses.status === 'loading'
  return (
    <div className="flex min-h-screen">
      <a href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById('contenido')?.focus() }} className="sr-only z-[80] rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3 dark:text-black">
        Saltar al contenido
      </a>
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-4">
          <button className="lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>
          <button
            onClick={() => setPalette(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 text-sm text-muted sm:max-w-sm"
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K"
          >
            <Search className="size-4 shrink-0" />
            <span className="truncate">Buscar paciente o herramienta</span>
            <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto hidden w-64 md:block">
            <PatientPicker compact />
          </div>
          {server && <PendingIndicator />}
          <button
            className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-surface-2"
            onClick={() => updateSettings({ tema: dark ? 'claro' : 'oscuro' })}
            aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {server && <UserMenu />}
        </header>
        <Banners server={server} />
        <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {loading ? (
            <Skeleton />
          ) : (
            <Suspense fallback={<div className="p-8 text-sm text-muted">Cargando…</div>}>
              <Routes>
                {MODULES.filter((m) => !m.public).map((m) => (
                  <Route
                    key={m.id}
                    path={'/' + m.path}
                    element={
                      canAccess(m, ses.mode, ses.user) ? (
                        <ErrorBoundary label={m.label} resetKey={loc.pathname}>
                          <m.component />
                        </ErrorBoundary>
                      ) : (
                        <SinPermiso m={m} />
                      )
                    }
                  />
                ))}
                <Route path="*" element={<div className="p-8 text-sm text-muted">Página no encontrada</div>} />
              </Routes>
            </Suspense>
          )}
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      {server && ses.status === 'ready' && <IdleWatcher />}
    </div>
  )
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-sm text-muted">
        <div className="grid size-11 place-items-center rounded-xl bg-brand text-white dark:text-black">
          <Plus className="size-7" strokeWidth={3} />
        </div>
        <Loader2 className="size-5 animate-spin" />
      </div>
    </div>
  )
}

function ErrorCarga() {
  const ses = useSession()
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 text-center shadow-sm">
        <h1 className="font-semibold">No se pudieron cargar los datos</h1>
        <p className="mt-1 text-sm text-muted">{ses.error ?? 'Error desconocido.'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => logout()}>Cerrar sesión</Button>
          <Button variant="primary" onClick={() => retryLoad()}>
            <RotateCcw className="size-4" /> Reintentar
          </Button>
        </div>
      </div>
    </div>
  )
}

/** El backend no responde (modo servidor): nunca se cae a modo demo con datos locales. */
function ServidorNoDisponible() {
  const ses = useSession()
  const [busy, setBusy] = useState(false)
  return (
    <main id="contenido" className="grid min-h-screen place-items-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 text-center shadow-sm" role="alert">
        <WifiOff className="mx-auto size-8 text-warn" aria-hidden />
        <h1 className="mt-2 font-semibold">Servidor no disponible</h1>
        <p className="mt-1 text-sm text-muted">No pudimos conectar con el servidor de MediSuite. Revisa tu conexión a internet; si el problema continúa, avisa al administrador.</p>
        {ses.message && <p className="mt-2 text-xs text-muted">{ses.message}</p>}
        <Button
          variant="primary"
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await boot()
            setBusy(false)
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} Reintentar
        </Button>
      </div>
    </main>
  )
}

function Root() {
  const ses = useSession()
  const settings = useSettings()
  const loc = useLocation()
  const dark = settings.tema === 'oscuro'
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  // La verificación de recetas es pública: sin menú y sin sesión
  const pub = MODULES.find((m) => m.public && loc.pathname.startsWith('/' + m.path))
  if (pub) {
    const V = pub.component
    return (
      <ErrorBoundary label={pub.label}>
        <Suspense fallback={null}>
          <V />
        </Suspense>
      </ErrorBoundary>
    )
  }
  if (ses.status === 'init') return <Splash />
  if (ses.mode === 'server' && ses.status === 'offline') return <ServidorNoDisponible />
  if (ses.mode === 'server' && ses.status === 'anon') return <LoginPage />
  if (ses.status === 'error') return <ErrorCarga />
  return <Shell />
}

export default function App() {
  return (
    <HashRouter>
      <Root />
      <Toaster />
      <Dialogos />
    </HashRouter>
  )
}
