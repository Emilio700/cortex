/**
 * La barra de herramientas del visor.
 *
 * Seis grupos, de lo que más se usa a lo que menos: herramientas del botón
 * izquierdo, la vista (zoom, giro, volteo, inversión), la ventana (contraste), el
 * cine, las acciones sobre lo que se ve (capturar, corte clave, compartir) y la
 * pantalla (presentación, completa, ayuda).
 *
 * No guarda estado: recibe cuál herramienta está activa y qué ve la imagen, y
 * avisa qué se pidió. Cada botón dice su atajo de teclado en su `title`, sacado
 * de la misma tabla que la ayuda, para que nunca digan cosas distintas.
 *
 * En modo lectura (el enlace compartido) no hay capturar, corte clave ni
 * compartir: quien abre un enlace mira y mide, no guarda nada en el expediente.
 */
import type { ReactNode } from 'react'
import { CButton, CButtonGroup, CFormSelect } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import {
  cilCamera,
  cilContrast,
  cilCursor,
  cilFullscreen,
  cilFullscreenExit,
  cilKeyboard,
  cilLoopCircular,
  cilMediaPause,
  cilMediaPlay,
  cilMove,
  cilMonitor,
  cilPencil,
  cilReload,
  cilShareAlt,
  cilStar,
  cilSwapHorizontal,
  cilSwapVertical,
  cilZoomIn,
  cilZoomOut,
  cilOpacity,
  cilCrop,
} from '@coreui/icons'

import { tituloConAtajo, type AccionDelVisor } from '../dominio/atajos'
import { textoDeVentana, type PresetVentana } from '../dominio/presets'
import type { EstadoDeVista } from '../servicios/controlesDeVista'
import { FPS_DEL_CINE } from '../servicios/controlesDeVista'
import type { Herramienta } from '../servicios/pila'

interface Props {
  herramienta: Herramienta
  onHerramienta: (herramienta: Herramienta) => void
  estado: EstadoDeVista | null
  presets: PresetVentana[]
  onPreset: (id: string) => void
  onAcercar: (factor: number) => void
  onAjustar: () => void
  onRotar: () => void
  onVoltear: (eje: 'h' | 'v') => void
  onInvertir: () => void
  onRestablecer: () => void
  cineActivo: boolean
  fps: number
  onCine: () => void
  onFps: (fps: number) => void
  onCapturar?: () => void
  onCorteClave?: () => void
  esCorteClave?: boolean
  onCompartir?: () => void
  onPresentacion?: () => void
  onPantallaCompleta: () => void
  pantallaCompleta: boolean
  onAyuda: () => void
  /** Botones extra al final (p. ej. comparar con un estudio previo). */
  extra?: ReactNode
}

const HERRAMIENTAS: Array<{
  id: Herramienta
  accion: AccionDelVisor
  nombre: string
  descripcion: string
  icono: string[]
}> = [
  { id: 'ventana', accion: 'herramienta-ventana', nombre: 'Contraste', descripcion: 'Contraste: arrastra para cambiar brillo y contraste', icono: cilContrast },
  { id: 'medir', accion: 'herramienta-medir', nombre: 'Medir', descripcion: 'Medir una distancia', icono: cilPencil },
  { id: 'angulo', accion: 'herramienta-angulo', nombre: 'Ángulo', descripcion: 'Medir un ángulo (tres puntos)', icono: cilCrop },
  { id: 'area', accion: 'herramienta-area', nombre: 'Elipse', descripcion: 'Elipse: área y media de la región', icono: cilOpacity },
  { id: 'desplazar', accion: 'herramienta-desplazar', nombre: 'Mover', descripcion: 'Desplazar la imagen', icono: cilMove },
  { id: 'zoom', accion: 'herramienta-zoom', nombre: 'Zoom', descripcion: 'Acercar o alejar arrastrando', icono: cilCursor },
]

function Boton({
  icono,
  texto,
  titulo,
  activo,
  onClick,
  color = 'secondary',
  deshabilitado,
  rotulo,
}: {
  icono: string[]
  texto?: string
  titulo: string
  activo?: boolean
  onClick: () => void
  color?: string
  deshabilitado?: boolean
  /** El rótulo se conserva aun cuando la barra se compacta (las acciones clave). */
  rotulo?: boolean
}) {
  return (
    <CButton
      size="sm"
      color={activo ? 'primary' : color}
      variant={activo ? undefined : 'outline'}
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo === undefined ? undefined : activo}
      disabled={deshabilitado}
      onClick={onClick}
      className={rotulo ? 'visor-boton visor-boton--rotulo' : 'visor-boton'}
    >
      <CIcon icon={icono} size="sm" aria-hidden="true" />
      {texto && <span className="visor-boton__texto">{texto}</span>}
    </CButton>
  )
}

