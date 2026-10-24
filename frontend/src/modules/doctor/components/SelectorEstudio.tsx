/**
 * Selector del estudio que se pide en una orden diagnostica.
 *
 * Antes el doctor tecleaba el nombre en un campo libre y el laboratorio
 * recibia diez variantes del mismo estudio. Aqui elige del catalogo del
 * laboratorio (el del formato en papel), con los grupos del dia a dia de la
 * clinica -- Imagen de la mujer y US de embarazo -- arriba y a la vista.
 *
 * Sigue existiendo la salida de escribirlo a mano: el catalogo es de un
 * laboratorio concreto y el doctor no se puede quedar atrapado.
 */
import { useMemo, useState } from 'react'
import {
  CBadge,
  CButton,
  CCol,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CRow,
  CSpinner,
} from '@coreui/react-pro'

import { useCatalogoEstudios } from '../hooks/useCatalogoEstudios'
import ErrorDeCampo from '../../../shared/components/ErrorDeCampo'
import {
  LATERALIDADES,
  LIMITE_NOMBRE_ESTUDIO,
  buscarEstudios,
  faltaEnSeleccion,
  ordenarGrupos,
  textoEstudio,
  type GrupoEstudios,
  type SeleccionEstudio,
} from '../utils/catalogoEstudios'

/** Avisos junto al campo que dejó un intento de emisión con faltantes. */
export interface ErroresSelectorEstudio {
  manual?: string
  region?: string
}

interface SelectorEstudioProps {
  seleccion: SeleccionEstudio
  onChange: (seleccion: SeleccionEstudio) => void
  disabled?: boolean
  errores?: ErroresSelectorEstudio
}

export const seleccionVacia = (): SeleccionEstudio => ({ grupo: null, estudio: '' })

