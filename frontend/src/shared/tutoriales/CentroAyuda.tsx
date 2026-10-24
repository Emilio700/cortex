/**
 * Centro de ayuda: panel lateral que se abre con el «?» del encabezado.
 *
 * Arriba, lo de la pantalla abierta (un clic y arranca); después el recorrido
 * completo del rol y el índice de todos los temas con su estado; y siempre a
 * la mano, la búsqueda por palabra, que encuentra recorridos y pasos sueltos.
 *
 * Es un panel lateral (offcanvas) y no un menú desplegable porque en tableta y
 * celular un menú largo se corta, y aquí hay que poder leer. En pantallas
 * angostas ocupa todo el ancho.
 */
import { useEffect, useId, useRef, useState } from 'react'
import {
  CBadge,
  CButton,
  CCloseButton,
  CFormInput,
  COffcanvas,
  COffcanvasBody,
  COffcanvasHeader,
  COffcanvasTitle,
} from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilCheckAlt, cilMediaPlay, cilSearch } from '@coreui/icons'
import {
  useTutoriales,
  type Detalle,
  type EstadoCompleto,
  type EstadoRecorrido,
  type ModoInicio,
} from './TutorialesContext'
import type { GrupoRecorrido, Recorrido } from './tipos'
import { buscar, textoPlano, type PasoEncontrado } from './centro'
import LimiteDeError from './LimiteDeError'
import { NOVEDADES, VERSION_NOVEDADES } from './novedades'
import './centro-ayuda.css'

const ORDEN_GRUPOS: GrupoRecorrido[] = [
  'General',
  'Consulta médica',
  'Recepción',
  'Cobros',
  'Administración',
]

/** Pista corta de dónde se ve un recorrido que necesita datos o un formulario. */
const dondeSeVe = (r: Recorrido): string | null => {
  if (r.contexto) return 'Se ve con su formulario abierto.'
  if (r.ruta?.startsWith('/doctor/consultation')) return 'Se ve dentro de una consulta.'
  if (r.ruta?.includes('/record')) return 'Se ve en el expediente de un paciente.'
  if (r.ruta?.includes('/historial')) return 'Se ve en el historial de un paciente.'
  return null
}

/** Insignia del índice: Visto / A medias (X de Y) / Nuevo. */
export const InsigniaEstado = ({ estado }: { estado: EstadoRecorrido }) => {
  if (estado.tipo === 'visto') {
    return (
      <CBadge color="success" shape="rounded-pill" className="ms-1">
        <CIcon icon={cilCheckAlt} size="sm" className="me-1" aria-hidden="true" />
        Visto
      </CBadge>
    )
  }
  if (estado.tipo === 'a-medias') {
    return (
      <CBadge color="warning" textColor="dark" shape="rounded-pill" className="ms-1">
        A medias ({estado.paso} de {estado.total})
      </CBadge>
    )
  }
  return (
    <CBadge color="primary" shape="rounded-pill" className="ms-1">
      Nuevo
    </CBadge>
  )
}

/** Los botones de un recorrido según su estado: Ver, o Continuar y Empezar de nuevo. */
const AccionesRecorrido = ({
  recorrido,
  estado,
  onAbrir,
}: {
  recorrido: Recorrido
  estado: EstadoRecorrido
  onAbrir: (modo: ModoInicio) => void
}) => {
  if (estado.tipo === 'a-medias') {
    return (
      <div className="d-flex flex-wrap gap-2">
        <CButton
          size="sm"
          color="primary"
          onClick={() => onAbrir('continuar')}
          aria-label={`Continuar «${recorrido.titulo}» en el paso ${estado.paso} de ${estado.total}`}
        >
          <CIcon icon={cilMediaPlay} className="me-1" aria-hidden="true" />
          Continuar
        </CButton>
        <CButton
          size="sm"
          color="primary"
          variant="ghost"
          onClick={() => onAbrir('inicio')}
          aria-label={`Empezar de nuevo «${recorrido.titulo}»`}
        >
          Empezar de nuevo
        </CButton>
      </div>
    )
  }
  return (
    <CButton
      size="sm"
      color="primary"
      variant="outline"
      onClick={() => onAbrir('inicio')}
      aria-label={`Ver «${recorrido.titulo}»`}
    >
      <CIcon icon={cilMediaPlay} className="me-1" aria-hidden="true" />
      Ver
    </CButton>
  )
}

