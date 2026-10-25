import { useRef } from 'react'
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import Lista from './Lista'
import Editor from './Editor'

export default function Consulta() {
  return (
    <Routes>
      <Route index element={<Lista />} />
      <Route path=":id" element={<EditorRuta />} />
    </Routes>
  )
}

// "nueva" y ":id" comparten ruta para que al crear el borrador (nueva → id) el editor no se remonte
function EditorRuta() {
  const { id = 'nueva' } = useParams()
  const { search } = useLocation()
  const nav = useNavigate()
  const creado = useRef<string | null>(null)
  const actual = useRef({ ruta: id + search, key: id + search })
  if (actual.current.ruta !== id + search) {
    actual.current = { ruta: id + search, key: id === creado.current ? actual.current.key : id + search }
  }
  return (
    <Editor
      key={actual.current.key}
      id={id === 'nueva' ? null : id}
      onCreado={(nuevo) => {
        creado.current = nuevo
        nav('/consulta/' + nuevo, { replace: true })
      }}
    />
  )
}