const SelectorEstudio = ({
  seleccion,
  onChange,
  disabled = false,
  errores,
}: SelectorEstudioProps) => {
  const { grupos, cargando } = useCatalogoEstudios()
  const [busqueda, setBusqueda] = useState('')
  const manual = seleccion.manual !== undefined

  const ordenados = useMemo(() => ordenarGrupos(grupos), [grupos])
  const destacados = useMemo(() => ordenados.filter((g) => g.destacado), [ordenados])
  const resto = useMemo(() => ordenados.filter((g) => !g.destacado), [ordenados])
  const coincidencias = useMemo(() => buscarEstudios(grupos, busqueda), [grupos, busqueda])

  const grupo = seleccion.grupo
  const vistaPrevia = textoEstudio(seleccion)
  const falta = faltaEnSeleccion(seleccion)

  const elegir = (nuevoGrupo: GrupoEstudios, estudio: string) => {
    onChange({ grupo: nuevoGrupo, estudio })
    setBusqueda('')
  }
  const ajustar = (parcial: Partial<SeleccionEstudio>) => onChange({ ...seleccion, ...parcial })

  if (manual) {
    return (
      <>
        {/* Etiqueta ligada al campo: sin ella el lector de pantalla no lo nombraba. */}
        <CFormLabel htmlFor="selector-estudio-manual">Estudio o referencia</CFormLabel>
        <CFormInput
          id="selector-estudio-manual"
          maxLength={LIMITE_NOMBRE_ESTUDIO}
          value={seleccion.manual || ''}
          disabled={disabled}
          onChange={(e) => onChange({ grupo: null, estudio: '', manual: e.target.value })}
          placeholder="Ej. Perfil tiroideo"
          invalid={Boolean(errores?.manual)}
          aria-invalid={Boolean(errores?.manual) || undefined}
          aria-describedby={errores?.manual ? 'error-selector-manual' : undefined}
        />
        <ErrorDeCampo id="error-selector-manual" mensaje={errores?.manual} />
        <CButton
          size="sm"
          color="link"
          className="px-0"
          disabled={disabled}
          onClick={() => onChange(seleccionVacia())}
        >
          Elegir del catálogo de estudios
        </CButton>
      </>
    )
  }

  return (
    <>
      <CFormLabel>Estudio</CFormLabel>
      {cargando ? (
        <div className="small text-body-secondary">
          <CSpinner size="sm" className="me-2" />
          Cargando el catálogo de estudios...
        </div>
      ) : (
        <>
          <CFormInput
            value={busqueda}
            disabled={disabled}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Busca el estudio (mama, doppler, rodilla...)"
          />
          {coincidencias.length > 0 && (
            <div className="border rounded mt-1">
              {coincidencias.map(({ grupo: g, estudio }) => (
                <button
                  type="button"
                  key={`${g.clave}-${estudio}`}
                  className="btn btn-link btn-sm d-block text-start w-100 text-decoration-none"
                  disabled={disabled}
                  onClick={() => elegir(g, estudio)}
                >
                  {estudio} <span className="text-body-secondary small">· {g.nombre}</span>
                </button>
              ))}
            </div>
          )}
          {destacados.map((g) => (
            <div className="mt-2" key={g.clave}>
              <div className="small fw-semibold">
                {g.nombre}
                <CBadge color="info" className="ms-2">
                  frecuente
                </CBadge>
              </div>
              <div className="d-flex flex-wrap gap-1 mt-1">
                {g.estudios.map((estudio) => {
                  const activo = grupo?.clave === g.clave && seleccion.estudio === estudio
                  return (
                    <CButton
                      key={estudio}
                      size="sm"
                      color="primary"
                      variant={activo ? undefined : 'outline'}
                      disabled={disabled}
                      onClick={() => elegir(g, estudio)}
                    >
                      {estudio}
                    </CButton>
                  )
                })}
              </div>
            </div>
          ))}
          <CRow className="g-2 mt-1">
            <CCol md={6}>
              <CFormLabel className="small mb-1">Otros grupos del laboratorio</CFormLabel>
              <CFormSelect
                value={grupo && !grupo.destacado ? grupo.clave : ''}
                disabled={disabled}
                onChange={(e) => {
                  const elegido = resto.find((g) => g.clave === e.target.value) || null
                  onChange(elegido ? { grupo: elegido, estudio: '' } : seleccionVacia())
                }}
              >
                <option value="">Elige un grupo...</option>
                {resto.map((g) => (
                  <option key={g.clave} value={g.clave}>
                    {g.nombre}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            {grupo && !grupo.destacado && (
              <CCol md={6}>
                <CFormLabel className="small mb-1">Estudio del grupo</CFormLabel>
                <CFormSelect
                  value={seleccion.estudio}
                  disabled={disabled}
                  onChange={(e) => ajustar({ estudio: e.target.value })}
                >
                  <option value="">Elige el estudio...</option>
                  {grupo.estudios.map((estudio) => (
                    <option key={estudio} value={estudio}>
                      {estudio}
                    </option>
                  ))}
                </CFormSelect>
              </CCol>
            )}
            {grupo && (grupo.modificadores?.length ?? 0) > 0 && (
              <CCol md={6}>
                <CFormLabel className="small mb-1">Técnica</CFormLabel>
                <CFormSelect
                  value={seleccion.modificador || ''}
                  disabled={disabled}
                  onChange={(e) => ajustar({ modificador: e.target.value })}
                >
                  <option value="">Sin especificar</option>
                  {(grupo.modificadores || []).map((modificador) => (
                    <option key={modificador} value={modificador}>
                      {modificador}
                    </option>
                  ))}
                </CFormSelect>
              </CCol>
            )}
            {grupo?.requiere_region && (
              <CCol md={6}>
                <CFormLabel className="small mb-1">Región a estudiar</CFormLabel>
                <CFormInput
                  maxLength={120}
                  value={seleccion.region || ''}
                  disabled={disabled}
                  onChange={(e) => ajustar({ region: e.target.value })}
                  placeholder="Ej. Pélvico, miembro inferior"
                  invalid={Boolean(errores?.region)}
                  aria-invalid={Boolean(errores?.region) || undefined}
                  aria-describedby={errores?.region ? 'error-selector-region' : undefined}
                />
                <ErrorDeCampo id="error-selector-region" mensaje={errores?.region} />
              </CCol>
            )}
            {grupo?.requiere_lateralidad && (
              <CCol md={6}>
                <CFormLabel className="small mb-1">Lado</CFormLabel>
                <div className="d-flex gap-1">
                  {LATERALIDADES.map((lado) => (
                    <CButton
                      key={lado}
                      size="sm"
                      color="primary"
                      variant={seleccion.lateralidad === lado ? undefined : 'outline'}
                      disabled={disabled}
                      onClick={() => ajustar({ lateralidad: lado })}
                    >
                      {lado}
                    </CButton>
                  ))}
                </div>
              </CCol>
            )}
          </CRow>
          <div className="small mt-2">
            {vistaPrevia ? (
              <>
                Se guardará como: <strong>{vistaPrevia}</strong>
              </>
            ) : (
              <span className="text-body-secondary">Elige un estudio del catálogo.</span>
            )}
            {falta && seleccion.estudio && <div className="text-warning-emphasis">{falta}</div>}
          </div>
          <CButton
            size="sm"
            color="link"
            className="px-0"
            disabled={disabled}
            onClick={() => onChange({ grupo: null, estudio: '', manual: '' })}
          >
            El estudio no está en el catálogo: escribirlo a mano
          </CButton>
        </>
      )}
    </>
  )
}

export default SelectorEstudio