const FilaRecorrido = ({ recorrido }: { recorrido: Recorrido }) => {
  const { estado, abrir } = useTutoriales()
  const e = estado(recorrido)
  const pista = dondeSeVe(recorrido)
  return (
    <li className="list-group-item d-flex flex-wrap align-items-center gap-2 justify-content-between">
      <div style={{ flex: '1 1 200px' }}>
        <div className="fw-semibold">
          {recorrido.titulo} <InsigniaEstado estado={e} />
        </div>
        <div className="small text-body-secondary">{recorrido.resumen}</div>
        {pista && <div className="small text-body-secondary fst-italic">{pista}</div>}
      </div>
      <AccionesRecorrido
        recorrido={recorrido}
        estado={e}
        onAbrir={(modo) => abrir(recorrido.id, { modo })}
      />
    </li>
  )
}

/* ------------------------------------------------------------------ */

/**
 * «Novedades de la 1.2.0»: qué se movió y a dónde. Plegada salvo que se haya
 * pedido desde la franja; cada novedad lleva a su recorrido, si el rol lo ve.
 */
const SeccionNovedades = () => {
  const { disponibles, abrir, novedadesAbiertas, alternarNovedades } = useTutoriales()
  const idTitulo = useId()
  const idLista = useId()
  const ids = new Set(disponibles.map((r) => r.id))
  const visibles = NOVEDADES.map((n) => ({
    ...n,
    recorrido: n.recorridos.map((id) => disponibles.find((r) => r.id === id)).find(Boolean) ?? null,
  })).filter((n) => n.paraTodas || n.recorridos.some((id) => ids.has(id)))

  if (visibles.length === 0) return null

  return (
    <section aria-labelledby={idTitulo} className="mb-4 gems-novedades">
      <h3 id={idTitulo} className="h6 mb-2">
        <button
          type="button"
          className="gems-novedades__cabecera"
          aria-expanded={novedadesAbiertas}
          aria-controls={idLista}
          onClick={alternarNovedades}
        >
          <span className="gems-novedades__insignia">Nuevo</span>
          <span className="fw-bold">Novedades de la {VERSION_NOVEDADES}</span>
          <span className="small text-body-secondary ms-auto">
            {visibles.length} cambios {novedadesAbiertas ? '▴' : '▾'}
          </span>
        </button>
      </h3>
      {novedadesAbiertas && (
        <ul id={idLista} className="list-group">
          {visibles.map((n) => (
            <li key={n.id} className="list-group-item d-flex flex-column gap-1">
              <div className="fw-semibold">{n.titulo}</div>
              <div className="small text-body-secondary">{n.texto}</div>
              {n.recorrido && (
                <div>
                  <CButton
                    size="sm"
                    color="primary"
                    variant="outline"
                    onClick={() => abrir(n.recorrido!.id, { modo: 'inicio' })}
                    aria-label={`Ver el recorrido «${n.recorrido.titulo}»`}
                  >
                    <CIcon icon={cilMediaPlay} className="me-1" aria-hidden="true" />
                    Ver cómo funciona
                  </CButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const SeccionPantalla = ({ recorridos }: { recorridos: Recorrido[] }) => (
  <section aria-labelledby="ayuda-esta-pantalla" className="mb-4">
    <h3 id="ayuda-esta-pantalla" className="h6 fw-bold text-uppercase text-body-secondary mb-2">
      Esta pantalla
    </h3>
    {recorridos.length === 0 ? (
      <p className="small text-body-secondary mb-0">
        Esta pantalla no tiene un recorrido propio. Abajo están el recorrido completo y todos los
        temas, o búscalo por palabra.
      </p>
    ) : (
      <ul className="list-group">
        {recorridos.map((r) => (
          <FilaRecorrido key={r.id} recorrido={r} />
        ))}
      </ul>
    )}
  </section>
)

const SeccionCompleto = ({ completo }: { completo: EstadoCompleto }) => {
  const { empezarCompleto, continuarCompleto } = useTutoriales()
  const { definicion, aplicables, saltadas, tipo, actual, numero, total } = completo
  const hecha = (indice: number) =>
    tipo === 'visto' || (tipo === 'a-medias' && actual !== null && indice < actual.indice)

  return (
    <section aria-labelledby="ayuda-completo" className="mb-4">
      <h3 id="ayuda-completo" className="h6 fw-bold text-uppercase text-body-secondary mb-2">
        Recorrido completo
      </h3>
      <div className="border rounded-3 p-3 bg-body-tertiary">
        <div className="fw-semibold">
          {definicion.titulo} {tipo === 'visto' && <InsigniaEstado estado={{ tipo: 'visto' }} />}
        </div>
        <div className="small text-body-secondary mb-2">
          {definicion.resumen} Te lleva de una pantalla a otra; no guarda ni cambia nada.
        </div>
        <ol className="small ps-3 mb-2 gems-centro-etapas">
          {aplicables.map((e) => (
            <li
              key={e.indice}
              className={
                actual?.indice === e.indice && tipo === 'a-medias' ? 'fw-semibold' : undefined
              }
              aria-current={actual?.indice === e.indice && tipo === 'a-medias' ? 'step' : undefined}
            >
              {e.etapa.nombre}
              {hecha(e.indice) && (
                <CIcon
                  icon={cilCheckAlt}
                  size="sm"
                  className="ms-1 text-success"
                  title="Ya la viste"
                />
              )}
              {actual?.indice === e.indice && tipo === 'a-medias' && (
                <span className="text-body-secondary fw-normal"> — vas aquí</span>
              )}
            </li>
          ))}
        </ol>
        {saltadas.length > 0 && (
          <p className="small text-body-secondary mb-2">
            Se salta {saltadas.map((s) => `«${s.nombre}»`).join(', ')}: tu usuario no tiene acceso a{' '}
            {saltadas.length === 1 ? 'esa pantalla' : 'esas pantallas'}.
          </p>
        )}
        <div className="d-flex flex-wrap gap-2">
          {tipo === 'a-medias' && actual ? (
            <>
              <CButton color="primary" onClick={continuarCompleto}>
                <CIcon icon={cilMediaPlay} className="me-1" aria-hidden="true" />
                Continuar recorrido completo
                <span className="d-block small fw-normal">
                  Vas en {actual.etapa.nombre}, {numero} de {total}
                </span>
              </CButton>
              <CButton color="primary" variant="ghost" onClick={empezarCompleto}>
                Empezar de nuevo
              </CButton>
            </>
          ) : (
            <CButton color="primary" onClick={empezarCompleto}>
              <CIcon icon={cilMediaPlay} className="me-1" aria-hidden="true" />
              {tipo === 'visto' ? 'Repetir el recorrido completo' : 'Empezar recorrido completo'}
            </CButton>
          )}
        </div>
      </div>
    </section>
  )
}

const SeccionTemas = () => {
  const { disponibles, progresoGeneral, reiniciarVistos } = useTutoriales()
  const [confirmando, setConfirmando] = useState(false)
  const grupos = ORDEN_GRUPOS.map((grupo) => ({
    grupo,
    recorridos: disponibles.filter((r) => r.grupo === grupo),
  })).filter((g) => g.recorridos.length > 0)
  const { vistos, total } = progresoGeneral

  return (
    <section aria-labelledby="ayuda-temas">
      <h3 id="ayuda-temas" className="h6 fw-bold text-uppercase text-body-secondary mb-2">
        Todos los temas
      </h3>
      <div className="mb-3">
        <div className="small mb-1" id="ayuda-progreso">
          Completaste {vistos} de {total}
        </div>
        {/* Barra propia: la de CoreUI ponía el rol en un elemento y el nombre
            en otro, y el lector la anunciaba sin nombre (axe). */}
        <div
          className="progress"
          style={{ height: 8 }}
          role="progressbar"
          aria-labelledby="ayuda-progreso"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={vistos}
        >
          <div
            className="progress-bar bg-success"
            style={{ width: `${total ? (vistos / total) * 100 : 0}%` }}
          />
        </div>
      </div>
      {grupos.map(({ grupo, recorridos }) => (
        <div key={grupo} className="mb-3">
          <h4 className="h6 fw-semibold mb-2">{grupo}</h4>
          <ul className="list-group">
            {recorridos.map((r) => (
              <FilaRecorrido key={r.id} recorrido={r} />
            ))}
          </ul>
        </div>
      ))}
      <div className="border-top pt-3 mt-2">
        {confirmando ? (
          <div className="small">
            <p className="mb-2">
              Todos tus recorridos quedarán como nuevos y se borra lo que dejaste a medias. ¿Seguro?
            </p>
            <div className="d-flex gap-2">
              <CButton
                size="sm"
                color="danger"
                variant="outline"
                onClick={() => {
                  reiniciarVistos()
                  setConfirmando(false)
                }}
              >
                Sí, reiniciar mi avance
              </CButton>
              <CButton
                size="sm"
                color="secondary"
                variant="ghost"
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </CButton>
            </div>
          </div>
        ) : (
          <CButton size="sm" color="secondary" variant="ghost" onClick={() => setConfirmando(true)}>
            Reiniciar mi avance en los recorridos
          </CButton>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const TEXTO_RAZON: Record<Detalle['razon'], string> = {
  datos: '',
  formulario: '',
  'sin-elementos':
    'En esta pantalla no hay ahora nada que señalar para este recorrido: puede que aún esté cargando, que la lista esté vacía o que la consulta ya esté cerrada.',
  'paso-no-visible':
    'Ese paso no está a la vista en este momento: puede estar en una sección cerrada, en un formulario o en otra pantalla.',
}

/**
 * Lo que se muestra cuando un recorrido no se puede ver desde aquí: cómo
 * llegar, y los pasos para leerlos sin salir. Así nadie se queda sin la
 * explicación por no tener una consulta abierta, y el sistema no elige una
 * paciente por ella.
 */
const VistaDetalle = ({ detalle }: { detalle: Detalle }) => {
  const {
    disponibles,
    completo,
    cerrarDetalle,
    marcarLeido,
    saltarEtapa,
    pausarCompleto,
    abrir,
    irA,
    puedeIrA,
  } = useTutoriales()
  const recorrido = disponibles.find((r) => r.id === detalle.recorridoId)
  const pasoRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    pasoRef.current?.scrollIntoView?.({ block: 'center' })
  }, [detalle.paso])

  if (!recorrido) return null
  const enCompleto = detalle.enCompleto && completo?.actual?.recorrido.id === recorrido.id
  const explicacion =
    detalle.razon === 'datos' || detalle.razon === 'formulario'
      ? (recorrido.comoLlegar ?? 'Este recorrido se ve en otra pantalla.')
      : TEXTO_RAZON[detalle.razon]
  const destino = recorrido.irA && puedeIrA(recorrido.irA.ruta) ? recorrido.irA : null

  return (
    <section aria-labelledby="ayuda-detalle">
      <CButton
        size="sm"
        color="secondary"
        variant="ghost"
        className="mb-2 px-1"
        onClick={cerrarDetalle}
      >
        ← Volver al centro de ayuda
      </CButton>
      {enCompleto && completo?.actual && (
        <div className="small text-body-secondary mb-1">
          Recorrido completo · {completo.actual.etapa.nombre} ({completo.numero} de {completo.total}
          )
        </div>
      )}
      <h3 id="ayuda-detalle" className="h5 fw-bold mb-2">
        {recorrido.titulo}
      </h3>
      <div
        className="alert alert-info small py-2"
        // Los textos vienen del catálogo, escrito por el equipo, no de la persona.
        dangerouslySetInnerHTML={{ __html: explicacion }}
      />
      <div className="d-flex flex-wrap gap-2 mb-3">
        {destino && (
          <CButton color="primary" variant="outline" size="sm" onClick={() => irA(destino.ruta)}>
            Ir a {destino.nombre}
          </CButton>
        )}
        {(detalle.razon === 'sin-elementos' || detalle.razon === 'paso-no-visible') && (
          <CButton
            color="primary"
            variant="outline"
            size="sm"
            onClick={() => abrir(recorrido.id, { modo: 'inicio' })}
          >
            Intentar verlo en pantalla
          </CButton>
        )}
        {enCompleto && (
          <>
            <CButton color="secondary" variant="outline" size="sm" onClick={saltarEtapa}>
              Saltar esta parte
            </CButton>
            <CButton color="secondary" variant="ghost" size="sm" onClick={pausarCompleto}>
              Pausar el recorrido completo
            </CButton>
          </>
        )}
      </div>
      <h4 className="h6 fw-semibold">Léelo aquí</h4>
      <ol className="ps-3 gems-centro-lectura">
        {recorrido.pasos.map((paso, i) => (
          <li
            key={i}
            ref={detalle.paso === i ? pasoRef : undefined}
            className={detalle.paso === i ? 'gems-centro-paso-buscado' : undefined}
            aria-current={detalle.paso === i ? 'step' : undefined}
          >
            <div className="fw-semibold">{paso.titulo}</div>
            <div className="small" dangerouslySetInnerHTML={{ __html: paso.texto }} />
          </li>
        ))}
      </ol>
      <CButton
        color="success"
        variant="outline"
        size="sm"
        onClick={() => marcarLeido(recorrido.id)}
      >
        <CIcon icon={cilCheckAlt} className="me-1" aria-hidden="true" />
        {enCompleto ? 'Ya lo leí, seguir con el recorrido completo' : 'Ya lo leí'}
      </CButton>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const resumir = (html: string, max = 110) => {
  const plano = textoPlano(html)
  return plano.length > max ? `${plano.slice(0, max).trimEnd()}…` : plano
}

const Resultados = ({ consulta }: { consulta: string }) => {
  const { disponibles, estado, abrir } = useTutoriales()
  const { recorridos, pasos } = buscar(disponibles, consulta)
  const irAlPaso = (p: PasoEncontrado) => abrir(p.recorrido.id, { desdePaso: p.indice })

  if (recorridos.length === 0 && pasos.length === 0) {
    return (
      <p className="small text-body-secondary" role="status">
        No encontramos «{consulta.trim()}». Prueba con otra palabra, como «receta», «cobrar» o
        «signos».
      </p>
    )
  }

  return (
    <div>
      <p className="visually-hidden" role="status">
        {recorridos.length} recorridos y {pasos.length} pasos encontrados.
      </p>
      {recorridos.length > 0 && (
        <section aria-labelledby="ayuda-res-recorridos" className="mb-3">
          <h3
            id="ayuda-res-recorridos"
            className="h6 fw-bold text-uppercase text-body-secondary mb-2"
          >
            Recorridos
          </h3>
          <ul className="list-group">
            {recorridos.map((r) => (
              <li
                key={r.id}
                className="list-group-item d-flex flex-wrap align-items-center gap-2 justify-content-between"
              >
                <div style={{ flex: '1 1 200px' }}>
                  <div className="fw-semibold">
                    {r.titulo} <InsigniaEstado estado={estado(r)} />
                  </div>
                  <div className="small text-body-secondary">{r.resumen}</div>
                </div>
                <AccionesRecorrido
                  recorrido={r}
                  estado={estado(r)}
                  onAbrir={(modo) => abrir(r.id, { modo })}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {pasos.length > 0 && (
        <section aria-labelledby="ayuda-res-pasos">
          <h3 id="ayuda-res-pasos" className="h6 fw-bold text-uppercase text-body-secondary mb-2">
            Pasos
          </h3>
          <div className="list-group">
            {pasos.map((p) => (
              <button
                key={`${p.recorrido.id}-${p.indice}`}
                type="button"
                className="list-group-item list-group-item-action"
                onClick={() => irAlPaso(p)}
                aria-label={`Ir al paso «${p.paso.titulo}» de «${p.recorrido.titulo}»`}
              >
                <div className="fw-semibold">{p.paso.titulo}</div>
                <div className="small text-body-secondary">en «{p.recorrido.titulo}»</div>
                <div className="small">{resumir(p.paso.texto)}</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

const Contenido = () => {
  const { deEstaPantalla, completo, detalle, centroAbierto } = useTutoriales()
  const [consulta, setConsulta] = useState('')
  const [dePantalla, setDePantalla] = useState<Recorrido[]>([])
  const idBusqueda = useId()

  // «Esta pantalla» depende de lo que haya a la vista al abrir (un formulario
  // abierto, por ejemplo), no de cuando se montó el panel.
  useEffect(() => {
    if (!centroAbierto) return
    setDePantalla(deEstaPantalla())
  }, [centroAbierto])

  // Una etapa explicada se muestra aunque hubiera una búsqueda escrita.
  useEffect(() => {
    if (detalle) setConsulta('')
  }, [detalle])

  return (
    <>
      <div className="mb-3">
        <label htmlFor={idBusqueda} className="form-label small fw-semibold mb-1">
          Buscar en la ayuda
        </label>
        <div className="input-group">
          <span className="input-group-text" aria-hidden="true">
            <CIcon icon={cilSearch} />
          </span>
          <CFormInput
            id={idBusqueda}
            type="search"
            placeholder="Ej.: receta, cobrar, signos"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            autoComplete="off"
          />
          {consulta && (
            <CButton color="secondary" variant="outline" onClick={() => setConsulta('')}>
              Borrar
            </CButton>
          )}
        </div>
      </div>
      {consulta.trim() ? (
        <Resultados consulta={consulta} />
      ) : detalle ? (
        <VistaDetalle detalle={detalle} />
      ) : (
        <>
          <SeccionNovedades />
          <SeccionPantalla recorridos={dePantalla} />
          {completo && <SeccionCompleto completo={completo} />}
          <SeccionTemas />
        </>
      )}
    </>
  )
}

const CentroAyuda = () => {
  const { centroAbierto, cerrarCentro } = useTutoriales()
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const idTitulo = useId()

  // El foco va al título y no a la búsqueda: en tableta y celular, enfocar un
  // campo abre el teclado y tapa medio panel sin que nadie lo pidiera.
  useEffect(() => {
    if (!centroAbierto) return
    const t = setTimeout(() => tituloRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [centroAbierto])

  // El panel queda en el documento aunque esté cerrado; su contenido no, para
  // que nada de la ayuda se evalúe ni se lea en voz alta mientras no se usa.
  // Se retira hasta que termina la animación de cierre.
  const [conContenido, setConContenido] = useState(centroAbierto)
  useEffect(() => {
    if (centroAbierto) {
      setConContenido(true)
      return
    }
    const t = setTimeout(() => setConContenido(false), 300)
    return () => clearTimeout(t)
  }, [centroAbierto])

  return (
    <COffcanvas
      placement="end"
      visible={centroAbierto}
      // Sólo cuando lo cierra la persona (Esc, clic fuera): si lo cerró el
      // propio centro para arrancar un recorrido, no hay nada que sincronizar.
      onHide={() => {
        if (centroAbierto) cerrarCentro()
      }}
      portal
      className="gems-centro-ayuda"
      aria-labelledby={idTitulo}
    >
      <COffcanvasHeader className="border-bottom">
        {/* h2: las secciones del centro van en h3 debajo de él (axe, heading-order). */}
        <COffcanvasTitle as="h2" className="h5" id={idTitulo} ref={tituloRef} tabIndex={-1}>
          Centro de ayuda
        </COffcanvasTitle>
        <CCloseButton
          className="text-reset"
          onClick={cerrarCentro}
          aria-label="Cerrar el centro de ayuda"
        />
      </COffcanvasHeader>
      <COffcanvasBody>
        <p className="small text-body-secondary">
          Recorridos cortos que señalan cada parte de la pantalla y explican para qué sirve. No
          guardan ni cambian nada, y se cierran con la ✕ o con la tecla Esc.
        </p>
        <LimiteDeError
          alternativa={
            <p className="small text-body-secondary" role="status">
              La ayuda no está disponible en este momento. Todo lo demás sigue funcionando normal.
            </p>
          }
        >
          {conContenido && <Contenido />}
        </LimiteDeError>
      </COffcanvasBody>
    </COffcanvas>
  )
}

export default CentroAyuda
