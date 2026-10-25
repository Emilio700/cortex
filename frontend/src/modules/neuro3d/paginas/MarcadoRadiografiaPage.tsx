/**
 * Columna desde radiografía: el médico marca puntos sobre la lateral y la AP
 * del paciente y Neuro 3D dobla su columna esquemática a esas medidas.
 *
 * Es una **aproximación**: la forma de cada vértebra sigue siendo la del modelo.
 * La pantalla lo dice arriba, fijo. Los ángulos se calculan en vivo como
 * sugerencia; los que se guardan los calcula el servidor, y sólo después de su
 * respuesta aparece «Guardado».
 *
 * Si el guardado falla a media consulta, los puntos se quedan en la pantalla:
 * se puede reintentar sin volver a marcar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CAlert,
  CBadge,
  CButton,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CFormTextarea,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CNav,
  CNavItem,
  CNavLink,
  CSpinner,
} from '@coreui/react-pro'
import { cil3d } from '@coreui/icons'

import { EncabezadoPantalla } from '../../../shared/components/EncabezadoPantalla'
import { useAuth } from '../../../shared/context/AuthContext'
import { mensajeDeError } from '../../../shared/utils/errors'
import { formatearInstante } from '../../../shared/utils/date'
import { enMayusculas } from '../../../shared/utils/mayusculas'
import { rutaDelExpediente } from '../../expediente/rutas'
import {
  calcularRx,
  OPCIONES_POR_OMISION,
  VERTEBRAS_RX,
  type Calibracion,
  type CalibracionesRx,
  type OpcionesRx,
  type Punto,
} from '../dominio/ajusteRadiografico'
import {
  ESTADO_INICIAL,
  RANGO_AP_POR_OMISION,
  RANGO_LATERAL_POR_OMISION,
  avance,
  colocar,
  deshacer,
  marcasDe,
  pasoPendiente,
  planDeMarcado,
  saltar,
  type EstadoMarcado,
  type RangoRx,
  type VistaRx,
} from '../dominio/marcadoRadiografia'
import { AVISO_ORIGEN } from '../dominio/origenModelo'
import MarcadorRadiografia, { type ModoMarcado } from '../componentes/MarcadorRadiografia'
import PanelMedicionesRx from '../componentes/PanelMedicionesRx'
import { atlasApi } from '../servicios/atlasApi'
import { columnaRxApi, type AjusteRxGuardado, type FuenteRx } from '../servicios/columnaRxApi'
import '../ui/atlas.css'
import '../ui/radiografia.css'

type Imagen = { tipo: 'vacia' } | { tipo: 'cargando' } | { tipo: 'lista'; url: string; ancho: number; alto: number } | { tipo: 'error'; mensaje: string }
type TipoDeEscala = Calibracion['tipo']

const NOMBRE: Record<VistaRx, string> = { lateral: 'Lateral', ap: 'AP' }
const claveDeFuente = (f: FuenteRx) => `${f.origen.tipo}:${f.origen.id}`

/** Mide una imagen ya descargada (las fotos no traen su tamaño en el expediente). */
const medirImagen = (url: string) =>
  new Promise<{ ancho: number; alto: number }>((resolver, rechazar) => {
    const img = new Image()
    img.onload = () => resolver({ ancho: img.naturalWidth, alto: img.naturalHeight })
    img.onerror = () => rechazar(new Error('No se pudo abrir la imagen.'))
    img.src = url
  })

