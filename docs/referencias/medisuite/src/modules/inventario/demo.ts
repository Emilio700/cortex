// Datos demo de inventario: 25 productos con lotes (algunos por caducar o caducados, otros bajo mínimo).
import type { Registro } from '../../lib/types'
import type { Categoria, Producto } from './stock'

// nombre | presentación | unidad | categoría | mínimo | ubicación | precio | controlado | lotes: cantidad@costo:caducidad(días desde hoy):salidas
const RAW: [string, string, string, Categoria, number, string, number | null, boolean, [number, number, number, number][]][] = [
  ['Paracetamol', '500 mg 10 tabletas', 'caja', 'medicamento', 10, 'Estante A1', 35, false, [[30, 12.5, 420, 8], [20, 13, 200, 0]]],
  ['Ibuprofeno', '400 mg 10 tabletas', 'caja', 'medicamento', 8, 'Estante A1', 45, false, [[12, 18, 25, 6]]],
  ['Amoxicilina', '500 mg 12 cápsulas', 'caja', 'medicamento', 6, 'Estante A2', 85, false, [[10, 42, 300, 7]]],
  ['Ketorolaco', '30 mg/1 mL solución inyectable', 'ampolleta', 'medicamento', 10, 'Carro rojo', 40, false, [[25, 11, 50, 9], [20, 11.8, 540, 0]]],
  ['Dexametasona', '8 mg/2 mL solución inyectable', 'ampolleta', 'medicamento', 6, 'Carro rojo', 55, false, [[15, 19, 380, 4]]],
  ['Metamizol sódico', '1 g/2 mL solución inyectable', 'ampolleta', 'medicamento', 6, 'Carro rojo', 35, false, [[10, 8.5, -12, 2], [12, 9, 610, 3]]],
  ['Diclofenaco', '75 mg/3 mL solución inyectable', 'ampolleta', 'medicamento', 6, 'Carro rojo', 30, false, [[8, 7, 70, 5]]],
  ['Adrenalina (epinefrina)', '1 mg/1 mL solución inyectable', 'ampolleta', 'medicamento', 4, 'Carro rojo', null, false, [[6, 28, 150, 0]]],
  ['Salbutamol', '100 µg/dosis inhalador 200 dosis', 'pieza', 'medicamento', 3, 'Estante A3', 120, false, [[5, 68, 480, 1]]],
  ['Omeprazol', '20 mg 14 cápsulas', 'caja', 'medicamento', 5, 'Estante A2', 60, false, [[8, 22, 700, 2]]],
  ['Metformina', '850 mg 30 tabletas', 'caja', 'medicamento', 5, 'Estante A2', 55, false, [[6, 25, 40, 3]]],
  ['Losartán', '50 mg 30 tabletas', 'caja', 'medicamento', 5, 'Estante A2', 70, false, [[10, 30, 520, 2]]],
  ['Diazepam', '10 mg/2 mL solución inyectable', 'ampolleta', 'medicamento', 2, 'Gaveta con llave', null, true, [[5, 35, 330, 1]]],
  ['Tramadol', '100 mg/2 mL solución inyectable', 'ampolleta', 'medicamento', 3, 'Gaveta con llave', null, true, [[5, 32, 85, 3]]],
  ['Vacuna antiinfluenza', '0.5 mL jeringa prellenada', 'jeringa', 'vacuna', 10, 'Refrigerador', 350, false, [[20, 180, 160, 12]]],
  ['Toxoide tetánico-diftérico (Td)', '0.5 mL frasco ámpula', 'vial', 'vacuna', 5, 'Refrigerador', 250, false, [[10, 95, 55, 2]]],
  ['Solución fisiológica 0.9 %', '500 mL', 'frasco', 'insumo', 6, 'Bodega', 45, false, [[12, 21, 400, 4]]],
  ['Jeringa desechable', '5 mL con aguja 21G', 'pieza', 'insumo', 50, 'Cajón 1', 5, false, [[200, 1.8, 1500, 80]]],
  ['Guantes de nitrilo', 'talla M caja 100', 'caja', 'insumo', 3, 'Cajón 2', null, false, [[4, 145, 900, 2]]],
  ['Torundas de algodón', 'bolsa 500 g', 'paquete', 'material-curacion', 2, 'Cajón 2', null, false, [[3, 60, 0, 1]]],
  ['Gasas estériles', '10 x 10 cm sobre 2 piezas', 'sobre', 'material-curacion', 40, 'Cajón 3', 6, false, [[100, 2.4, 1100, 72]]],
  ['Venda elástica', '10 cm x 5 m', 'rollo', 'material-curacion', 5, 'Cajón 3', 35, false, [[10, 14, 0, 3]]],
  ['Sutura nylon 3-0', 'con aguja 3/8 círculo', 'sobre', 'material-curacion', 6, 'Cajón 4', 60, false, [[12, 24, 75, 8]]],
  ['Lidocaína 2 %', 'frasco ámpula 50 mL', 'vial', 'medicamento', 2, 'Estante A3', null, false, [[4, 65, 22, 1]]],
  ['Tiras reactivas de glucosa', 'frasco 50 tiras', 'frasco', 'insumo', 2, 'Estante B1', 380, false, [[3, 210, 120, 1]]],
]

