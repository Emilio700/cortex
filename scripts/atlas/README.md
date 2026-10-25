# Atlas detallado de Neuro 3D (BodyParts3D)

`preparar_atlas.py` descarga **BodyParts3D 4.0** de la página oficial de DBCLS,
elige las estructuras de cabeza y columna por id FMA y deja en
`frontend/public/atlas/bodyparts3d/`:

| Archivo | Qué es |
|---|---|
| `cabeza.glb` | Cráneo hueso por hueso, encéfalo por giros, ventrículos, polígono de Willis, nervios II y IV (≈7.5 MB) |
| `columna.glb` | Vértebras C1–L5, sacro y discos (≈2.7 MB) |
| `manifiesto.json` | Cada nodo del GLB → id del catálogo de Neuro 3D, estructura que la contiene, capa, tejido y FMA |
| `CREDITOS.json` | Fuente, versión, licencia, texto de crédito exacto, URL y fecha |

Los modelos **no se guardan en git** (`frontend/public/atlas/` está en
`.gitignore`). Cada servidor los genera una vez; Vite los copia a la salida al
compilar (a `frontend/build/`). Sin ellos, Neuro 3D muestra la opción «Atlas detallado» deshabilitada
con el motivo «El atlas detallado no está instalado en este servidor».

## Licencia

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

(Texto exacto de <https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html>,
actualizado el 2025-02-27.) Los OBJ del zip, de 2013, conservan en su encabezado
la licencia anterior (CC BY-SA 2.1 JP); la página vigente declara CC BY 4.0 para
toda la base. El crédito se muestra en el pie «Créditos» de Neuro 3D y en la
captura PNG cuando el atlas está a la vista.

## Cómo correrlo

Necesita Python 3.10+ y unos 300 MB libres mientras corre (el zip pesa 136 MB).
Usa un entorno aparte con dependencias ligeras (todas MIT):

```bash
python -m venv /tmp/atlas-venv
/tmp/atlas-venv/bin/python -m pip install trimesh numpy scipy fast-simplification
/tmp/atlas-venv/bin/python scripts/atlas/preparar_atlas.py --cache /tmp/atlas-cache --borrar-cache
```

En Windows: `...\atlas-venv\Scripts\python.exe` en lugar de `.../bin/python`.

- `--cache`: dónde se guarda lo descargado. Si el zip ya está y su SHA-256
  coincide, no se vuelve a bajar.
- `--borrar-cache`: borra el zip y la tabla al terminar.
- `--salida`: otra carpeta de salida (por omisión, la de arriba).
- `--total-caras` (900 000) y `--taubin` (4): tope de triángulos y suavizado.

El script verifica **tamaño y SHA-256** del zip y de la tabla de partes (están
en `ARCHIVOS_ESPERADOS`). Si DBCLS publica otra cosa con el mismo nombre, se
detiene: hay que revisar la fuente antes de cambiar el hash.

Después de generarlo, vuelve a compilar el frontend (`npm run build`) para que
`frontend/build/` lleve la carpeta.

## Qué trae y qué no

- **Sí**: 13 huesos del cráneo (los pequeños de la cara se eligen como «Cráneo»),
  14 giros y lobulillos de cada lado con su lóbulo, lóbulos occipitales, ínsulas, hipocampos,
  giros cingulados, tálamos, cuerpo calloso, cerebelo, mesencéfalo, protuberancia,
  bulbo, ventrículos, carótidas internas, vertebrales, basilar, cerebrales
  anterior, media y posterior, comunicantes, nervios ópticos, quiasma, nervios
  trocleares, C1–L5, sacro y 22 discos.
- **No** (lo sigue dibujando el modelo simplificado): disco T12-L1 y cóccix
  (BodyParts3D no los trae), raíces nerviosas y médula por segmentos, senos
  venosos, yugulares (sólo viene un tramo de 4 cm) y el resto de los pares
  craneales.

## Coordenadas

BodyParts3D usa milímetros con +x a la izquierda del cuerpo, +y hacia atrás y +z
hacia arriba (LPS), con el origen a la altura de los pies. El GLB se escribe así,
sin tocar, y lo declara en `asset.extras.cortex`. La capa del frontend
(`servicios/anatomia/capaAtlas.ts`) lo pasa a la escena y lo alinea con el modelo
simplificado: la cabeza con una escala uniforme (0.8–1.25) a la caja de los
lóbulos, y cada vértebra rígida, con su tamaño real, al lugar de la vértebra
simplificada del mismo nivel.

## Pruebas

```bash
backend/.venv/Scripts/python -m pytest scripts/atlas
```

Prueban las funciones puras (selección por FMA, reparto de presupuesto, lado por
x, nombres) y que `frontend/src/modules/neuro3d/dominio/atlasMapeo.json` esté al
día. Si cambias la tabla `ESTRUCTURAS`, regenera el mapeo:

```bash
python scripts/atlas/preparar_atlas.py --escribir-mapeo frontend/src/modules/neuro3d/dominio/atlasMapeo.json
```

Referencia de otro pipeline (MIT): <https://github.com/ashemag/human-atlas>.