export default function MarcadoRadiografiaPage() {
  const { patientId: texto } = useParams<{ patientId: string }>()
  const patientId = Number(texto)
  const navigate = useNavigate()
  const { can } = useAuth()

  const [nombrePaciente, setNombrePaciente] = useState<string | null>(null)
  const [fuentes, setFuentes] = useState<FuenteRx[] | null>(null)
  const [errorFuentes, setErrorFuentes] = useState<string | null>(null)
  const [vista, setVista] = useState<VistaRx>('lateral')
  const [fuente, setFuente] = useState<Record<VistaRx, FuenteRx | null>>({ lateral: null, ap: null })
  const [imagen, setImagen] = useState<Record<VistaRx, Imagen>>({ lateral: { tipo: 'vacia' }, ap: { tipo: 'vacia' } })
  const [estado, setEstado] = useState<EstadoMarcado>(ESTADO_INICIAL)
  const [rangos, setRangos] = useState<Record<VistaRx, RangoRx>>({ lateral: RANGO_LATERAL_POR_OMISION, ap: RANGO_AP_POR_OMISION })
  const [conPelvis, setConPelvis] = useState(true)
  const [escala, setEscala] = useState<Record<VistaRx, TipoDeEscala>>({ lateral: 'ninguna', ap: 'ninguna' })
  const [referencia, setReferencia] = useState<Record<VistaRx, { a: Punto | null; b: Punto | null; mm: string }>>({
    lateral: { a: null, b: null, mm: '' },
    ap: { a: null, b: null, mm: '' },
  })
  const [opciones, setOpciones] = useState<OpcionesRx>(OPCIONES_POR_OMISION)
  const [modo, setModo] = useState<ModoMarcado>('marcar')
  const [zoom, setZoom] = useState(1)
  const [guardando, setGuardando] = useState(false)
  const [resultadoGuardado, setResultadoGuardado] = useState<{ ajuste: AjusteRxGuardado; coincide: boolean } | null>(null)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)
  const [ajustes, setAjustes] = useState<AjusteRxGuardado[]>([])
  const [anulando, setAnulando] = useState<AjusteRxGuardado | null>(null)

  const puedeGuardar = can('spine_rx.write')

  // ── Datos del paciente ───────────────────────────────────────────────────
  useEffect(() => {
    let vigente = true
    atlasApi.nombreDelPaciente(patientId).then((n) => vigente && setNombrePaciente(n)).catch(() => undefined)
    columnaRxApi
      .fuentes(patientId)
      .then((f) => vigente && setFuentes(f))
      .catch((err) => vigente && setErrorFuentes(mensajeDeError(err, 'No se pudieron cargar las imágenes del paciente.')))
    return () => {
      vigente = false
    }
  }, [patientId])

  const cargarAjustes = useCallback(() => {
    columnaRxApi.listar(patientId).then(setAjustes).catch(() => setAjustes([]))
  }, [patientId])
  useEffect(cargarAjustes, [cargarAjustes])

  // Libera las imágenes al salir: pueden pesar varios MB.
  useEffect(
    () => () => {
      for (const v of ['lateral', 'ap'] as const) {
        const i = imagen[v]
        if (i.tipo === 'lista') URL.revokeObjectURL(i.url)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const elegirFuente = async (v: VistaRx, f: FuenteRx | null) => {
    const anterior = imagen[v]
    if (anterior.tipo === 'lista') URL.revokeObjectURL(anterior.url)
    setFuente((x) => ({ ...x, [v]: f }))
    setEscala((x) => ({ ...x, [v]: 'ninguna' }))
    setReferencia((x) => ({ ...x, [v]: { a: null, b: null, mm: '' } }))
    if (!f) {
      setImagen((x) => ({ ...x, [v]: { tipo: 'vacia' } }))
      return
    }
    setImagen((x) => ({ ...x, [v]: { tipo: 'cargando' } }))
    try {
      let lista: { url: string; ancho: number; alto: number }
      if (f.origen.tipo === 'imagen_clinica') {
        const url = URL.createObjectURL(await columnaRxApi.foto(f.origen.id))
        lista = { url, ...(await medirImagen(url)) }
      } else {
        const { radiografiaDeSerie } = await import('../servicios/radiografiaDicom')
        lista = await radiografiaDeSerie(f.origen.id)
      }
      setImagen((x) => ({ ...x, [v]: { tipo: 'lista', ...lista } }))
      setZoom(1)
    } catch (err) {
      setImagen((x) => ({ ...x, [v]: { tipo: 'error', mensaje: mensajeDeError(err, 'No se pudo abrir la radiografía. Elige otra o vuelve a intentarlo.') } }))
    }
  }

  // ── Marcado ──────────────────────────────────────────────────────────────
  const plan = useMemo(() => planDeMarcado(vista, rangos[vista], conPelvis), [vista, rangos, conPelvis])
  const pendiente = pasoPendiente(plan, estado)
  const progreso = avance(plan, estado)
  const puntosDeVista = estado.puntos[vista]
  const hayPuntos = (v: VistaRx) => Object.keys(estado.puntos[v]).length > 0

  const cambiarEstado = (siguiente: EstadoMarcado) => {
    setEstado(siguiente)
    setResultadoGuardado(null)
  }

  const borrarVista = (v: VistaRx) => {
    const puntos = { ...estado.puntos, [v]: {} }
    cambiarEstado({ puntos, saltados: estado.saltados.filter((s) => !s.startsWith(`${v}:`)), historial: estado.historial.filter((h) => h.vista !== v) })
  }

  // ── Escala ───────────────────────────────────────────────────────────────
  const calibracionDe = (v: VistaRx): Calibracion => {
    const tipo = escala[v]
    if (tipo === 'dicom' && fuente[v]?.espaciado) return { tipo: 'dicom', mmPorPxX: fuente[v]!.espaciado!.x, mmPorPxY: fuente[v]!.espaciado!.y }
    const ref = referencia[v]
    const mm = Number(ref.mm)
    if (tipo === 'referencia' && ref.a && ref.b && mm > 0) return { tipo: 'referencia', a: ref.a, b: ref.b, mm }
    return { tipo: 'ninguna' }
  }
  const calibraciones: CalibracionesRx = { lateral: calibracionDe('lateral'), ap: calibracionDe('ap') }

  const resultado = useMemo(
    () => calcularRx(marcasDe(estado), calibraciones, opciones),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [estado, JSON.stringify(calibraciones), opciones],
  )

  // ── Guardar ──────────────────────────────────────────────────────────────
  const listoParaGuardar = (fuente.lateral && hayPuntos('lateral')) || (fuente.ap && hayPuntos('ap'))
  const guardar = async () => {
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const ajuste = await columnaRxApi.guardar(patientId, {
        lateral: fuente.lateral && hayPuntos('lateral') ? fuente.lateral.origen : null,
        ap: fuente.ap && hayPuntos('ap') ? fuente.ap.origen : null,
        puntos: marcasDe({
          ...estado,
          puntos: {
            lateral: fuente.lateral ? estado.puntos.lateral : {},
            ap: fuente.ap ? estado.puntos.ap : {},
          },
        }),
        calibracion: calibraciones,
        opciones,
      })
      // Lo que se muestra desde aquí es lo del servidor. Si no coincide con la
      // sugerencia, se dice: el médico vio otros números mientras marcaba.
      const coincide = JSON.stringify(ajuste.mediciones.lordosisLumbar) === JSON.stringify(resultado.lordosisLumbar)
        && JSON.stringify(ajuste.mediciones.cobbCoronal) === JSON.stringify(resultado.cobbCoronal)
        && JSON.stringify(ajuste.mediciones.pelvis) === JSON.stringify(resultado.pelvis)
      setResultadoGuardado({ ajuste, coincide })
      cargarAjustes()
    } catch (err) {
      setErrorGuardar(mensajeDeError(err, 'No se pudo guardar el ajuste. Tus puntos siguen aquí: vuelve a intentarlo.'))
    } finally {
      setGuardando(false)
    }
  }

  const img = imagen[vista]
  const f = fuente[vista]
  const ref = referencia[vista]
  const opcionesFuentes = fuentes ?? []

  return (
    <div className="atlas-neuro rx-pagina">
      <EncabezadoPantalla
        titulo="Columna desde radiografía"
        descripcion="Marca puntos sobre la lateral y la AP para ajustar la columna de Neuro 3D a las medidas del paciente."
        icono={cil3d}
        padre={{ nombre: 'Expediente', ruta: rutaDelExpediente(patientId) }}
        insignia={
          <CBadge color="light" className="text-dark">
            {nombrePaciente ? `Paciente: ${nombrePaciente}` : 'Paciente en contexto'}
          </CBadge>
        }
        acciones={
          <Link to={`/pacientes/${patientId}/neuro-3d?origen=radiografia`} className="btn btn-light" data-tour="rx-ver-3d">
            Ver en Neuro 3D
          </Link>
        }
      />

      <p className="atlas-aviso" role="note" data-tour="rx-aviso">
        {AVISO_ORIGEN.radiografia} Si la radiografía es una foto de la placa, tómala de frente: una foto en ángulo deforma los ángulos.
      </p>

      {errorFuentes && <CAlert color="danger">{errorFuentes}</CAlert>}

      <CNav variant="pills" role="tablist" className="rx-vistas" data-tour="rx-vistas">
        {(['lateral', 'ap'] as const).map((v) => (
          <CNavItem key={v}>
            <CNavLink as="button" type="button" active={vista === v} onClick={() => setVista(v)} role="tab" aria-selected={vista === v}>
              {NOMBRE[v]} {hayPuntos(v) && <CBadge color="light" className="text-dark ms-1">{Object.keys(estado.puntos[v]).length}</CBadge>}
            </CNavLink>
          </CNavItem>
        ))}
      </CNav>

      <div className="rx-rejilla">
        <aside className="atlas-panel rx-panel" aria-label="Radiografía y escala">
          <div className="mb-3" data-tour="rx-fuente">
            <CFormLabel htmlFor="rx-fuente">Radiografía {vista === 'ap' ? 'AP' : 'lateral'}</CFormLabel>
            {fuentes === null && !errorFuentes ? (
              <div><CSpinner size="sm" /> Buscando imágenes…</div>
            ) : (
              <CFormSelect
                id="rx-fuente"
                value={f ? claveDeFuente(f) : ''}
                disabled={hayPuntos(vista)}
                onChange={(e) => void elegirFuente(vista, opcionesFuentes.find((x) => claveDeFuente(x) === e.target.value) ?? null)}
              >
                <option value="">Elige una imagen…</option>
                {opcionesFuentes.map((x) => (
                  <option key={claveDeFuente(x)} value={claveDeFuente(x)}>
                    {x.titulo} · {formatearInstante(x.fecha, { dateStyle: 'medium' })}
                  </option>
                ))}
              </CFormSelect>
            )}
            {fuentes?.length === 0 && (
              <p className="rx-ayuda mt-1">
                Este paciente no tiene fotos ni radiografías DICOM. Súbelas en la pestaña Imágenes del{' '}
                <Link to={rutaDelExpediente(patientId)}>expediente</Link>.
              </p>
            )}
            {hayPuntos(vista) && (
              <CButton size="sm" color="secondary" variant="outline" className="mt-2" onClick={() => borrarVista(vista)}>
                Empezar de nuevo esta vista
              </CButton>
            )}
          </div>

          <div className="mb-3" data-tour="rx-rango">
            <CFormLabel>Qué vértebras marcar</CFormLabel>
            <div className="rx-rango">
              {(['desde', 'hasta'] as const).map((k) => (
                <CFormSelect
                  key={k}
                  size="sm"
                  aria-label={k === 'desde' ? 'Desde' : 'Hasta'}
                  value={rangos[vista][k]}
                  onChange={(e) => setRangos((r) => ({ ...r, [vista]: { ...r[vista], [k]: e.target.value } }))}
                >
                  {VERTEBRAS_RX.filter((x) => vista === 'lateral' || x !== 'S1').map((x) => (
                    <option key={x} value={x}>{k === 'desde' ? 'Desde' : 'Hasta'} {x}</option>
                  ))}
                </CFormSelect>
              ))}
            </div>
            {vista === 'lateral' && (
              <CFormCheck className="mt-2" id="rx-pelvis" label="Marcar también las caderas (parámetros pélvicos)" checked={conPelvis} onChange={(e) => setConPelvis(e.target.checked)} />
            )}
            {vista === 'ap' && (
              <div className="mt-2">
                <CFormLabel htmlFor="rx-derecha" className="small mb-1">La derecha del paciente está a la…</CFormLabel>
                <CFormSelect
                  id="rx-derecha"
                  size="sm"
                  value={opciones.derechaDelPaciente}
                  onChange={(e) => setOpciones((o) => ({ ...o, derechaDelPaciente: e.target.value as OpcionesRx['derechaDelPaciente'] }))}
                >
                  <option value="izquierda">Izquierda de la imagen (convención radiológica)</option>
                  <option value="derecha">Derecha de la imagen</option>
                </CFormSelect>
              </div>
            )}
          </div>

          <div className="mb-2" data-tour="rx-escala">
            <CFormLabel htmlFor="rx-escala">Escala</CFormLabel>
            <CFormSelect
              id="rx-escala"
              size="sm"
              value={escala[vista]}
              onChange={(e) => {
                const tipo = e.target.value as TipoDeEscala
                setEscala((x) => ({ ...x, [vista]: tipo }))
                setModo(tipo === 'referencia' ? 'referencia' : 'marcar')
              }}
            >
              <option value="ninguna">Sin escala: sólo ángulos y proporciones</option>
              <option value="referencia">Una distancia conocida que marco</option>
              {f?.espaciado && <option value="dicom">El espaciado del píxel del DICOM</option>}
            </CFormSelect>
            {escala[vista] === 'referencia' && (
              <div className="rx-referencia mt-2">
                <p className="rx-ayuda mb-1">
                  {modo === 'referencia'
                    ? 'Toca los dos extremos de algo cuyo tamaño conozcas (una regla, un marcador) y escribe cuánto mide.'
                    : 'Para mover los extremos, vuelve a «Marcar distancia».'}
                </p>
                <div className="d-flex gap-2 align-items-center">
                  <CFormInput
                    type="number"
                    size="sm"
                    min={0}
                    step="0.1"
                    aria-label="Milímetros de la distancia conocida"
                    value={ref.mm}
                    onChange={(e) => setReferencia((x) => ({ ...x, [vista]: { ...x[vista], mm: e.target.value } }))}
                  />
                  <span>mm</span>
                  <CButton size="sm" color={modo === 'referencia' ? 'warning' : 'secondary'} onClick={() => setModo(modo === 'referencia' ? 'marcar' : 'referencia')}>
                    {modo === 'referencia' ? 'Listo' : 'Marcar distancia'}
                  </CButton>
                </div>
              </div>
            )}
          </div>
        </aside>

        <section className="rx-centro" aria-label="Marcado de puntos">
          <div className="rx-paso" aria-live="polite" data-tour="rx-paso">
            {img.tipo !== 'lista' ? (
              <span>Elige la radiografía {vista === 'ap' ? 'AP' : 'lateral'} para empezar.</span>
            ) : modo === 'referencia' ? (
              <span><b>Distancia conocida:</b> toca sus dos extremos.</span>
            ) : pendiente ? (
              <>
                <div className="rx-paso__titulo">Toca: {pendiente.titulo}</div>
                <div className="rx-paso__ayuda">{pendiente.ayuda}</div>
              </>
            ) : (
              <div className="rx-paso__titulo">Listo: ya recorriste todos los puntos de esta vista. Puedes arrastrar cualquiera para corregirlo.</div>
            )}
            {img.tipo === 'lista' && (
              <div className="rx-paso__progreso">{progreso.hechos} de {progreso.total}</div>
            )}
          </div>

          <div className="rx-herramientas" data-tour="rx-herramientas">
            <CButton size="sm" color="secondary" disabled={estado.historial.length === 0} onClick={() => cambiarEstado(deshacer(estado))}>
              Deshacer
            </CButton>
            <CButton size="sm" color="secondary" disabled={!pendiente || img.tipo !== 'lista'} onClick={() => pendiente && cambiarEstado(saltar(estado, vista, pendiente.clave))}>
              Saltar punto
            </CButton>
            <CButton
              size="sm"
              color={modo === 'mover' ? 'primary' : 'secondary'}
              aria-pressed={modo === 'mover'}
              onClick={() => setModo(modo === 'mover' ? 'marcar' : 'mover')}
            >
              {modo === 'mover' ? 'Volver a marcar' : 'Mover imagen'}
            </CButton>
            <CButton size="sm" color="secondary" aria-label="Alejar" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}>−</CButton>
            <CButton size="sm" color="secondary" aria-label="Acercar" disabled={zoom >= 6} onClick={() => setZoom((z) => Math.min(6, z * 1.5))}>+</CButton>
          </div>

          {img.tipo === 'lista' ? (
            <MarcadorRadiografia
              src={img.url}
              ancho={img.ancho}
              alto={img.alto}
              vista={vista}
              puntos={puntosDeVista}
              pendiente={pendiente}
              modo={modo}
              referencia={escala[vista] === 'referencia' ? [ref.a, ref.b] : []}
              zoom={zoom}
              alColocar={(clave, p) => cambiarEstado(colocar(estado, vista, clave, p))}
              alColocarReferencia={(i, p) => setReferencia((x) => ({ ...x, [vista]: { ...x[vista], [i === 0 ? 'a' : 'b']: p } }))}
            />
          ) : (
            <div className="rx-vacio">
              {img.tipo === 'cargando' ? (
                <><CSpinner size="sm" className="me-2" /> Abriendo la radiografía…</>
              ) : img.tipo === 'error' ? (
                <span role="alert">{img.mensaje}</span>
              ) : (
                <span>Aquí aparecerá la radiografía.</span>
              )}
            </div>
          )}
        </section>

        <aside className="atlas-panel rx-panel rx-panel--mediciones" aria-label="Mediciones">
          <PanelMedicionesRx
            resultado={resultadoGuardado ? resultadoGuardado.ajuste.mediciones : resultado}
            calibraciones={resultadoGuardado ? resultadoGuardado.ajuste.calibracion : calibraciones}
            origen={resultadoGuardado ? 'servidor' : 'sugerencia'}
            vertebrasAP={Object.keys(marcasDe(estado).ap.vertebras)}
            eleccionCobb={opciones.cobbCoronal ?? null}
            alCambiarCobb={(e) => {
              setOpciones((o) => ({ ...o, cobbCoronal: e }))
              setResultadoGuardado(null)
            }}
          />

          {puedeGuardar && (
            <div className="rx-guardar" data-tour="rx-guardar">
              {errorGuardar && <CAlert color="danger" className="py-2">{errorGuardar}</CAlert>}
              {resultadoGuardado ? (
                <CAlert color="success" className="py-2">
                  Guardado. {resultadoGuardado.coincide ? 'Las mediciones del servidor coinciden con la sugerencia.' : 'El servidor calculó valores distintos a la sugerencia; se guardaron los del servidor y son los que ves.'}
                </CAlert>
              ) : null}
              <CButton color="primary" className="w-100" disabled={!listoParaGuardar || guardando || Boolean(resultadoGuardado)} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : resultadoGuardado ? 'Guardado' : 'Guardar ajuste'}
              </CButton>
              {resultadoGuardado && (
                <CButton color="primary" variant="outline" className="w-100 mt-2" onClick={() => navigate(`/pacientes/${patientId}/neuro-3d?origen=radiografia`)}>
                  Ver en Neuro 3D
                </CButton>
              )}
            </div>
          )}

          {ajustes.length > 0 && (
            <div className="rx-historial" data-tour="rx-historial">
              <h3 className="rx-mediciones__titulo">Ajustes guardados</h3>
              <ul>
                {ajustes.map((a) => (
                  <li key={a.id} className={a.anulado_at ? 'rx-historial__anulado' : undefined}>
                    <span>
                      {formatearInstante(a.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
                      {a.mediciones.lordosisLumbar ? ` · lordosis ${a.mediciones.lordosisLumbar.grados}°` : ''}
                      {a.mediciones.cobbCoronal ? ` · Cobb ${a.mediciones.cobbCoronal.grados}°` : ''}
                      {a.anulado_at ? ` · anulado: ${a.anulado_motivo}` : ''}
                    </span>
                    {!a.anulado_at && puedeGuardar && (
                      <CButton size="sm" color="danger" variant="outline" onClick={() => setAnulando(a)}>Anular</CButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {anulando && (
        <ModalAnular
          alCerrar={() => setAnulando(null)}
          anular={async (motivo) => {
            await columnaRxApi.anular(patientId, anulando.id, motivo)
            cargarAjustes()
          }}
        />
      )}
    </div>
  )
}

/** Anular con motivo: sólo dice «Anulado» cuando el servidor lo confirmó. */
function ModalAnular({ alCerrar, anular }: { alCerrar: () => void; anular: (motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('')
  const [estado, setEstado] = useState<{ tipo: 'editando' | 'anulando' | 'anulado' } | { tipo: 'error'; mensaje: string }>({ tipo: 'editando' })
  const enviar = async () => {
    if (motivo.trim().length < 5) {
      setEstado({ tipo: 'error', mensaje: 'Escribe el motivo de la anulación (al menos 5 caracteres).' })
      return
    }
    setEstado({ tipo: 'anulando' })
    try {
      await anular(motivo.trim())
      setEstado({ tipo: 'anulado' })
    } catch (err) {
      setEstado({ tipo: 'error', mensaje: mensajeDeError(err, 'No se pudo anular el ajuste. Vuelve a intentarlo.') })
    }
  }
  return (
    <CModal visible onClose={alCerrar} alignment="center">
      <CModalHeader>
        <CModalTitle>Anular ajuste de columna</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <p className="small">No se borra: queda en el historial con el motivo y Neuro 3D deja de usarlo.</p>
        <CFormLabel htmlFor="rx-motivo">¿Por qué lo anulas?</CFormLabel>
        <CFormTextarea id="rx-motivo" rows={2} value={motivo} onChange={enMayusculas((v) => setMotivo(v))} disabled={estado.tipo === 'anulado'} />
        {estado.tipo === 'error' && <CAlert color="danger" className="py-2 mt-2">{estado.mensaje}</CAlert>}
        {estado.tipo === 'anulado' && <CAlert color="success" className="py-2 mt-2">Anulado.</CAlert>}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" variant="outline" onClick={alCerrar}>{estado.tipo === 'anulado' ? 'Cerrar' : 'Cancelar'}</CButton>
        {estado.tipo !== 'anulado' && (
          <CButton color="danger" disabled={estado.tipo === 'anulando'} onClick={() => void enviar()}>
            {estado.tipo === 'anulando' ? 'Anulando…' : 'Anular'}
          </CButton>
        )}
      </CModalFooter>
    </CModal>
  )
}