export function demoInventario(now: number): Registro[] {
  const day = 86_400_000
  const iso = (t: number) => new Date(t).toISOString()
  const fecha = (dias: number) => new Date(now + dias * day).toISOString().slice(0, 10)
  const out: Registro[] = []
  const proveedores = ['Distribuidora Médica del Centro', 'Farmacéutica Nacional', 'Insumos Hospitalarios MX']
  RAW.forEach(([nombre, presentacion, unidad, categoria, stockMinimo, ubicacion, precio, controlado, lotes], i) => {
    const id = `demo-inv-${String(i + 1).padStart(2, '0')}`
    const p: Producto = { nombre, presentacion, unidad, categoria, stockMinimo, ubicacion, controlado, ...(precio !== null ? { precioVenta: precio } : {}) }
    out.push({ id, fecha: iso(now - 200 * day), tipo: 'inventario', estado: 'activo', titulo: `${nombre} ${presentacion}`, datos: { ...p } })
    lotes.forEach(([cantidad, costo, cad, salidas], j) => {
      const lote = `${nombre.slice(0, 3).toUpperCase()}${24 + j}${String(i * 7 + j * 3).padStart(3, '0')}`
      const fEntrada = now - (90 - j * 30) * day
      out.push({
        id: `${id}-e${j}`,
        fecha: iso(fEntrada),
        tipo: 'movimiento-inventario',
        titulo: `Entrada: ${nombre} ${presentacion} (+${cantidad} ${unidad})`,
        datos: { productoId: id, tipo: 'entrada', cantidad, lote, ...(cad ? { caducidad: fecha(cad) } : {}), costoUnitario: costo, proveedor: proveedores[(i + j) % 3], factura: `F-${1200 + i * 3 + j}` },
      })
      if (salidas > 0) {
        const aPaciente = salidas <= 2 && (categoria === 'vacuna' || (categoria === 'medicamento' && unidad === 'ampolleta' && !controlado))
        out.push({
          id: `${id}-s${j}`,
          fecha: iso(fEntrada + 20 * day),
          tipo: 'movimiento-inventario',
          ...(aPaciente ? { patientId: ['p1', 'p2', 'p4', 'p6'][i % 4] } : {}),
          titulo: `${aPaciente ? 'Aplicación' : 'Consumo interno'}: ${nombre} ${presentacion} (−${salidas} ${unidad})`,
          datos: { productoId: id, tipo: 'salida', cantidad: salidas, lote, ...(cad ? { caducidad: fecha(cad) } : {}), motivo: aPaciente ? 'aplicacion' : 'consumo' },
        })
      }
    })
  })
  return out
}
