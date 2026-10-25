import { Route, Routes } from 'react-router-dom'
import Lista from './Lista'
import Formulario from './Formulario'
import Expediente from './Expediente'

export default function Pacientes() {
  return (
    <Routes>
      <Route index element={<Lista />} />
      <Route path="nuevo" element={<Formulario />} />
      <Route path=":id/editar" element={<Formulario />} />
      <Route path=":id" element={<Expediente />} />
    </Routes>
  )
}
