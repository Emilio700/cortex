/**
 * Mensaje de error debajo de un campo, para los formularios con `noValidate`.
 *
 * Se pinta siempre que haya mensaje (no depende de las clases de Bootstrap,
 * que sólo se muestran si el aviso es hermano exacto del campo). El campo va
 * con `invalid` y, cuando hay aviso, `aria-describedby` apuntando a este id.
 */
import React from 'react'

interface Props {
  /** Id del aviso; el campo lo referencia con aria-describedby. */
  id?: string
  /** Sin mensaje no se pinta nada. */
  mensaje?: string | null
}

const ErrorDeCampo: React.FC<Props> = ({ id, mensaje }) =>
  mensaje ? (
    <div id={id} className="text-danger small mt-1" role="alert">
      {mensaje}
    </div>
  ) : null

export default ErrorDeCampo