export default function BarraDelVisor({
  herramienta,
  onHerramienta,
  estado,
  presets,
  onPreset,
  onAcercar,
  onAjustar,
  onRotar,
  onVoltear,
  onInvertir,
  onRestablecer,
  cineActivo,
  fps,
  onCine,
  onFps,
  onCapturar,
  onCorteClave,
  esCorteClave,
  onCompartir,
  onPresentacion,
  onPantallaCompleta,
  pantallaCompleta,
  onAyuda,
  extra,
}: Props) {
  const sinCortes = !estado || estado.total <= 1
  return (
    <div className="visor-barra" role="toolbar" aria-label="Herramientas del visor" data-tour="visor-herramientas">
      <CButtonGroup size="sm" role="group" aria-label="Herramienta del botón izquierdo">
        {HERRAMIENTAS.map((h) => (
          <Boton
            key={h.id}
            rotulo
            icono={h.icono}
            texto={h.nombre}
            titulo={tituloConAtajo(h.accion, h.descripcion)}
            activo={herramienta === h.id}
            onClick={() => onHerramienta(h.id)}
          />
        ))}
      </CButtonGroup>

      <CButtonGroup size="sm" role="group" aria-label="Vista de la imagen">
        <Boton icono={cilZoomIn} titulo={tituloConAtajo('acercar', 'Acercar')} onClick={() => onAcercar(1.25)} />
        <Boton icono={cilZoomOut} titulo={tituloConAtajo('alejar', 'Alejar')} onClick={() => onAcercar(0.8)} />
        <Boton icono={cilFullscreen} texto="Ajustar" titulo={tituloConAtajo('ajustar', 'Ajustar a la pantalla')} onClick={onAjustar} />
        <Boton icono={cilLoopCircular} titulo={tituloConAtajo('rotar', 'Girar 90°')} onClick={onRotar} />
        <Boton
          icono={cilSwapHorizontal}
          titulo={tituloConAtajo('voltear-horizontal', 'Voltear horizontal')}
          activo={estado?.volteoH ? true : undefined}
          onClick={() => onVoltear('h')}
        />
        <Boton
          icono={cilSwapVertical}
          titulo={tituloConAtajo('voltear-vertical', 'Voltear vertical')}
          activo={estado?.volteoV ? true : undefined}
          onClick={() => onVoltear('v')}
        />
        <Boton
          icono={cilContrast}
          texto="Invertir"
          titulo={tituloConAtajo('invertir', 'Invertir los grises')}
          activo={estado?.invertido ? true : undefined}
          onClick={onInvertir}
        />
        <Boton icono={cilReload} titulo={tituloConAtajo('restablecer', 'Restablecer la vista')} onClick={onRestablecer} />
      </CButtonGroup>

      <CFormSelect
        size="sm"
        className="visor-barra__ventana"
        aria-label="Ventana (contraste)"
        title={estado ? textoDeVentana(estado.wc, estado.ww) : 'Ventana automática'}
        value=""
        onChange={(evento) => {
          if (evento.target.value) onPreset(evento.target.value)
        }}
      >
        <option value="">{estado ? textoDeVentana(estado.wc, estado.ww) : 'Ventana'}</option>
        <option value="auto">Automática (la del estudio)</option>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.nombre} · {preset.wc}/{preset.ww}
          </option>
        ))}
      </CFormSelect>

      <CButtonGroup size="sm" role="group" aria-label="Reproducir los cortes">
        <Boton
          icono={cineActivo ? cilMediaPause : cilMediaPlay}
          texto={cineActivo ? 'Pausar' : 'Cine'}
          titulo={tituloConAtajo('cine', cineActivo ? 'Pausar los cortes' : 'Reproducir los cortes')}
          activo={cineActivo ? true : undefined}
          deshabilitado={sinCortes}
          onClick={onCine}
        />
        <CFormSelect
          size="sm"
          className="visor-barra__fps"
          aria-label="Velocidad del cine"
          value={fps}
          disabled={sinCortes}
          onChange={(evento) => onFps(Number(evento.target.value))}
        >
          {FPS_DEL_CINE.map((valor) => (
            <option key={valor} value={valor}>
              {valor} cortes/s
            </option>
          ))}
        </CFormSelect>
      </CButtonGroup>

      {(onCapturar || onCorteClave || onCompartir) && (
        <CButtonGroup size="sm" role="group" aria-label="Guardar y compartir">
          {onCapturar && (
            <Boton rotulo icono={cilCamera} texto="Capturar" titulo={tituloConAtajo('capturar', 'Capturar la imagen')} onClick={onCapturar} />
          )}
          {onCorteClave && (
            <Boton
              rotulo
              icono={cilStar}
              texto={esCorteClave ? 'Corte clave' : 'Marcar'}
              titulo={tituloConAtajo('corte-clave', esCorteClave ? 'Este corte es clave: editar o quitar' : 'Marcar este corte como clave')}
              activo={esCorteClave ? true : undefined}
              onClick={onCorteClave}
            />
          )}
          {onCompartir && <Boton rotulo icono={cilShareAlt} texto="Compartir" titulo="Compartir el estudio: hoja en PDF o enlace temporal" onClick={onCompartir} />}
        </CButtonGroup>
      )}

      <CButtonGroup size="sm" role="group" aria-label="Pantalla">
        {onPresentacion && (
          <Boton icono={cilMonitor} texto="Presentación" titulo={tituloConAtajo('presentacion', 'Modo presentación: sólo la imagen, para enseñársela al paciente')} onClick={onPresentacion} />
        )}
        <Boton
          icono={pantallaCompleta ? cilFullscreenExit : cilFullscreen}
          titulo={tituloConAtajo('pantalla-completa', pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa')}
          activo={pantallaCompleta ? true : undefined}
          onClick={onPantallaCompleta}
        />
        <Boton icono={cilKeyboard} titulo={tituloConAtajo('ayuda', 'Atajos de teclado')} onClick={onAyuda} />
      </CButtonGroup>

      {extra}
    </div>
  )
}
