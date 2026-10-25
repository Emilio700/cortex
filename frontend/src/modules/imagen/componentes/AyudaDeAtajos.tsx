/**
 * La lista de atajos de teclado del visor, para que se descubran.
 *
 * Sale de `ATAJOS`, la misma tabla que decide qué hace cada tecla: la ayuda no
 * puede describir una tecla que ya no hace eso.
 */
import { CButton, CModal, CModalBody, CModalFooter, CModalHeader, CModalTitle } from '@coreui/react-pro'

import { atajosPorGrupo } from '../dominio/atajos'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function AyudaDeAtajos({ visible, onClose }: Props) {
  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="lg">
      <CModalHeader>
        <CModalTitle>Atajos de teclado</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="visor-atajos">
          {atajosPorGrupo().map(({ grupo, atajos }) => (
            <section key={grupo}>
              <h3 className="visor-atajos__grupo">{grupo}</h3>
              <dl className="visor-atajos__lista">
                {atajos.map((atajo) => (
                  <div className="visor-atajos__fila" key={atajo.accion}>
                    <dt>
                      <kbd>{atajo.etiqueta}</kbd>
                    </dt>
                    <dd>{atajo.descripcion}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="visor-encabezado__meta mb-0 mt-3">
          Los atajos no funcionan mientras escribes en un campo ni con una ventana abierta.
          En una tableta, elige la herramienta en la barra y úsala con un dedo.
        </p>
      </CModalBody>
      <CModalFooter>
        <CButton color="primary" onClick={onClose}>
          Entendido
        </CButton>
      </CModalFooter>
    </CModal>
  )
}
