// Detección de tipo MIME por bytes mágicos. Nunca se confía en el nombre ni en el Content-Type del cliente.

const startsWith = (b: Buffer, sig: number[], offset = 0) => b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v)
const ascii = (b: Buffer, s: string, offset = 0) => b.length >= offset + s.length && b.toString('latin1', offset, offset + s.length) === s

/** Comprueba que el bloque parezca texto UTF-8 (sin bytes de control binarios). */
function looksText(b: Buffer): boolean {
  if (b.length === 0) return false
  let end = b.length
  // No penalizar una secuencia UTF-8 cortada al final del bloque.
  while (end > 0 && end > b.length - 4 && (b[end - 1] & 0xc0) === 0x80) end--
  if (end > 0 && b[end - 1] >= 0xc0) end--
  const s = b.subarray(0, end)
  for (const byte of s) {
    if (byte === 0) return false
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c) return false
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(s)
    return true
  } catch {
    return false
  }
}

function looksCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10)
  if (lines.length < 2) return false
  for (const sep of [',', ';', '\t']) {
    const counts = lines.map((l) => l.split(sep).length - 1)
    if (counts[0] > 0 && counts.every((c) => c === counts[0])) return true
  }
  return false
}

/**
 * @param head primeros bytes del archivo (≥ 4 KB recomendados)
 * @param full contenido completo si es pequeño (para validar JSON); opcional
 */
export function sniffMime(head: Buffer, full?: Buffer): string {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (ascii(head, 'RIFF') && ascii(head, 'WEBP', 8)) return 'image/webp'
  if (ascii(head, 'RIFF') && ascii(head, 'WAVE', 8)) return 'audio/wav'
  if (ascii(head, '%PDF-')) return 'application/pdf'
  if (ascii(head, 'DICM', 128)) return 'application/dicom'
  if (ascii(head, 'glTF') && head.length >= 8 && head.readUInt32LE(4) === 2) return 'model/gltf-binary'
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'audio/webm' // contenedor Matroska/WebM (audio o video)
  if (ascii(head, 'ID3') || (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (head[1] & 0x06) !== 0)) return 'audio/mpeg'

  let h = head
  if (startsWith(h, [0xef, 0xbb, 0xbf])) h = h.subarray(3)
  if (!looksText(h)) return 'application/octet-stream'
  const text = h.toString('utf8')
  const t = text.trimStart()
  if (t.startsWith('<?xml') || /^<[A-Za-z][\w:.-]*[\s>/]/.test(t)) {
    // HTML/SVG nunca se sirven como tales (riesgo de XSS): quedan como texto plano.
    if (/^<!doctype html|^<html|<svg[\s>]|<script[\s>]/i.test(t.slice(0, 2048))) return 'text/plain'
    return 'application/xml'
  }
  if (t.startsWith('{') || t.startsWith('[')) {
    if (full) {
      try {
        JSON.parse(full.toString('utf8').replace(/^﻿/, ''))
        return 'application/json'
      } catch {
        /* no es JSON válido */
      }
    } else return 'application/json'
  }
  if (looksCsv(text)) return 'text/csv'
  return 'text/plain'
}
