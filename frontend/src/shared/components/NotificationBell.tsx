/**
 * La campana del encabezado: abre el centro de avisos.
 *
 * El número rojo cuenta lo que pide hacer algo y sigue sin resolverse, no
 * cualquier aviso sin leer (plan 27, §3.3): si «agenda del día» sube el mismo
 * número que «paciente en sala», se aprende a ignorar el número. Lo
 * informativo sin leer sólo pinta un punto discreto.
 */
import { CButton } from '@coreui/react-pro'
import CIcon from '@coreui/icons-react'
import { cilBell } from '@coreui/icons'
import { useAvisos } from '../avisos/AvisosContext'
import { conLimite } from '../avisos/LimiteAvisos'

const NotificationBell = () => {
  const { porAtender, estado, abrirCentro, fallo } = useAvisos()
  const sinLeer = estado?.sin_leer ?? 0

  const etiqueta =
    porAtender > 0
      ? `Avisos: ${porAtender} por atender`
      : sinLeer > 0
        ? `Avisos: ${sinLeer} sin leer`
        : 'Avisos'

  return (
    <CButton
      color="link"
      className="position-relative text-body"
      onClick={abrirCentro}
      aria-label={fallo ? `${etiqueta}. No se pudieron actualizar.` : etiqueta}
      aria-haspopup="dialog"
    >
      <CIcon icon={cilBell} size="lg" />
      {porAtender > 0 ? (
        <span
          className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
          style={{ fontSize: '0.6rem' }}
          aria-hidden="true"
        >
          {porAtender > 9 ? '9+' : porAtender}
        </span>
      ) : (
        sinLeer > 0 && <span className="campana-avisos__punto" aria-hidden="true" />
      )}
    </CButton>
  )
}

export default conLimite(NotificationBell, 'la campana')
