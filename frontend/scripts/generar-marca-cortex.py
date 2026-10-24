"""Genera los recursos de marca de Cortex a partir del logo original.

El logo (docs/marca/logo-cortex.jpeg) es un cerebro luminoso sobre azul marino.
Para usarlo sobre cualquier fondo oscuro se recorta el cerebro y el fondo se
vuelve transparente según la luminancia: lo que brilla se queda, el azul
marino desaparece. Así el resplandor del original se conserva sin halo.

Uso (desde frontend/):  python scripts/generar-marca-cortex.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ.parent / "docs" / "marca" / "logo-cortex.jpeg"
IMAGENES = RAIZ / "src" / "assets" / "images"
ICONOS = RAIZ / "public" / "icons"

MARINO = (5, 12, 28)
# Caja del cerebro dentro del logo de 1254 px (sin el texto CORTEX).
CAJA_CEREBRO = (300, 255, 975, 805)


def _promedio(img: Image.Image, x: int, y: int, r: int = 6):
    caja = img.crop((max(x - r, 0), max(y - r, 0), x + r, y + r))
    datos = list(caja.get_flattened_data())
    return tuple(sum(c[i] for c in datos) / len(datos) for i in range(3))


def cerebro_transparente(logo: Image.Image) -> Image.Image:
    recorte = logo.crop(CAJA_CEREBRO).convert("RGB")
    ancho, alto = recorte.size
    # El fondo del original no es un marino parejo: es un degradado que va de
    # casi negro abajo a un azul más claro arriba a la derecha. Restar un solo
    # color dejaba un rectángulo tenue; se estima el fondo de cada píxel
    # interpolando las cuatro esquinas de la caja, que son puro fondo.
    esquinas = [_promedio(recorte, x, y) for x, y in ((6, 6), (ancho - 7, 6), (6, alto - 7), (ancho - 7, alto - 7))]
    pixeles = []
    for indice, (r, g, b) in enumerate(recorte.get_flattened_data()):
        u = (indice % ancho) / (ancho - 1)
        v = (indice // ancho) / (alto - 1)
        fondo = [
            (1 - u) * (1 - v) * esquinas[0][k] + u * (1 - v) * esquinas[1][k]
            + (1 - u) * v * esquinas[2][k] + u * v * esquinas[3][k]
            for k in range(3)
        ]
        r2, g2, b2 = max(r - fondo[0], 0), max(g - fondo[1], 0), max(b - fondo[2], 0)
        alfa = max(r2, g2, b2)
        alfa = 0 if alfa < 14 else min(255, int((alfa - 14) * 1.4))
        if alfa == 0:
            pixeles.append((0, 0, 0, 0))
            continue
        # Se desmultiplica el color para que al componer sobre negro dé el original.
        escala = 255 / max(r2, g2, b2)
        pixeles.append((min(255, int(r2 * escala)), min(255, int(g2 * escala)), min(255, int(b2 * escala)), alfa))
    salida = Image.new("RGBA", recorte.size)
    salida.putdata(pixeles)
    return salida.crop(salida.getbbox())


def icono(cerebro: Image.Image, lado: int, margen: float, redondeo: float) -> Image.Image:
    lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    fondo = Image.new("RGBA", (lado, lado), MARINO + (255,))
    # Un brillo azul detrás del cerebro, como en el logo.
    brillo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    ImageDraw.Draw(brillo).ellipse(
        (lado * 0.18, lado * 0.18, lado * 0.82, lado * 0.82), fill=(30, 110, 255, 90)
    )
    fondo = Image.alpha_composite(fondo, brillo.filter(ImageFilter.GaussianBlur(lado * 0.12)))
    mascara = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(mascara).rounded_rectangle((0, 0, lado - 1, lado - 1), radius=int(lado * redondeo), fill=255)
    lienzo.paste(fondo, (0, 0), mascara)
    ancho = int(lado * (1 - 2 * margen))
    alto = int(cerebro.height * ancho / cerebro.width)
    pieza = cerebro.resize((ancho, alto), Image.LANCZOS)
    lienzo.alpha_composite(pieza, ((lado - ancho) // 2, (lado - alto) // 2))
    return lienzo


def main():
    logo = Image.open(ORIGEN)
    cerebro = cerebro_transparente(logo)
    cerebro.save(IMAGENES / "cortex-cerebro.png", optimize=True)
    cerebro.resize((cerebro.width // 3, cerebro.height // 3), Image.LANCZOS).save(
        IMAGENES / "cortex-cerebro-chico.png", optimize=True
    )

    ICONOS.mkdir(parents=True, exist_ok=True)
    icono(cerebro, 512, 0.08, 0.22).save(ICONOS / "icon-512.png")
    icono(cerebro, 192, 0.08, 0.22).save(ICONOS / "icon-192.png")
    # El maskable va a sangre: el sistema recorta la forma, el cerebro queda
    # dentro de la zona segura (80 % central).
    icono(cerebro, 512, 0.2, 0).save(ICONOS / "icon-maskable-512.png")
    icono(cerebro, 180, 0.08, 0).save(ICONOS / "apple-touch-icon.png")
    icono(cerebro, 32, 0.02, 0.2).save(ICONOS / "favicon-32.png")
    icono(cerebro, 16, 0.0, 0.2).save(ICONOS / "favicon-16.png")
    icono(cerebro, 48, 0.02, 0.2).save(RAIZ / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("Marca generada:", cerebro.size)


if __name__ == "__main__":
    main()
