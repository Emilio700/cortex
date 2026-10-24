/**
 * El inicio de la doctora (plan 28): lo que necesita saber al entrar, con
 * datos reales, para llegar rápido y encontrar las opciones sin batallar.
 *
 * Esta página solo compone; cada sección vive en `components/inicio/` y sus
 * cuentas en `utils/inicio.ts`. Cada sección carga y falla por separado
 * (`useInicioDoctora`): un error en las FPP no tapa la agenda, y un número que
 * no se sabe se ve «—», nunca «0».
 *
 * Orden: en escritorio, dos columnas como el boceto (agenda y recientes a la
 * izquierda; pendientes, acciones y calendario a la derecha). En el celular,
 * una columna en el orden en que se usa entre paciente y paciente:
 * encabezado → críticos → indicadores 2×2 → agenda → pendientes → acciones →
 * recientes → calendario (CSS `order`, `_inicio-doctora.scss`).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../../shared/context/AuthContext'
import { Role } from '../../../shared/types'
import { nombreConTratamiento } from '../../../shared/utils/tratamiento'
import { listMyClinics, listTenants } from '../../../shared/services/tenants'
import { hoyLocalISO } from '../../../shared/utils/date'
import { pedir } from '../../../shared/utils/pedidos'
import IncidenciasCriticas from '../components/IncidenciasCriticas'
import EncabezadoDelDia from '../components/inicio/EncabezadoDelDia'
import IndicadoresDelDia from '../components/inicio/IndicadoresDelDia'
import AgendaDeHoy from '../components/inicio/AgendaDeHoy'
import PendientesYSeguimiento from '../components/inicio/PendientesYSeguimiento'
import AccionesRapidas from '../components/inicio/AccionesRapidas'
import CalendarioDelMes from '../components/inicio/CalendarioDelMes'
import PacientesRecientes from '../components/inicio/PacientesRecientes'
import { useInicioDoctora } from '../hooks/useInicioDoctora'
import { contarDelDia, type PestanaAgenda } from '../utils/inicio'
import { pedirFiltroBandeja } from '../utils/filtroBandeja'

/**
 * La sucursal que se está viendo y si la doctora atiende en más de una. Si no
 * se pudo saber, no se dice nada: mejor sin nombre que con uno inventado.
 */
const useSucursalActiva = () => {
  const { user } = useAuth()
  const [nombre, setNombre] = useState<string | null>(null)
  const [varias, setVarias] = useState(false)

  useEffect(() => {
    if (!user) return
    let vigente = true
    listTenants()
      .then((sucursales) => {
        if (!vigente) return
        setNombre(sucursales.find((s) => s.id === user.tenant_id)?.name ?? null)
        if (sucursales.length > 1) setVarias(true)
      })
      .catch(() => undefined)
    if (user.role === Role.DOCTOR) {
      listMyClinics()
        .then((consultorios) => {
          if (!vigente) return
          const distintas = new Set(consultorios.map((c) => c.tenant_id))
          if (distintas.size > 1) setVarias(true)
          const propia = consultorios.find((c) => c.tenant_id === user.tenant_id)
          if (propia) setNombre((actual) => actual ?? propia.tenant_name)
        })
        .catch(() => undefined)
    }
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.tenant_id])

  return { nombre, varias }
}

export const DoctorDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const nombre = nombreConTratamiento(user)
  const esMaster = user?.role === Role.MASTER
  const sucursal = useSucursalActiva()
  const inicio = useInicioDoctora()
  const { citasHoy, recientes, resultados, criticos, prenatales, partos, veCitas, veSeguimiento } = inicio

  const [pestana, setPestana] = useState<PestanaAgenda>('todas')
  const agendaRef = useRef<HTMLDivElement>(null)

  const conteo = useMemo(() => (citasHoy.datos ? contarDelDia(citasHoy.datos) : null), [citasHoy.datos])
  const actualizando = citasHoy.cargando && citasHoy.datos !== null

  const irAPestana = (destino: PestanaAgenda) => {
    setPestana(destino)
    // En el celular la agenda queda abajo de los indicadores: se lleva ahí.
    agendaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const verAgenda = () => {
    if (can('appointments.read')) {
      pedir('agenda:dia', { fecha: hoyLocalISO() })
      navigate('/secretaria/agenda')
    } else {
      pedir('consultas:periodo', 'hoy')
      navigate('/doctor/appointments')
    }
  }

  return (
    <div className="inicio-doctora">
      <EncabezadoDelDia
        nombre={nombre}
        sucursal={sucursal.nombre}
        esMaster={esMaster}
        actualizadoEn={citasHoy.actualizadoEn}
        errorDeRefresco={citasHoy.datos ? citasHoy.error : null}
        actualizando={actualizando}
        onActualizar={inicio.refrescarTodo}
      />

      {/* Lo único que no puede esperar: arriba de todo, solo si hay (plan 26, D-3). */}
      {veSeguimiento && (
        <IncidenciasCriticas
          controlado={{ datos: criticos.datos, error: criticos.error, recargar: () => void criticos.recargar() }}
        />
      )}

      {veCitas && (
        <IndicadoresDelDia
          conteo={conteo}
          errorCitas={citasHoy.error}
          cargandoCitas={citasHoy.cargando}
          veSeguimiento={veSeguimiento}
          resultados={resultados.datos}
          errorResultados={resultados.error}
          cargandoResultados={resultados.cargando}
          criticos={criticos.datos ? criticos.datos.total : null}
          onIrAPestana={irAPestana}
          onIrABandeja={() => {
            pedirFiltroBandeja('por_revisar')
            navigate('/doctor/results')
          }}
        />
      )}

      <div className="inicio-cuerpo">
        <div className="inicio-columna inicio-columna-principal">
          {veCitas && (
            <div className="inicio-orden-agenda" ref={agendaRef}>
              <AgendaDeHoy
                citas={citasHoy.datos}
                conteo={conteo}
                cargando={citasHoy.cargando}
                error={citasHoy.error}
                onReintentar={() => void citasHoy.recargar()}
                pestana={pestana}
                onPestana={setPestana}
                sucursalDelVacio={sucursal.varias ? sucursal.nombre : null}
                onVerAgenda={verAgenda}
                puedeVerAgenda={can('appointments.read') || can('doctor.appointments.read')}
              />
            </div>
          )}
          {veCitas && (
            <div className="inicio-orden-recientes">
              <PacientesRecientes recientes={recientes} />
            </div>
          )}
        </div>

        <div className="inicio-columna inicio-columna-lateral">
          {veSeguimiento && (
            <div className="inicio-orden-pendientes">
              <PendientesYSeguimiento
                criticos={criticos}
                resultados={resultados}
                prenatales={prenatales}
                partos={partos}
              />
            </div>
          )}
          <div className="inicio-orden-acciones">
            <AccionesRapidas citasHoy={citasHoy.datos} errorCitas={citasHoy.error} />
          </div>
          {veCitas && can('appointments.read') && (
            <div className="inicio-orden-calendario">
              <CalendarioDelMes />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DoctorDashboard
