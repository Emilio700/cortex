/**
 * «3D del estudio»: el render volumétrico de una serie (feat/render-volumetrico).
 *
 * El médico ve su TC, angio-TC o RM tal cual en 3D: el hueso con su detalle, los
 * vasos con contraste, la piel. No hay IA ni segmentación: es el estudio pintado
 * en volumen en la tarjeta gráfica, con un preajuste (curva de color y
 * opacidad) que decide qué se ve.
 *
 * Reglas:
 * - El aviso de arriba no se quita: lo que se ve depende del preajuste y del
 *   umbral. Esta vista **no mide**; para medir están los cortes.
 * - Nunca una pantalla en blanco: mientras carga hay barra de progreso; si la
 *   tarjeta no puede, se dice qué pasó y se ofrece reducir la resolución.
 * - Al salir se suelta todo (volumen, archivos, motor): una TC pesa cientos de MB.
 * - La captura no lleva el nombre del paciente.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CAlert, CButton, CFormCheck, CFormRange, CFormSelect, CProgress, CSpinner } from '@coreui/react-pro'

import { lineasDelSello, limpiarParaArchivo } from '../dominio/captura'
import { nombreDeSerie, resumenDeEstudio, type EstudioDicom, type ManifiestoSerie, type SerieDicom } from '../dominio/tipos'
import {
  AVISO_RENDER_3D,
  LADO_DEL_RECORTE,
  LEYENDA_CAPTURA_3D,
  SIN_RECORTE,
  elegibilidad3D,
  factorDeDecimado,
  memoriaDelVolumen,
  nombreDeModalidad,
  preajusteInicial,
  preajustePorId,
  preajustesParaModalidad,
  rangoDeUmbral,
  textoDeMemoria,
  type EjeDeRecorte,
  type Recortes,
} from '../dominio/volumen3d'
import { componerCaptura, descargarBlob } from '../servicios/capturaCanvas'
import { prepararVisor } from '../servicios/cornerstone'
import { estudiosApi } from '../servicios/estudiosApi'
import { mensajeDeFallo } from '../servicios/mensajes'
import {
  crearVolumen3D,
  explicarFallo,
  hayWebGL2,
  soportaTexturasFloat,
  type HerramientaVolumen,
  type Progreso,
  type Volumen3D,
} from '../servicios/volumen3d'
import '../ui/visor.css'
import '../ui/volumen3d.css'

type Estado =
  | { tipo: 'preparando' }
  | { tipo: 'no-apta'; motivo: string }
  | { tipo: 'sin-webgl' }
  | { tipo: 'cargando'; progreso: Progreso | null }
  | { tipo: 'listo' }
  | { tipo: 'error'; mensaje: string; sugerirReducir: boolean; recargar?: boolean }

const EJES: Array<{ eje: EjeDeRecorte; nombre: string }> = [
  { eje: 'axial', nombre: 'Axial' },
  { eje: 'sagital', nombre: 'Sagital' },
  { eje: 'coronal', nombre: 'Coronal' },
]

const HERRAMIENTAS_3D: Array<{ id: HerramientaVolumen; nombre: string }> = [
  { id: 'rotar', nombre: 'Rotar' },
  { id: 'desplazar', nombre: 'Mover' },
  { id: 'zoom', nombre: 'Acercar' },
]

function textoDeProgreso(progreso: Progreso | null): string {
  if (!progreso) return 'Preparando…'
  const cifra = `${progreso.hechos} / ${progreso.total}`
  return progreso.fase === 'descargando' ? `Descargando cortes ${cifra}` : `Armando el volumen ${cifra}`
}

function porcentaje(progreso: Progreso | null): number {
  if (!progreso || progreso.total === 0) return 0
  // La descarga es lo lento: ocupa el 80 % de la barra; armar, el resto.
  const fraccion = progreso.hechos / progreso.total
  return Math.round(progreso.fase === 'descargando' ? fraccion * 80 : 80 + fraccion * 20)
}

export default function Volumen3DPage() {
  const { patientId, studyId, serieId } = useParams<{ patientId: string; studyId: string; serieId: string }>()
  const [estudio, setEstudio] = useState<EstudioDicom | null>(null)
  const [serie, setSerie] = useState<SerieDicom | null>(null)
  const [manifiesto, setManifiesto] = useState<ManifiestoSerie | null>(null)
  const [estado, setEstado] = useState<Estado>({ tipo: 'preparando' })
  const [reducir, setReducir] = useState(false)
  const [intento, setIntento] = useState(0)
  const [preajuste, setPreajuste] = useState<string>('')
  const [umbral, setUmbral] = useState(0)
  const [opacidad, setOpacidad] = useState(100)
  const [recortes, setRecortes] = useState<Recortes>(SIN_RECORTE)
  const [herramienta, setHerramienta] = useState<HerramientaVolumen>('rotar')
  const [cinematica, setCinematica] = useState(false)
  const [avisoCaptura, setAvisoCaptura] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)
  const [capturando, setCapturando] = useState(false)

  const refEscena = useRef<HTMLDivElement>(null)
  const volumen = useRef<Volumen3D | null>(null)
  // Lo que se aplica al terminar de cargar: lo elegido mientras cargaba no se pierde.
  const ajustes = useRef({ preajuste, umbral, opacidad, recortes, herramienta, cinematica })
  ajustes.current = { preajuste, umbral, opacidad, recortes, herramienta, cinematica }

  const modalidad = (serie?.modality || estudio?.modality || '').toUpperCase()
  const preajustes = preajustesParaModalidad(modalidad)
  const rango = rangoDeUmbral(modalidad)
  const floatOk = soportaTexturasFloat()

  // 1. El estudio, la serie y su manifiesto; con eso se decide si hay volumen.
  useEffect(() => {
    let vigente = true
    setEstado({ tipo: 'preparando' })
    const preparar = async () => {
      try {
        const detalle = await estudiosApi.detalle(studyId ?? '')
        if (!vigente) return
        setEstudio(detalle)
        const encontrada = (detalle.series ?? []).find((s) => String(s.id) === serieId) ?? null
        setSerie(encontrada)
        if (!encontrada) {
          setEstado({ tipo: 'no-apta', motivo: 'Esa serie ya no está en el estudio.' })
          return
        }
        const previa = elegibilidad3D(encontrada)
        if (!previa.apta) {
          setEstado({ tipo: 'no-apta', motivo: previa.motivo })
          return
        }
        const datos = await estudiosApi.manifiesto(encontrada.id)
        if (!vigente) return
        setManifiesto(datos)
        const final = elegibilidad3D(encontrada, datos)
        if (!final.apta) {
          setEstado({ tipo: 'no-apta', motivo: final.motivo })
          return
        }
        if (!hayWebGL2()) {
          setEstado({ tipo: 'sin-webgl' })
          return
        }
        setPreajuste((actual) => actual || preajusteInicial(encontrada.modality || detalle.modality)?.id || '')
        setEstado({ tipo: 'cargando', progreso: null })
      } catch (fallo) {
        if (vigente) setEstado({ tipo: 'error', mensaje: mensajeDeFallo(fallo), sugerirReducir: false })
      }
    }
    void preparar()
    return () => {
      vigente = false
    }
  }, [studyId, serieId])

  const primerCorte = manifiesto?.instances[0]
  const memoria = memoriaDelVolumen(primerCorte?.rows ?? null, primerCorte?.columns ?? null, manifiesto?.instances.length ?? 0)
  const decimadoPorMemoria = factorDeDecimado(memoria)
  const decimado = Math.max(decimadoPorMemoria, reducir ? 2 : 1)

  // 2. El volumen. Se vuelve a armar al reducir la resolución o al reintentar.
  const listoParaCargar = Boolean(manifiesto) && (estado.tipo === 'cargando' || estado.tipo === 'listo')
  useEffect(() => {
    const elemento = refEscena.current
    if (!listoParaCargar || !manifiesto || !elemento) return
    let cancelado = false
    setEstado({ tipo: 'cargando', progreso: null })
    const montar = async () => {
      try {
        await prepararVisor()
        if (cancelado) return
        const creado = await crearVolumen3D({
          elemento,
          manifiesto,
          decimado,
          preajuste: ajustes.current.preajuste || preajusteInicial(modalidad)?.id || 'hueso',
          alProgreso: (progreso) => {
            if (!cancelado) setEstado({ tipo: 'cargando', progreso })
          },
          alPerderContexto: () => {
            if (cancelado) return
            volumen.current?.destruir()
            volumen.current = null
            setEstado({
              tipo: 'error',
              mensaje:
                'La tarjeta gráfica perdió el contexto (memoria agotada o controlador reiniciado) y soltó el volumen. Prueba «Reducir resolución»; si no responde, recarga la página.',
              sugerirReducir: true,
              recargar: true,
            })
          },
        })
        if (cancelado) {
          creado.destruir()
          return
        }
        volumen.current = creado
        const { umbral: u, opacidad: o, recortes: r, herramienta: h, cinematica: c } = ajustes.current
        if (c) creado.fijarCinematica(true)
        if (u !== 0 || o !== 100) creado.ajustarOpacidad(u, o / 100)
        creado.recortar(r)
        creado.aplicarHerramienta(h)
        setEstado({ tipo: 'listo' })
      } catch (fallo) {
        if (cancelado) return
        const explicado = explicarFallo(fallo)
        setEstado({ tipo: 'error', mensaje: explicado.message, sugerirReducir: explicado.sugerirReducir && decimado < 4 })
      }
    }
    void montar()
    return () => {
      cancelado = true
      volumen.current?.destruir()
      volumen.current = null
    }
    // `estado` no entra: el efecto lo cambia. Se arma una vez por manifiesto, resolución e intento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listoParaCargar, manifiesto, decimado, intento])

  const cambiarPreajuste = (id: string) => {
    setPreajuste(id)
    setUmbral(0)
    setOpacidad(100)
    volumen.current?.aplicarPreajuste(id)
  }

  const cambiarUmbral = (valor: number) => {
    setUmbral(valor)
    volumen.current?.ajustarOpacidad(valor, opacidad / 100)
  }

  const cambiarOpacidad = (valor: number) => {
    setOpacidad(valor)
    volumen.current?.ajustarOpacidad(umbral, valor / 100)
  }

  const cambiarRecorte = (eje: EjeDeRecorte, cambio: Partial<Recortes[EjeDeRecorte]>) => {
    const nuevos = { ...recortes, [eje]: { ...recortes[eje], ...cambio } }
    setRecortes(nuevos)
    volumen.current?.recortar(nuevos)
  }

  const elegirHerramienta = (id: HerramientaVolumen) => {
    setHerramienta(id)
    volumen.current?.aplicarHerramienta(id)
  }

  const restablecer = () => {
    setRecortes(SIN_RECORTE)
    setUmbral(0)
    setOpacidad(100)
    const v = volumen.current
    if (!v) return
    v.aplicarPreajuste(preajuste)
    v.recortar(SIN_RECORTE)
    v.restablecer()
  }

  const reintentar = (conMenosResolucion: boolean) => {
    if (conMenosResolucion) setReducir(true)
    setIntento((n) => n + 1)
    setEstado({ tipo: 'cargando', progreso: null })
  }

  const capturar = useCallback(async () => {
    const lienzo = volumen.current?.lienzo()
    if (!lienzo || !estudio || !serie) return
    setCapturando(true)
    setAvisoCaptura(null)
    try {
      const nombrePreajuste = preajustePorId(preajuste)?.nombre ?? 'sin preajuste'
      const recortados = EJES.filter(({ eje }) => recortes[eje].fraccion > 0).map(
        ({ eje, nombre }) => `${nombre} ${Math.round(recortes[eje].fraccion * 100)} %`
      )
      // El sello reutiliza el del visor (sin paciente) y cambia la línea del corte
      // por lo que decide la imagen en 3D: preajuste, umbral y recorte.
      const [lineaEstudio, lineaSerie] = lineasDelSello({
        estudio: estudio.study_description,
        modalidad: estudio.modality,
        fecha: estudio.study_date,
        serie: nombreDeSerie(serie),
        indice: 0,
        total: 0,
      })
      const sello = [
        lineaEstudio,
        lineaSerie,
        [
          `Render 3D · ${nombrePreajuste}`,
          umbral !== 0 ? `umbral ${umbral > 0 ? '+' : ''}${umbral} ${rango.unidad}` : null,
          opacidad !== 100 ? `opacidad ${opacidad} %` : null,
          cinematica ? 'iluminación cinematográfica' : null,
          decimado > 1 ? `1 de cada ${decimado} cortes` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      ]
      if (recortados.length) sello.push(`Recorte: ${recortados.join(' · ')}`)
      const { blob } = await componerCaptura({ lienzo, sello, leyenda: LEYENDA_CAPTURA_3D })
      const fecha = String(estudio.study_date ?? '').slice(0, 10)
      const nombre = [
        'cortex-3d',
        limpiarParaArchivo(estudio.modality ?? 'img'),
        limpiarParaArchivo(nombreDeSerie(serie)),
        limpiarParaArchivo(nombrePreajuste),
        /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
      ]
        .filter(Boolean)
        .join('-')
      descargarBlob(blob, `${nombre}.png`)
      setAvisoCaptura({ tono: 'ok', texto: 'Captura descargada (sin el nombre del paciente).' })
    } catch (fallo) {
      setAvisoCaptura({ tono: 'error', texto: mensajeDeFallo(fallo) })
    } finally {
      setCapturando(false)
    }
  }, [estudio, serie, preajuste, recortes, umbral, opacidad, rango.unidad, decimado, cinematica])

  const rutaVisor = `/pacientes/${patientId}/estudios/${studyId}`
  const listo = estado.tipo === 'listo'
  const conEscena = estado.tipo === 'cargando' || estado.tipo === 'listo'
  // Si la serie no forma volumen o el equipo no pinta 3D, los controles sólo estorbarían.
  const sinControles = estado.tipo === 'no-apta' || estado.tipo === 'sin-webgl'

  return (
    <div className="visor-pagina vol3d">
      <div className="visor-encabezado">
        <div>
          <Link to={rutaVisor} className="visor-encabezado__meta">
            ← Volver al visor
          </Link>
          <h2 className="visor-encabezado__titulo">
            3D del estudio{serie ? ` · ${nombreDeSerie(serie)}` : ''}
          </h2>
          {estudio && <div className="visor-encabezado__meta">{resumenDeEstudio(estudio)}</div>}
        </div>
      </div>

      <div className="vol3d-aviso" role="note" data-tour="vol3d-aviso">
        {AVISO_RENDER_3D}
      </div>

      {!floatOk && conEscena && (
        <CAlert color="warning" className="py-2 mb-0">
          Esta tarjeta gráfica no pinta texturas de punto flotante: el volumen puede verse con menos detalle o no
          cargar. Si falla, usa «Reducir resolución».
        </CAlert>
      )}
      {decimado > 1 && conEscena && (
        <CAlert color="info" className="py-2 mb-0">
          Se carga un corte de cada {decimado}
          {decimadoPorMemoria > 1
            ? ` para no agotar la memoria (el volumen completo ocupa ~${textoDeMemoria(memoria)}).`
            : ' (resolución reducida).'}{' '}
          El detalle fino entre cortes se pierde; los cortes del visor siguen completos.
        </CAlert>
      )}

      <div className={`vol3d-cuerpo${sinControles ? ' vol3d-cuerpo--solo' : ''}`}>
        <section className="vol3d-central">
          <div className="vol3d-escena" data-tour="vol3d-escena">
            <div className="vol3d-lienzo" ref={refEscena} />
            {estado.tipo === 'preparando' && (
              <div className="vol3d-capa" role="status">
                <CSpinner color="light" size="sm" className="me-2" />
                Revisando la serie…
              </div>
            )}
            {estado.tipo === 'cargando' && (
              <div className="vol3d-capa" role="status" aria-live="polite">
                <div className="vol3d-progreso">
                  <div className="mb-2">{textoDeProgreso(estado.progreso)}</div>
                  <CProgress value={porcentaje(estado.progreso)} aria-label="Avance de la carga del volumen" />
                </div>
              </div>
            )}
            {estado.tipo === 'no-apta' && (
              <div className="vol3d-capa vol3d-capa--mensaje" role="alert">
                <h3 className="h6">Esta serie no se puede ver en 3D</h3>
                <p className="mb-2">{estado.motivo}</p>
                <Link to={rutaVisor} className="btn btn-sm btn-light">
                  Volver a los cortes
                </Link>
              </div>
            )}
            {estado.tipo === 'sin-webgl' && (
              <div className="vol3d-capa vol3d-capa--mensaje" role="alert">
                <h3 className="h6">Este equipo no puede pintar el volumen</h3>
                <p className="mb-2">
                  El navegador no ofrece WebGL 2 (gráficos 3D). Actualiza el navegador o activa la aceleración por
                  hardware; los cortes se siguen viendo en el visor.
                </p>
                <Link to={rutaVisor} className="btn btn-sm btn-light">
                  Volver a los cortes
                </Link>
              </div>
            )}
            {estado.tipo === 'error' && (
              <div className="vol3d-capa vol3d-capa--mensaje" role="alert">
                <h3 className="h6">No se pudo mostrar el volumen</h3>
                <p className="mb-2">{estado.mensaje}</p>
                <div className="d-flex flex-wrap gap-2 justify-content-center">
                  {estado.sugerirReducir && (
                    <CButton size="sm" color="light" onClick={() => reintentar(true)}>
                      Reducir resolución
                    </CButton>
                  )}
                  <CButton size="sm" color="light" variant="outline" onClick={() => reintentar(false)}>
                    Intentar de nuevo
                  </CButton>
                  {estado.recargar && (
                    <CButton size="sm" color="light" variant="outline" onClick={() => window.location.reload()}>
                      Recargar la página
                    </CButton>
                  )}
                  <Link to={rutaVisor} className="btn btn-sm btn-outline-light">
                    Volver a los cortes
                  </Link>
                </div>
              </div>
            )}
          </div>
          <div className="visor-encabezado__meta mt-1">
            Botón izquierdo: la herramienta elegida · central: mover · derecho o rueda: acercar. Sin mediciones en
            esta vista.
          </div>
        </section>

        {!sinControles && (
          <aside className="visor-panel vol3d-panel" aria-label="Controles del render 3D">
          <div className="vol3d-grupo" data-tour="vol3d-preajuste">
            <label className="visor-panel__titulo" htmlFor="vol3d-preajuste">
              Preajuste
            </label>
            <CFormSelect
              id="vol3d-preajuste"
              size="sm"
              value={preajuste}
              disabled={!listo}
              onChange={(e) => cambiarPreajuste(e.target.value)}
            >
              {preajustes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </CFormSelect>
            {preajustePorId(preajuste) && (
              <div className="vol3d-nota">{preajustePorId(preajuste)?.descripcion}</div>
            )}
          </div>

          <div className="vol3d-grupo" data-tour="vol3d-umbral">
            <label className="visor-panel__titulo" htmlFor="vol3d-umbral">
              Umbral: {umbral > 0 ? '+' : ''}
              {umbral} {rango.unidad}
            </label>
            <CFormRange
              id="vol3d-umbral"
              min={rango.min}
              max={rango.max}
              step={rango.paso}
              value={umbral}
              disabled={!listo}
              onChange={(e) => cambiarUmbral(Number(e.target.value))}
            />
            <div className="vol3d-nota">Mueve qué densidades se vuelven visibles. A la derecha se ve menos.</div>
            <CFormCheck
              className="mt-2"
              id="vol3d-cinematica"
              label="Iluminación cinematográfica"
              checked={cinematica}
              disabled={!listo}
              onChange={(e) => {
                setCinematica(e.target.checked)
                volumen.current?.fijarCinematica(e.target.checked)
              }}
              data-tour="vol3d-cinematica"
            />
            <div className="vol3d-nota">Sombras suaves y profundidad. Pide más a la tarjeta; al girar se apaga un momento.</div>
            <label className="visor-panel__titulo mt-2" htmlFor="vol3d-opacidad">
              Opacidad: {opacidad} %
            </label>
            <CFormRange
              id="vol3d-opacidad"
              min={10}
              max={150}
              step={5}
              value={opacidad}
              disabled={!listo}
              onChange={(e) => cambiarOpacidad(Number(e.target.value))}
            />
          </div>

          <div className="vol3d-grupo" data-tour="vol3d-recorte">
            <div className="visor-panel__titulo">Recorte</div>
            {EJES.map(({ eje, nombre }) => (
              <div key={eje} className="vol3d-recorte">
                <label htmlFor={`vol3d-recorte-${eje}`} className="vol3d-recorte__nombre">
                  {nombre}: {Math.round(recortes[eje].fraccion * 100)} %
                  <span className="vol3d-nota"> {LADO_DEL_RECORTE[eje][recortes[eje].invertido ? 1 : 0]}</span>
                </label>
                <CFormRange
                  id={`vol3d-recorte-${eje}`}
                  min={0}
                  max={95}
                  step={1}
                  value={Math.round(recortes[eje].fraccion * 100)}
                  disabled={!listo}
                  onChange={(e) => cambiarRecorte(eje, { fraccion: Number(e.target.value) / 100 })}
                />
                <CFormCheck
                  id={`vol3d-recorte-${eje}-lado`}
                  label="Desde el otro lado"
                  checked={recortes[eje].invertido}
                  disabled={!listo}
                  onChange={(e) => cambiarRecorte(eje, { invertido: e.target.checked })}
                />
              </div>
            ))}
          </div>

          <div className="vol3d-grupo" data-tour="vol3d-herramientas">
            <div className="visor-panel__titulo">Botón izquierdo</div>
            <div className="btn-group btn-group-sm w-100" role="group" aria-label="Herramienta del botón izquierdo">
              {HERRAMIENTAS_3D.map((h) => (
                <CButton
                  key={h.id}
                  color="primary"
                  variant={herramienta === h.id ? undefined : 'outline'}
                  aria-pressed={herramienta === h.id}
                  disabled={!listo}
                  onClick={() => elegirHerramienta(h.id)}
                >
                  {h.nombre}
                </CButton>
              ))}
            </div>
            <div className="d-flex flex-wrap gap-2 mt-2">
              <CButton size="sm" color="secondary" variant="outline" disabled={!listo} onClick={restablecer}>
                Restablecer
              </CButton>
              <CButton
                size="sm"
                color="primary"
                disabled={!listo || capturando}
                onClick={() => void capturar()}
                data-tour="vol3d-capturar"
              >
                {capturando ? 'Preparando…' : 'Capturar PNG'}
              </CButton>
              {decimado === 1 && (
                <CButton
                  size="sm"
                  color="secondary"
                  variant="outline"
                  disabled={!conEscena}
                  onClick={() => reintentar(true)}
                  title="Carga un corte de cada dos: la mitad de memoria."
                >
                  Reducir resolución
                </CButton>
              )}
            </div>
            {avisoCaptura && (
              <div
                className={`vol3d-nota mt-2${avisoCaptura.tono === 'error' ? ' text-danger' : ''}`}
                role={avisoCaptura.tono === 'error' ? 'alert' : 'status'}
              >
                {avisoCaptura.texto}
              </div>
            )}
          </div>

          <div className="vol3d-nota">
            {serie && manifiesto
              ? `${nombreDeModalidad(modalidad)} · ${manifiesto.instances.length} cortes${
                  primerCorte?.rows ? ` de ${primerCorte.columns}×${primerCorte.rows}` : ''
                }`
              : null}
          </div>
          </aside>
        )}
      </div>
    </div>
  )
}
