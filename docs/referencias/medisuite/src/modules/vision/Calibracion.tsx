import { useEffect, useState } from 'react'
import { CreditCard, Minus, Plus, RotateCcw, Save } from 'lucide-react'
import { Button, Card, Notice } from '../../components/ui'
import { toast } from '../../components/toast'
import { cx, fmtFechaHora } from '../../lib/utils'
import { TARJETA_ID1 } from './optotipos'
import type { useCalibracion } from './useCalibracion'

type Cal = ReturnType<typeof useCalibracion>

export function Calibracion({ c }: { c: Cal }) {
  // En pantallas angostas la tarjeta se coloca vertical (se mide su lado corto).
  const [vertical, setVertical] = useState(() => window.innerWidth < 560)
  const [largoPx, setLargoPx] = useState(() => Math.round(c.cal?.anchoPx ?? (96 / 25.4) * TARJETA_ID1.anchoMm))
  useEffect(() => {
    if (c.cal) setLargoPx(Math.round(c.cal.anchoPx))
  }, [c.cal])
  const cortoPx = (largoPx * TARJETA_ID1.altoMm) / TARJETA_ID1.anchoMm
  const w = vertical ? cortoPx : largoPx
  const h = vertical ? largoPx : cortoPx
  const pxmm = largoPx / TARJETA_ID1.anchoMm
  const radio = 3.18 * pxmm // esquinas ISO/IEC 7810 ≈ 3.18 mm
  const paso = (d: number) => setLargoPx((x) => Math.min(1400, Math.max(150, Math.round(x + d))))

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card title="Ajuste con tarjeta de tamaño estándar">
        <p className="mb-3 text-sm text-muted">
          Coloque una tarjeta bancaria, credencial INE u otra tarjeta ID-1 (<b>85.60 × 53.98 mm</b>, ISO/IEC 7810) sobre la pantalla y ajuste el rectángulo hasta que
          coincida exactamente con sus bordes. Hágalo con el zoom del navegador al 100 % y en la pantalla donde mostrará los optotipos.
        </p>
        <div className="overflow-hidden py-2">
          <div
            className="relative mx-auto flex items-center justify-center border-2 border-brand bg-brand-soft/60 text-brand-strong"
            style={{ width: w, height: h, borderRadius: radio }}
            aria-label={`Rectángulo de calibración de ${Math.round(w)} × ${Math.round(h)} px`}
            role="img"
          >
            <CreditCard className="size-8 opacity-60" />
            <span className="absolute bottom-1 right-2 text-[11px] tabular-nums opacity-70">{vertical ? '53.98 mm' : '85.60 mm'} = {Math.round(w)} px</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => paso(-10)} aria-label="Reducir 10 píxeles">
            <Minus className="size-4" />10
          </Button>
          <Button size="sm" onClick={() => paso(-1)} aria-label="Reducir 1 píxel">
            <Minus className="size-4" />1
          </Button>
          <input
            type="range"
            min={150}
            max={1400}
            value={largoPx}
            onChange={(e) => setLargoPx(Number(e.target.value))}
            className="min-w-32 flex-1 accent-[var(--color-brand)]"
            aria-label="Tamaño del rectángulo"
          />
          <Button size="sm" onClick={() => paso(1)} aria-label="Aumentar 1 píxel">
            <Plus className="size-4" />1
          </Button>
          <Button size="sm" onClick={() => paso(10)} aria-label="Aumentar 10 píxeles">
            <Plus className="size-4" />10
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setVertical((v) => !v)}>
            <RotateCcw className="size-4" /> Tarjeta {vertical ? 'horizontal' : 'vertical'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              c.guardar(largoPx)
              toast('Calibración guardada en este dispositivo.', 'ok')
            }}
          >
            <Save className="size-4" /> Guardar calibración
          </Button>
          {c.cal && (
            <Button variant="ghost" size="sm" onClick={c.borrar}>
              Borrar calibración
            </Button>
          )}
        </div>
      </Card>
      <div className="space-y-4">
        <Card title="Resultado">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-muted">Píxeles por mm</dt>
            <dd className="text-right font-semibold tabular-nums">{pxmm.toFixed(2)}</dd>
            <dt className="text-muted">Equivale a</dt>
            <dd className="text-right tabular-nums">{Math.round(pxmm * 25.4)} px CSS/pulgada</dd>
            <dt className="text-muted">Estado</dt>
            <dd className={cx('text-right', c.cal ? 'text-ok' : 'text-warn')}>{c.cal ? 'Calibrada' : 'Sin calibrar'}</dd>
            {c.cal && (
              <>
                <dt className="text-muted">Guardada</dt>
                <dd className="text-right text-xs">{fmtFechaHora(c.cal.fecha)}</dd>
              </>
            )}
          </dl>
        </Card>
        {c.cambio && <Notice tone="warn">El zoom o la resolución de la pantalla cambiaron desde la última calibración. Vuelva a calibrar.</Notice>}
        <Notice>
          La calibración se guarda solo en este navegador y dispositivo. Si cambia de monitor, de zoom o conecta un proyector, repítala. Los optotipos se
          dibujan con esta medida; un error de 5 % en la calibración equivale a ≈0.02 logMAR.
        </Notice>
      </div>
    </div>
  )
}
