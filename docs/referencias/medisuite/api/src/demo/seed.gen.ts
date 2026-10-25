// @ts-nocheck
// ARCHIVO GENERADO por api/scripts/gen-seed.mjs a partir de src/lib/seed.ts — NO EDITAR A MANO.
// Regenerar: (cd api && npm run gen:seed). Verificar: npm run check:seed.
// Entradas: src/lib/seed.ts, src/lib/utils.ts, src/modules/audiometria/audiograma.ts, src/modules/audiometria/demo.ts, src/modules/certificados/demo.ts, src/modules/certificados/documento.ts, src/modules/certificados/plantillas.ts, src/modules/desarrollo/demo.ts, src/modules/desarrollo/hitos.ts, src/modules/encuestas/demo.ts, src/modules/encuestas/nps.ts, src/modules/enfermeria/calc.ts, src/modules/enfermeria/demo.ts, src/modules/inventario/demo.ts, src/modules/nutricion/demo.ts, src/modules/nutricion/nutri.ts, src/modules/ordenes/catalogo.ts, src/modules/ordenes/comun.ts, src/modules/ordenes/demo.ts, src/modules/ordenes/ordenes.ts, src/modules/prenatal/calc.ts, src/modules/prenatal/demo.ts, src/modules/prenatal/modelo.ts, src/modules/tamizajes/demo.ts, src/modules/tareas/demo.ts, src/modules/tareas/tareas.ts, src/modules/triaje/demo.ts, src/modules/triaje/esi.ts, src/modules/vacunacion/demo.ts, src/modules/vacunacion/esquema.ts, src/modules/vision/demo.ts, src/modules/vision/optotipos.ts
// src/modules/audiometria/audiograma.ts
var FRECUENCIAS = [250, 500, 1e3, 2e3, 3e3, 4e3, 6e3, 8e3];
var PTA_FRECS = [500, 1e3, 2e3, 4e3];
function vacio() {
  return { der: { aerea: {}, osea: {} }, izq: { aerea: {}, osea: {} } };
}
function etiquetaFrec(f) {
  return f >= 1e3 ? `${f / 1e3}k` : String(f);
}
function pta(u, frecs = PTA_FRECS) {
  const vals = frecs.map((f) => u[f]?.db);
  if (vals.some((v) => v === null || v === void 0 || !Number.isFinite(v))) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10;
}
var GRADOS_OMS = [
  { id: "normal", nombre: "Audición normal", rango: "< 20 dB", min: -Infinity, max: 20, tono: "ok" },
  { id: "leve", nombre: "Pérdida leve", rango: "20 a < 35 dB", min: 20, max: 35, tono: "warn" },
  { id: "moderada", nombre: "Pérdida moderada", rango: "35 a < 50 dB", min: 35, max: 50, tono: "warn" },
  { id: "moderadamente-severa", nombre: "Pérdida moderadamente severa", rango: "50 a < 65 dB", min: 50, max: 65, tono: "danger" },
  { id: "severa", nombre: "Pérdida severa", rango: "65 a < 80 dB", min: 65, max: 80, tono: "danger" },
  { id: "profunda", nombre: "Pérdida profunda", rango: "80 a < 95 dB", min: 80, max: 95, tono: "danger" },
  { id: "completa", nombre: "Pérdida completa / total", rango: "≥ 95 dB", min: 95, max: Infinity, tono: "danger" }
];
function gradoOMS(ptaDb) {
  const g = GRADOS_OMS.find((x) => ptaDb >= x.min && ptaDb < x.max) ?? GRADOS_OMS[GRADOS_OMS.length - 1];
  return { id: g.id, nombre: g.nombre, rango: g.rango, tono: g.tono };
}
function clasificacion(ptaDer, ptaIzq) {
  if (ptaDer === null && ptaIzq === null) return { grado: null, unilateral: false, mejor: null };
  if (ptaDer === null || ptaIzq === null) {
    const v = ptaDer ?? ptaIzq;
    return { grado: gradoOMS(v), unilateral: false, mejor: null };
  }
  const mejor = Math.min(ptaDer, ptaIzq);
  const peor = Math.max(ptaDer, ptaIzq);
  return { grado: gradoOMS(mejor), unilateral: mejor < 20 && peor >= 35, mejor };
}
var ASIM_FRECS = [500, 1e3, 2e3, 4e3, 8e3];
function asimetria(u, umbral = 15, via = "aerea") {
  const diferencias = {};
  const cumple = ASIM_FRECS.map((f) => {
    const a = u.der[via][f]?.db;
    const b = u.izq[via][f]?.db;
    if (a == null || b == null) return false;
    diferencias[f] = Math.abs(a - b);
    return Math.abs(a - b) >= umbral;
  });
  const frecs = /* @__PURE__ */ new Set();
  for (let i = 1; i < cumple.length; i++)
    if (cumple[i] && cumple[i - 1]) {
      frecs.add(ASIM_FRECS[i - 1]);
      frecs.add(ASIM_FRECS[i]);
    }
  return { asimetrica: frecs.size > 0, frecuencias: [...frecs], diferencias };
}
function brechaAereoOsea(u, oido, umbral = 15) {
  const brechas = {};
  const frecs = [];
  for (const f of FRECUENCIAS) {
    const a = u[oido].aerea[f]?.db;
    const o = u[oido].osea[f]?.db;
    if (a == null || o == null) continue;
    brechas[f] = a - o;
    if (a - o >= umbral) frecs.push(f);
  }
  return { significativa: frecs.length >= 2, frecuencias: frecs, brechas };
}
function interpretar(u) {
  const ptaDer = pta(u.der.aerea);
  const ptaIzq = pta(u.izq.aerea);
  const asim = asimetria(u);
  const brechaDer = brechaAereoOsea(u, "der");
  const brechaIzq = brechaAereoOsea(u, "izq");
  const global = clasificacion(ptaDer, ptaIzq);
  const referir = [];
  if (asim.asimetrica) referir.push(`Asimetría ≥ 15 dB en frecuencias adyacentes (${asim.frecuencias.map(etiquetaFrec).join(", ")} Hz): valorar estudio de oído interno/conducto auditivo (NICE NG98).`);
  if (brechaDer.significativa) referir.push(`Brecha aéreo-ósea ≥ 15 dB en oído derecho (${brechaDer.frecuencias.map(etiquetaFrec).join(", ")} Hz): componente conductivo.`);
  if (brechaIzq.significativa) referir.push(`Brecha aéreo-ósea ≥ 15 dB en oído izquierdo (${brechaIzq.frecuencias.map(etiquetaFrec).join(", ")} Hz): componente conductivo.`);
  if ((ptaDer ?? 0) >= 20 || (ptaIzq ?? 0) >= 20) referir.push("PTA ≥ 20 dB HL en al menos un oído: valoración audiológica / otorrinolaringológica.");
  return { ptaDer, ptaIzq, gradoDer: ptaDer === null ? null : gradoOMS(ptaDer), gradoIzq: ptaIzq === null ? null : gradoOMS(ptaIzq), global, asim, brechaDer, brechaIzq, referir };
}

// src/modules/audiometria/demo.ts
var DAY = 864e5;
function umbrales(der, izq, oseaDer, oseaIzq) {
  const u = vacio();
  FRECUENCIAS.forEach((f, i) => {
    if (der[i] != null) u.der.aerea[f] = { db: der[i] };
    if (izq[i] != null) u.izq.aerea[f] = { db: izq[i] };
    if (oseaDer?.[i] != null) u.der.osea[f] = { db: oseaDer[i] };
    if (oseaIzq?.[i] != null) u.izq.osea[f] = { db: oseaIzq[i] };
  });
  return u;
}
function registro(id, patientId, fecha, u, equipo, notas) {
  const it = interpretar(u);
  const g = it.global.grado;
  return {
    id,
    patientId,
    fecha,
    tipo: "audiometria",
    estado: "completada",
    titulo: `Audiometría: ${g ? g.nombre.toLowerCase() : "umbrales capturados"} · PTA OD ${it.ptaDer} · OI ${it.ptaIzq} dB HL`,
    datos: {
      modo: "audiograma",
      umbrales: u,
      pta: { der: it.ptaDer, izq: it.ptaIzq },
      grado: g?.id ?? null,
      unilateral: it.global.unilateral,
      asimetria: it.asim.frecuencias,
      brecha: { der: it.brechaDer.frecuencias, izq: it.brechaIzq.frecuencias },
      hallazgos: it.referir,
      equipo,
      notas
    }
  };
}
function demoAudiometria(now) {
  const sofia = umbrales([15, 10, 10, 5, null, 10, null, 10], [15, 15, 10, 10, null, 5, null, 10]);
  const jose = umbrales([15, 20, 25, 35, 45, 55, 60, 65], [15, 20, 25, 30, 40, 50, 60, 70], [null, 15, 25, 30, null, 50, null, null], [null, 15, 20, 30, null, 45, null, null]);
  return [
    registro("reg-aud-p3-1", "p3", new Date(now - 45 * DAY).toISOString(), sofia, "Audiómetro de tamiz escolar", "Tamiz auditivo preescolar: pasa en ambos oídos. Otoscopia normal."),
    registro("reg-aud-p2-1", "p2", new Date(now - 120 * DAY).toISOString(), jose, "Audiómetro clínico, cabina", "Patrón descendente en agudos, simétrico: compatible con presbiacusia. Valorar auxiliares auditivos.")
  ];
}

// src/modules/ordenes/comun.ts
function siguienteFolio(prefijo, existentes, ancho = 6) {
  const re = new RegExp("^" + prefijo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-(\\d+)$");
  let max = 0;
  for (const f of existentes) {
    const m = f ? re.exec(f.trim()) : null;
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefijo}-${String(max + 1).padStart(ancho, "0")}`;
}
function canonico(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return "[" + v.map((x) => canonico(x === void 0 ? null : x)).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).filter((k) => o[k] !== void 0).sort().map((k) => JSON.stringify(k) + ":" + canonico(o[k])).join(",") + "}";
}
var K = new Uint32Array([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
function sha256Hex(texto) {
  const bytes = new TextEncoder().encode(texto);
  const l = bytes.length;
  const n = l + 9 + 63 >> 6 << 6 >>> 0;
  const m = new Uint8Array(n);
  m.set(bytes);
  m[l] = 128;
  const bits = l * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 8, Math.floor(bits / 4294967296));
  dv.setUint32(n - 4, bits >>> 0);
  const H2 = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225]);
  const W = new Uint32Array(64);
  const rotr = (x, r3) => x >>> r3 | x << 32 - r3;
  for (let off = 0; off < n; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ W[i - 15] >>> 3;
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ W[i - 2] >>> 10;
      W[i] = W[i - 16] + s0 + W[i - 7] + s1 >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H2;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + W[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    H2[0] += a;
    H2[1] += b;
    H2[2] += c;
    H2[3] += d;
    H2[4] += e;
    H2[5] += f;
    H2[6] += g;
    H2[7] += h;
  }
  return [...H2].map((x) => x.toString(16).padStart(8, "0")).join("");
}

// src/modules/certificados/plantillas.ts
var PLANTILLAS = [
  { id: "salud", nombre: "Certificado médico de salud", tipoRegistro: "certificado", prefijo: "CM", descripcion: "Buena salud, para trabajo, escolar o deportivo." },
  { id: "asistencia", nombre: "Constancia de asistencia a consulta", tipoRegistro: "certificado", prefijo: "CM", descripcion: "Hace constar que el paciente acudió a consulta en fecha y horario." },
  {
    id: "incapacidad",
    nombre: "Justificante médico / reposo",
    tipoRegistro: "certificado",
    prefijo: "CM",
    descripcion: "Días de reposo con fechas; el diagnóstico es opcional por privacidad.",
    aviso: "Las incapacidades temporales para el trabajo con validez oficial ante el IMSS solo las expide un médico del IMSS (Ley del Seguro Social y Reglamento de Prestaciones Médicas del IMSS). Este justificante es un documento médico privado: no genera subsidio ni sustituye la incapacidad del IMSS o ISSSTE."
  },
  {
    id: "prenupcial",
    nombre: "Certificado médico prenupcial",
    tipoRegistro: "certificado",
    prefijo: "CM",
    descripcion: "Para trámite de matrimonio civil.",
    aviso: "Los requisitos del certificado prenupcial (estudios como VDRL, VIH, grupo y Rh, vigencia y formato) los fija el Código Civil y el Registro Civil de cada entidad federativa, y algunas ya no lo exigen. Verifique los requisitos locales vigentes antes de emitirlo (verificar)."
  },
  { id: "referencia", nombre: "Carta de referencia / contrarreferencia", tipoRegistro: "referencia", prefijo: "RF", descripcion: "Envío a especialidad u hospital con resumen clínico (NOM-004-SSA3-2012, 6.4)." }
];
var infoPlantilla = (id) => PLANTILLAS.find((p) => p.id === id) ?? PLANTILLAS[0];
var s = (v) => typeof v === "string" ? v.trim() : "";
var art = (sexo, f, m, o = `${m}(a)`) => sexo === "F" ? f : sexo === "M" ? m : o;
function fechaLarga(isoDia) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoDia) ? /* @__PURE__ */ new Date(isoDia + "T12:00:00") : new Date(isoDia);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}
function diasIncapacidad(desde, hasta) {
  const a = Date.parse(desde + "T12:00:00Z");
  const b = Date.parse(hasta + "T12:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 864e5) + 1;
}
var NUM = ["cero", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince"];
function diasConLetra(n) {
  const l = NUM[n];
  return `${n}${l ? ` (${l === "un" ? "un" : l})` : ""} día${n === 1 ? "" : "s"}`;
}
function generarCuerpo(plantilla, c, p, fechaISO, medico) {
  const fecha = fechaLarga(fechaISO.slice(0, 10));
  const el = art(p.sexo, "la", "el", "el(la)");
  const pac = `${p.nombre}${p.curp ? `, con CURP ${p.curp},` : ","} de ${p.edad} de edad`;
  const suscribe = `Quien suscribe, ${medico.nombre || "médico tratante"}, con cédula profesional ${medico.cedula || "—"}`;
  const destinatario = s(c.destinatario) || "A quien corresponda";
  const out = [{ texto: destinatario + ":" }];
  const somato = () => [
    s(c.peso) && `peso ${s(c.peso)} kg`,
    s(c.talla) && `talla ${s(c.talla)} cm`,
    s(c.ta) && `TA ${s(c.ta)} mmHg`,
    s(c.fc) && `FC ${s(c.fc)} lpm`,
    s(c.fr) && `FR ${s(c.fr)} rpm`,
    s(c.temp) && `temperatura ${s(c.temp)} °C`,
    s(c.agudeza) && `agudeza visual ${s(c.agudeza)}`
  ].filter(Boolean).join(", ");
  switch (plantilla) {
    case "salud": {
      const fin = s(c.finalidad) || "buena-salud";
      out.push({ texto: `${suscribe}, CERTIFICA que el día ${fecha} practicó examen médico a ${pac}, encontrando lo siguiente:` });
      const sv = somato();
      if (sv) out.push({ titulo: "Signos vitales y somatometría", texto: sv + "." });
      if (s(c.tipoSangre)) out.push({ titulo: "Grupo sanguíneo y Rh", texto: s(c.tipoSangre) + (c.tipoSangreReferido ? " (referido por el paciente)." : ".") });
      out.push({ titulo: "Exploración física", texto: s(c.hallazgos) || "Sin alteraciones clínicas aparentes al momento de la exploración." });
      const concl = s(c.conclusion) || "apto";
      const para = fin === "trabajo" ? "para desempeñar actividades laborales" : fin === "escolar" ? "para realizar actividades escolares, incluidas las de educación física" : fin === "deportivo" ? `para realizar actividad física y deportiva${s(c.deporte) ? ` (${s(c.deporte)})` : ""}` : "";
      const sano = art(p.sexo, "clínicamente sana", "clínicamente sano", "clínicamente sano(a)");
      const apto = art(p.sexo, "apta", "apto", "apto(a)");
      let conclusion;
      if (concl === "no-apto") conclusion = `Con base en la valoración, por el momento se considera ${art(p.sexo, "NO apta", "NO apto", "NO apto(a)")} ${para || "para la actividad solicitada"}${s(c.restricciones) ? `: ${s(c.restricciones)}` : ""}.`;
      else if (concl === "apto-restricciones") conclusion = `Se considera ${apto} ${para || "para sus actividades habituales"}, con las siguientes restricciones o recomendaciones: ${s(c.restricciones) || "—"}.`;
      else conclusion = fin === "buena-salud" ? `Por lo anterior, a la exploración se encuentra ${sano}.` : `Por lo anterior, a la exploración se encuentra ${sano} y ${apto} ${para}.`;
      out.push({ titulo: "Conclusión", texto: conclusion });
      if (fin === "deportivo") out.push({ texto: "La valoración clínica preparticipativa no descarta por completo enfermedad cardiovascular; ante síntomas durante el esfuerzo (dolor torácico, desmayo, palpitaciones o falta de aire desproporcionada) debe suspender la actividad y acudir a valoración." });
      if (s(c.vigencia)) out.push({ texto: `Vigencia sugerida: ${s(c.vigencia)}.` });
      out.push({ texto: `Se extiende el presente a solicitud de ${el} interesad${art(p.sexo, "a", "o", "o(a)")} para los fines que ${art(p.sexo, "a ella", "a él", "a él/ella")} convengan, en la fecha arriba indicada.` });
      break;
    }
    case "asistencia": {
      const horario = s(c.horaLlegada) && s(c.horaSalida) ? ` en un horario de ${s(c.horaLlegada)} a ${s(c.horaSalida)} horas` : s(c.horaLlegada) ? ` a las ${s(c.horaLlegada)} horas` : "";
      out.push({ texto: `${suscribe}, HACE CONSTAR que ${pac}, acudió a ${s(c.motivo) || "consulta médica"} en este consultorio el día ${fechaLarga(s(c.fechaAtencion) || fechaISO.slice(0, 10))}${horario}.` });
      if (s(c.acompanante)) out.push({ texto: `Acudió en compañía de ${s(c.acompanante)}${s(c.parentesco) ? ` (${s(c.parentesco)})` : ""}, quien permaneció durante la atención.` });
      out.push({ texto: "Se extiende la presente constancia a solicitud del interesado para los fines que le convengan." });
      break;
    }
    case "incapacidad": {
      const desde = s(c.desde) || fechaISO.slice(0, 10);
      const hasta = s(c.hasta) || desde;
      const dias = diasIncapacidad(desde, hasta);
      const act = s(c.actividad) === "escolares" ? "escolares" : s(c.actividad) === "habituales" ? "habituales" : "laborales";
      const reposo = s(c.reposo) === "absoluto" ? "reposo absoluto" : "reposo relativo en domicilio";
      out.push({ texto: `${suscribe}, HACE CONSTAR que en esta fecha valoró a ${pac}, quien presenta un padecimiento que le impide realizar temporalmente sus actividades ${act}.` });
      if (c.incluirDx && s(c.diagnostico)) out.push({ titulo: "Diagnóstico", texto: s(c.diagnostico) });
      out.push({ texto: `Por ello se indica ${reposo} por ${diasConLetra(dias)}, del ${fechaLarga(desde)} al ${fechaLarga(hasta)}, ambos inclusive, salvo nueva valoración médica.` });
      if (s(c.recomendaciones)) out.push({ titulo: "Recomendaciones", texto: s(c.recomendaciones) });
      out.push({ texto: "Este documento es un justificante médico privado; no constituye certificado de incapacidad del IMSS ni del ISSSTE." });
      break;
    }
    case "prenupcial": {
      out.push({ texto: `${suscribe}, CERTIFICA que el día ${fecha} practicó examen médico prenupcial a ${pac}, con los siguientes resultados:` });
      const sv = somato();
      if (sv) out.push({ titulo: "Signos vitales y somatometría", texto: sv + "." });
      const est = [
        s(c.tipoSangre) && `Grupo sanguíneo y Rh: ${s(c.tipoSangre)}`,
        s(c.vdrl) && `VDRL: ${s(c.vdrl)}`,
        s(c.vih) && `Prueba de VIH: ${s(c.vih)}`,
        s(c.otrosEstudios)
      ].filter(Boolean);
      if (est.length) out.push({ titulo: "Estudios de laboratorio", texto: est.join("\n") + (s(c.fechaEstudios) ? `
Fecha de los estudios: ${fechaLarga(s(c.fechaEstudios))}.` : "") });
      out.push({ titulo: "Exploración física", texto: s(c.hallazgos) || "Sin alteraciones clínicas aparentes al momento de la exploración." });
      out.push({
        titulo: "Conclusión",
        texto: s(c.conclusion) || `Con base en la exploración clínica y los estudios referidos, no se encontraron datos de enfermedad infectocontagiosa activa al momento de la valoración.`
      });
      out.push({ texto: "Se extiende el presente para el trámite de matrimonio civil ante el Registro Civil." });
      break;
    }
    case "referencia": {
      const contra = s(c.modalidad) === "contrarreferencia";
      out.push({ titulo: "Establecimiento que envía", texto: s(c.origen) || "—" });
      out.push({ titulo: "Establecimiento / servicio receptor", texto: [s(c.destino), s(c.especialidad) && `Especialidad: ${s(c.especialidad)}`].filter(Boolean).join("\n") || "—" });
      const urg = s(c.urgencia) === "urgente" ? "URGENTE" : s(c.urgencia) === "preferente" ? "Preferente" : "Ordinaria";
      out.push({ titulo: "Prioridad", texto: urg });
      out.push({ titulo: contra ? "Motivo de la contrarreferencia" : "Motivo de envío", texto: s(c.motivo) || "—" });
      out.push({ titulo: "Resumen clínico", texto: s(c.resumen) || "—" });
      out.push({ titulo: "Impresión diagnóstica", texto: s(c.impresionDx) || "—" });
      out.push({ titulo: "Terapéutica empleada", texto: s(c.tratamiento) || "Ninguna" });
      const adj = Array.isArray(c.estudiosAdjuntos) ? c.estudiosAdjuntos : [];
      const est = [...adj, s(c.estudiosTexto)].filter(Boolean);
      if (est.length) out.push({ titulo: "Estudios que se anexan", texto: est.map((x) => `• ${x}`).join("\n") });
      if (s(c.recomendaciones)) out.push({ titulo: contra ? "Indicaciones y seguimiento sugerido" : "Solicitud al servicio receptor", texto: s(c.recomendaciones) });
      out.push({ texto: contra ? "Agradezco la atención brindada y quedo a sus órdenes para el seguimiento del paciente." : "Agradeceré su valoración y la contrarreferencia correspondiente con sus hallazgos e indicaciones." });
      break;
    }
  }
  return out;
}
function contenidoHuella(x) {
  return canonico({ v: 1, ...x });
}
function huella(x) {
  return sha256Hex(contenidoHuella(x));
}

// src/modules/certificados/documento.ts
var esCert = (r3) => r3.tipo === "certificado" || r3.tipo === "referencia";
function datosCert(r3) {
  const d = r3.datos ?? {};
  return { ...d, plantilla: d.plantilla ?? (r3.tipo === "referencia" ? "referencia" : "salud"), campos: d.campos ?? {} };
}
function tituloCert(plantilla, campos, folio) {
  const info = infoPlantilla(plantilla);
  let n = info.nombre;
  if (plantilla === "salud" && typeof campos.finalidad === "string" && campos.finalidad !== "buena-salud") n += ` (${campos.finalidad})`;
  if (plantilla === "referencia") n = `${campos.modalidad === "contrarreferencia" ? "Contrarreferencia" : "Referencia"}${campos.especialidad ? " a " + String(campos.especialidad) : ""}`;
  return folio ? `${n} · ${folio}` : `${n} (borrador)`;
}
function prepararEmision(r3, paciente, medico, existentes, ahoraISO) {
  const d = datosCert(r3);
  const info = infoPlantilla(d.plantilla);
  const folio = siguienteFolio(
    info.prefijo,
    existentes.filter(esCert).map((x) => String(x.datos?.folio ?? ""))
  );
  const cuerpo = generarCuerpo(d.plantilla, d.campos, paciente, ahoraISO, medico);
  const hash = huella({ folio, tipo: r3.tipo, plantilla: d.plantilla, patientId: r3.patientId, paciente, cuerpo, emitidoEn: ahoraISO, cedula: medico.cedula });
  return {
    estado: "emitido",
    titulo: tituloCert(d.plantilla, d.campos, folio),
    datos: { ...r3.datos, plantilla: d.plantilla, campos: d.campos, folio, paciente, medico, cuerpo, emitidoEn: ahoraISO, hash }
  };
}

// src/modules/certificados/demo.ts
var MEDICO = { nombre: "Dra. Andrea Morales Peña", cedula: "12345678", especialidad: "Medicina Familiar", cedulaEspecialidad: "87654321" };
function demoCertificados(now) {
  const day2 = 864e5;
  const out = [];
  const emitir = (r3, paciente, fecha) => {
    const patch = prepararEmision(r3, paciente, MEDICO, out, fecha);
    out.push({ ...r3, ...patch });
  };
  const camposRef = {
    modalidad: "referencia",
    origen: "Clínica Demo MediSuite · Av. Insurgentes Sur 1234, Consultorio 502, Col. Del Valle, CDMX · Tel. 55 5000 0000",
    especialidad: "Cardiología",
    destino: "Servicio de Cardiología, hospital de segundo nivel",
    urgencia: "preferente",
    motivo: "Angina de esfuerzo de reciente aparición (clase II CCS) en paciente con cardiopatía isquémica y stent coronario (2021). Se solicita valoración y estratificación.",
    resumen: "Antecedentes: Cardiopatía isquémica, stent en 2021. Exfumador.\nAlergias: negadas.\nMedicamentos actuales: Ácido acetilsalicílico 100 mg; Atorvastatina 40 mg; Metoprolol 50 mg.\nÚltima consulta: refiere opresión retroesternal al subir 2 pisos, cede con reposo en 5 min. Sin síncope. Exploración cardiopulmonar sin alteraciones.\nSignos vitales recientes: TA 138/84 mmHg, FC 68 lpm, SpO2 96 %.",
    impresionDx: "I20.9 Angina de pecho, no especificada; I25.1 Enfermedad aterosclerótica del corazón; Z95.5 Presencia de implante y injerto vascular coronario",
    tratamiento: "Ácido acetilsalicílico 100 mg/día; atorvastatina 40 mg/día; metoprolol 50 mg/día. Se indicó isosorbida sublingual PRN.",
    estudiosAdjuntos: [],
    estudiosTexto: "ECG de reposo en ritmo sinusal, sin cambios agudos del ST",
    recomendaciones: "Valorar prueba de esfuerzo o estudio de perfusión y ajuste de tratamiento antiisquémico."
  };
  const fRef = new Date(now - 3 * day2).toISOString();
  emitir(
    { id: "demo-cert-ref-p2", patientId: "p2", fecha: fRef, tipo: "referencia", estado: "borrador", titulo: tituloCert("referencia", camposRef), datos: { plantilla: "referencia", campos: camposRef } },
    { nombre: "José Luis Hernández García", edad: "70 años", sexo: "M", curp: "HEGJ551102HJCRRS04" },
    fRef
  );
  const camposSalud = {
    finalidad: "deportivo",
    deporte: "fútbol amateur",
    conclusion: "apto-restricciones",
    restricciones: "evitar deportes de contacto con pivoteo de rodilla derecha hasta completar rehabilitación de ligamento cruzado anterior; actividad aeróbica y fortalecimiento sin restricción",
    peso: "78",
    talla: "176",
    ta: "118/76",
    fc: "64",
    fr: "14",
    temp: "36.5",
    tipoSangre: "O-",
    hallazgos: "Cardiopulmonar sin alteraciones. Rodilla derecha sin derrame, cajón anterior con tope firme, arcos de movilidad completos. Resto sin alteraciones.",
    vigencia: "6 meses"
  };
  const fSalud = new Date(now - 10 * day2).toISOString();
  emitir(
    { id: "demo-cert-salud-p4", patientId: "p4", fecha: fSalud, tipo: "certificado", estado: "borrador", titulo: tituloCert("salud", camposSalud), datos: { plantilla: "salud", campos: camposSalud } },
    { nombre: "Carlos Alberto Sánchez Torres", edad: "36 años", sexo: "M" },
    fSalud
  );
  return out;
}

// src/modules/desarrollo/hitos.ts
var DOMINIOS = ["social", "lenguaje", "cognitivo", "movimiento"];
var DEF = {
  2: {
    social: ["Se tranquiliza cuando le hablan o lo cargan", "Mira su cara", "Parece feliz de verle cuando usted se acerca", "Sonríe cuando usted le habla o le sonríe"],
    lenguaje: ["Hace sonidos además del llanto", "Reacciona a los ruidos fuertes"],
    cognitivo: ["Le sigue con la mirada cuando usted se mueve", "Mira un juguete durante varios segundos"],
    movimiento: ["Levanta la cabeza cuando está boca abajo", "Mueve ambos brazos y ambas piernas", "Abre las manos brevemente"]
  },
  4: {
    social: ["Sonríe por sí solo para llamar su atención", "Suelta risitas (todavía no una carcajada completa) cuando usted intenta hacerle reír", "Le mira, se mueve o hace sonidos para obtener o mantener su atención"],
    lenguaje: ['Hace sonidos como "ooo" o "aaah" (arrullos)', "Le responde con sonidos cuando usted le habla", "Voltea la cabeza hacia el sonido de su voz"],
    cognitivo: ["Si tiene hambre, abre la boca cuando ve el pecho o el biberón", "Se mira las manos con interés"],
    movimiento: ["Mantiene la cabeza firme, sin apoyo, cuando usted lo carga", "Sostiene un juguete cuando se lo pone en la mano", "Usa el brazo para dar manotazos a los juguetes", "Se lleva las manos a la boca", "Se apoya sobre los codos o antebrazos cuando está boca abajo"]
  },
  6: {
    social: ["Reconoce a las personas conocidas", "Le gusta mirarse en el espejo", "Se ríe"],
    lenguaje: ["Se turna con usted para hacer sonidos", 'Hace "trompetillas" (saca la lengua y sopla)', "Hace chillidos"],
    cognitivo: ["Se lleva cosas a la boca para explorarlas", "Estira la mano para agarrar un juguete que quiere", "Cierra los labios para mostrar que no quiere más comida"],
    movimiento: ["Se voltea de boca abajo a boca arriba", "Se empuja hacia arriba con los brazos estirados cuando está boca abajo", "Se apoya en las manos para sostenerse cuando está sentado"]
  },
  9: {
    social: ["Es tímido, se aferra a usted o tiene miedo con personas desconocidas", "Muestra varias expresiones faciales, como de alegría, tristeza, enojo y sorpresa", "Mira cuando lo llaman por su nombre", "Reacciona cuando usted se va (mira, estira los brazos hacia usted o llora)", 'Sonríe o se ríe cuando juegan a "¿dónde está?… ¡aquí está!"'],
    lenguaje: ['Hace sonidos diferentes como "mamamama" y "babababa"', "Levanta los brazos para que lo carguen"],
    cognitivo: ["Busca objetos cuando se le caen y dejan de verse (como su cuchara o un juguete)", "Golpea dos cosas entre sí"],
    movimiento: ["Se sienta por sí solo", "Pasa cosas de una mano a la otra", 'Usa los dedos para "rastrillar" la comida hacia sí', "Se mantiene sentado sin apoyo"]
  },
  12: {
    social: ['Juega con usted juegos como "palmitas"'],
    lenguaje: ['Dice "adiós" con la mano', 'Llama a uno de los padres "mamá", "papá" u otro nombre especial', 'Entiende el "no" (se detiene brevemente o deja de hacer algo cuando usted lo dice)'],
    cognitivo: ["Pone algo dentro de un recipiente, como un bloque en una taza", "Busca cosas que vio que usted escondió, como un juguete debajo de una cobija"],
    movimiento: ["Se jala para ponerse de pie", "Camina sosteniéndose de los muebles", "Bebe de un vaso sin tapa mientras usted lo sostiene", "Levanta cosas entre el pulgar y el índice, como pedacitos de comida"]
  },
  15: {
    social: ["Imita a otros niños mientras juega, como sacar juguetes de un recipiente cuando otro niño lo hace", "Le muestra un objeto que le gusta", "Aplaude cuando está emocionado", "Abraza un muñeco de peluche u otro juguete", "Le demuestra cariño (le abraza, se acurruca o le da besos)"],
    lenguaje: ['Intenta decir una o dos palabras además de "mamá" o "papá", como "ba" por pelota o "pe" por perro', "Mira un objeto conocido cuando usted lo nombra", 'Sigue instrucciones dadas con un gesto y palabras; por ejemplo, le da un juguete cuando usted extiende la mano y le dice "dame el juguete"', "Señala para pedir algo o para que le ayuden"],
    cognitivo: ["Intenta usar las cosas de la manera correcta, como un teléfono, un vaso o un libro", "Apila al menos dos objetos pequeños, como bloques"],
    movimiento: ["Da algunos pasos por sí solo", "Usa los dedos para comer algunos alimentos por sí solo"]
  },
  18: {
    social: ["Se aleja de usted, pero voltea para asegurarse de que usted está cerca", "Señala para mostrarle algo interesante", "Extiende las manos para que se las lave", "Mira con usted algunas páginas de un libro", "Le ayuda a vestirlo metiendo el brazo en la manga o levantando el pie"],
    lenguaje: ['Intenta decir tres o más palabras además de "mamá" o "papá"', 'Sigue instrucciones de un paso sin gestos, como darle el juguete cuando usted le dice "dámelo"'],
    cognitivo: ["Le imita en los quehaceres, como barrer con una escoba", "Juega con juguetes de manera sencilla, como empujar un carrito"],
    movimiento: ["Camina sin sostenerse de nadie ni de nada", "Hace garabatos", "Bebe de un vaso sin tapa, aunque a veces lo derrame", "Come por sí solo con los dedos", "Intenta usar la cuchara", "Se sube y se baja de un sillón o una silla sin ayuda"]
  },
  24: {
    social: ["Se da cuenta cuando otros están lastimados o molestos, como detenerse o poner cara triste cuando alguien llora", "Mira su cara para saber cómo reaccionar ante una situación nueva"],
    lenguaje: ['Señala cosas en un libro cuando usted le pregunta, como "¿dónde está el oso?"', 'Dice al menos dos palabras juntas, como "más leche"', "Señala al menos dos partes del cuerpo cuando usted le pide que se las muestre", "Usa más gestos que solo decir adiós con la mano y señalar, como mandar un beso o asentir con la cabeza"],
    cognitivo: ["Sostiene algo en una mano mientras usa la otra; por ejemplo, sostiene un recipiente y le quita la tapa", "Intenta usar interruptores, perillas o botones de un juguete", "Juega con más de un juguete a la vez, como poner comida de juguete en un plato de juguete"],
    movimiento: ["Patea una pelota", "Corre", "Sube caminando (no gateando) algunos escalones, con o sin ayuda", "Come con cuchara"]
  },
  30: {
    social: ["Juega al lado de otros niños y a veces juega con ellos", 'Le muestra lo que puede hacer diciendo "¡mírame!"', 'Sigue rutinas sencillas cuando se le pide, como ayudar a recoger los juguetes cuando usted dice "es hora de recoger"'],
    lenguaje: ["Dice unas 50 palabras", 'Dice dos o más palabras juntas, una de ellas de acción, como "perrito corre"', 'Nombra cosas de un libro cuando usted las señala y pregunta "¿qué es esto?"', 'Dice palabras como "yo", "mí" o "nosotros"'],
    cognitivo: ['Usa cosas para jugar a "hacer como que", como darle a una muñeca un bloque como si fuera comida', "Muestra habilidades sencillas para resolver problemas, como subirse a un banquito para alcanzar algo", 'Sigue instrucciones de dos pasos, como "deja el juguete y cierra la puerta"', 'Muestra que conoce al menos un color, como señalar un crayón rojo cuando usted pregunta "¿cuál es el rojo?"'],
    movimiento: ["Usa las manos para girar cosas, como perillas de puertas o tapas de rosca", "Se quita algo de ropa por sí solo, como pantalones flojos o una chamarra abierta", "Salta despegando ambos pies del suelo", "Pasa las páginas de un libro una por una cuando usted le lee"]
  },
  36: {
    social: ["Se calma en los 10 minutos siguientes a que usted se va, por ejemplo al dejarlo en la guardería", "Se fija en otros niños y se une a ellos para jugar"],
    lenguaje: ["Conversa con usted con al menos dos intercambios de ida y vuelta", 'Hace preguntas con "quién", "qué", "dónde" o "por qué", como "¿dónde está mamá/papá?"', 'Dice qué acción ocurre en una imagen o libro cuando se le pregunta, como "corriendo", "comiendo" o "jugando"', "Dice su nombre cuando se le pregunta", "Habla lo suficientemente bien para que otras personas le entiendan la mayor parte del tiempo"],
    cognitivo: ["Dibuja un círculo cuando usted le muestra cómo", "Evita tocar objetos calientes, como la estufa, cuando usted le advierte"],
    movimiento: ["Ensarta cosas, como cuentas grandes o pasta", "Se pone algo de ropa por sí solo, como pantalones flojos o una chamarra", "Usa el tenedor"]
  },
  48: {
    social: ["Juega a ser otra cosa (maestra, superhéroe, perro)", 'Pide ir a jugar con otros niños si no hay ninguno cerca, como "¿puedo jugar con Alex?"', "Consuela a otros que están lastimados o tristes, como abrazar a un amigo que llora", "Evita el peligro, como no saltar desde lugares altos en el parque", 'Le gusta ser "ayudante"', "Cambia su comportamiento según el lugar donde está (templo, biblioteca, parque)"],
    lenguaje: ["Dice oraciones de cuatro o más palabras", "Dice algunas palabras de una canción, cuento o rima infantil", 'Habla de al menos una cosa que pasó durante su día, como "jugué fútbol"', 'Responde preguntas sencillas como "¿para qué sirve un abrigo?" o "¿para qué sirve un crayón?"'],
    cognitivo: ["Nombra algunos colores de las cosas", "Dice qué sigue en un cuento que conoce bien", "Dibuja una persona con tres o más partes del cuerpo"],
    movimiento: ["Atrapa una pelota grande la mayoría de las veces", "Se sirve comida o agua, con supervisión de un adulto", "Desabotona algunos botones", "Sostiene el crayón o lápiz entre los dedos y el pulgar (no con el puño)"]
  },
  60: {
    social: ["Sigue reglas o espera su turno al jugar con otros niños", "Canta, baila o actúa para usted", "Hace quehaceres sencillos en casa, como juntar calcetines en pares o levantar la mesa después de comer"],
    lenguaje: ["Cuenta un cuento que escuchó o inventó con al menos dos sucesos; por ejemplo, un gato se quedó atorado en un árbol y un bombero lo rescató", "Responde preguntas sencillas sobre un libro o cuento después de que usted se lo lee o cuenta", "Mantiene una conversación con más de tres intercambios de ida y vuelta", "Usa o reconoce rimas sencillas (gato-pato, bola-ola)"],
    cognitivo: ["Cuenta hasta 10", "Nombra algunos números entre 1 y 5 cuando usted los señala", 'Usa palabras de tiempo, como "ayer", "mañana", "en la mañana" o "en la noche"', "Pone atención de 5 a 10 minutos durante actividades, como la hora del cuento o manualidades (el tiempo de pantallas no cuenta)", "Escribe algunas letras de su nombre", "Nombra algunas letras cuando usted las señala"],
    movimiento: ["Abotona algunos botones", "Salta en un pie"]
  }
};
function hitosDe(cp) {
  const d = DEF[cp];
  return DOMINIOS.flatMap((dom) => d[dom].map((texto, i) => ({ id: `${cp}-${dom}-${i + 1}`, dominio: dom, texto })));
}
function checkpointLabel(cp) {
  return cp < 24 ? `${cp} meses` : cp % 12 === 0 ? `${cp / 12} años` : `${cp} meses`;
}
var DIA = 864e5;
var DIAS_POR_MES = 30.4375;
function utc(f) {
  const [y, m, d] = f.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}
function edadParaEvaluar(fechaNac, fecha, sdgNacimiento) {
  const dias = Math.max(0, Math.round((utc(fecha) - utc(fechaNac)) / DIA));
  const cronologicaMeses = dias / DIAS_POR_MES;
  const prematuro = !!sdgNacimiento && sdgNacimiento < 37;
  const usaCorregida = prematuro && cronologicaMeses < 24;
  const corregidaMeses = usaCorregida ? Math.max(0, (dias - (40 - sdgNacimiento) * 7) / DIAS_POR_MES) : cronologicaMeses;
  return { cronologicaMeses, corregidaMeses, usaCorregida };
}
function evaluar(cp, resp, perdidaHabilidades = false) {
  const hs = hitosDe(cp);
  const porDominio = Object.fromEntries(DOMINIOS.map((d) => [d, { total: 0, no: 0 }]));
  const no = [];
  const nose = [];
  let si = 0;
  for (const h of hs) {
    porDominio[h.dominio].total++;
    const r3 = resp[h.id];
    if (r3 === "si") si++;
    else if (r3 === "no") {
      no.push(h);
      porDominio[h.dominio].no++;
    } else if (r3 === "nose") nose.push(h);
  }
  const sinResponder = hs.length - si - no.length - nose.length;
  let nivel = "ok";
  let mensaje = "Cumple todos los hitos marcados para la edad. Continúe la vigilancia en la siguiente visita.";
  if (perdidaHabilidades || no.length > 0) {
    nivel = "alerta";
    mensaje = perdidaHabilidades ? "Pérdida de habilidades previamente adquiridas: requiere evaluación del desarrollo sin demora." : `${no.length} hito(s) que al menos el 75 % de las niñas y niños ya logran a esta edad todavía no se observan: aplicar una prueba de tamizaje del desarrollo y valorar referencia.`;
  } else if (nose.length > 0 || sinResponder > 0) {
    nivel = "vigilar";
    mensaje = "Hay hitos sin confirmar: pida a la familia observarlos y reevalúe pronto.";
  }
  return { total: hs.length, si, no, nose, sinResponder, porDominio, nivel, mensaje };
}

// src/modules/desarrollo/demo.ts
function demoDesarrollo(now) {
  void now;
  const fechaEval = "2025-06-23";
  const e = edadParaEvaluar("2021-06-20", fechaEval, 39);
  const respuestas = Object.fromEntries(hitosDe(48).map((h) => [h.id, "si"]));
  respuestas["48-cognitivo-3"] = "nose";
  const res = evaluar(48, respuestas);
  const datos = {
    fechaEval,
    sdgNacimiento: 39,
    edadCronologicaMeses: +e.cronologicaMeses.toFixed(2),
    edadCorregidaMeses: +e.corregidaMeses.toFixed(2),
    usaCorregida: false,
    checkpoint: 48,
    respuestas,
    perdidaHabilidades: false,
    preocupaciones: "La mamá comenta que es tímida con adultos desconocidos.",
    notas: "Pedir a la familia que observe si dibuja una persona con 3 o más partes; revalorar en la visita de 5 años.",
    nivel: res.nivel,
    noCumplidos: res.no.map((h) => h.id)
  };
  return [
    {
      id: "demo-desarrollo-p3-48m",
      patientId: "p3",
      tipo: "desarrollo",
      estado: res.nivel,
      fecha: (/* @__PURE__ */ new Date(fechaEval + "T12:00:00")).toISOString(),
      titulo: `Hitos del desarrollo ${checkpointLabel(48)} · ${res.nivel === "ok" ? "Hitos cumplidos" : "Por confirmar"}`,
      datos
    }
  ];
}

// src/modules/encuestas/nps.ts
var PLANTILLA_BASE = {
  titulo: "Encuesta de satisfacción",
  intro: "Su opinión nos ayuda a mejorar. Son 6 preguntas y es anónima.",
  gracias: "¡Gracias por su tiempo! Su opinión nos ayuda a mejorar.",
  preguntas: [
    {
      id: "nps",
      tipo: "nps",
      texto: "¿Qué tan probable es que nos recomiende con un familiar o amigo?"
    },
    {
      id: "atencion",
      tipo: "escala5",
      texto: "¿Qué tan satisfecho está con la atención médica que recibió?"
    },
    {
      id: "espera",
      tipo: "escala5",
      texto: "¿Cómo califica el tiempo de espera?"
    },
    {
      id: "trato",
      tipo: "escala5",
      texto: "¿Cómo califica el trato del personal (recepción y enfermería)?"
    },
    {
      id: "limpieza",
      tipo: "escala5",
      texto: "¿Cómo califica la limpieza de las instalaciones?"
    },
    {
      id: "comentarios",
      tipo: "texto",
      texto: "¿Algo que quiera contarnos o que podamos mejorar?",
      opcional: true
    }
  ]
};
function clasificarNps(v) {
  if (!Number.isFinite(v) || v < 0 || v > 10) throw new RangeError("El puntaje NPS debe estar entre 0 y 10");
  return v >= 9 ? "promotor" : v >= 7 ? "pasivo" : "detractor";
}
function tituloEncuesta(r3) {
  const v = r3.nps;
  if (typeof v !== "number") return "Encuesta de satisfacción";
  const c = clasificarNps(v);
  return `Encuesta de satisfacción · recomendación ${v}/10 (${c})`;
}

// src/modules/encuestas/demo.ts
var BUENOS = [
  "La doctora explicó todo con mucha paciencia.",
  "Muy amables en recepción, gracias.",
  "Excelente atención, me sentí escuchada.",
  "Todo muy limpio y ordenado.",
  "Me atendieron puntual, muy bien.",
  "El recordatorio por WhatsApp me ayudó mucho."
];
var REGULARES = [
  "Buena consulta pero esperé casi 40 minutos.",
  "El estacionamiento es complicado.",
  "La sala de espera estaba muy calurosa, falta aire acondicionado.",
  "Bien en general, aunque el precio subió."
];
var MALOS = [
  "Esperé más de una hora y nadie me avisó del retraso.",
  "No contestan el teléfono para agendar cita.",
  "El baño no estaba limpio.",
  "Me pareció caro para lo rápido de la consulta."
];
function demoEncuestas(now) {
  let seed = 20261024;
  const r3 = () => {
    seed = seed * 16807 % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const pick = (xs) => xs[Math.floor(r3() * xs.length)];
  const DIA4 = 864e5;
  const medicos = ["Dra. Andrea Morales Peña", "Dr. Emilio Navarro Ríos"];
  const pacientes = ["p1", "p2", "p4", "p6", "p7"];
  const out = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const hace = Math.round(88 - i * 86 / (N - 1));
    const t = now - hace * DIA4 + Math.floor(r3() * 8 + 9) * 36e5;
    const progreso = i / N;
    const u = r3() + progreso * 0.25;
    const nps = u > 0.55 ? r3() < 0.6 ? 10 : 9 : u > 0.3 ? r3() < 0.5 ? 8 : 7 : Math.floor(r3() * 5) + 2;
    const base = nps >= 9 ? 5 : nps >= 7 ? 4 : 3;
    const esc = (sesgo = 0) => Math.max(1, Math.min(5, base + sesgo + (r3() < 0.25 ? -1 : 0)));
    const respuestas = {
      nps,
      atencion: esc(0),
      espera: esc(nps < 7 ? -1 : r3() < 0.4 ? -1 : 0),
      trato: esc(0),
      limpieza: esc(0)
    };
    if (r3() < 0.55) respuestas.comentarios = nps >= 9 ? pick(BUENOS) : nps >= 7 ? pick(REGULARES) : pick(MALOS);
    const patientId = i % 8 === 3 ? pacientes[Math.floor(i / 8) % pacientes.length] : void 0;
    out.push({
      id: `demo-encuesta-${i + 1}`,
      tipo: "encuesta",
      fecha: new Date(t).toISOString(),
      patientId,
      estado: "respondida",
      titulo: tituloEncuesta(respuestas),
      datos: {
        respuestas,
        preguntas: PLANTILLA_BASE.preguntas.map(({ id, tipo, texto }) => ({
          id,
          tipo,
          texto
        })),
        medico: r3() < 0.65 ? medicos[0] : medicos[1],
        canal: r3() < 0.8 ? "kiosco" : "qr"
      }
    });
  }
  return out;
}

// src/lib/utils.ts
function fmtFecha(iso, opts = { day: "2-digit", month: "short", year: "numeric" }) {
  return new Date(iso).toLocaleDateString("es-MX", opts);
}
var mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// src/modules/enfermeria/calc.ts
var TURNOS_POR_OMISION = { matutino: 7, vespertino: 15, nocturno: 21 };
function inicioDia(t, cfg = TURNOS_POR_OMISION) {
  const d = new Date(t);
  d.setHours(cfg.matutino, 0, 0, 0);
  if (d.getTime() > t) d.setDate(d.getDate() - 1);
  return d.getTime();
}
function programarDosis(intervaloH, primera, dia0) {
  if (!(intervaloH > 0)) return [];
  const [hh, mm] = primera.split(":").map(Number);
  const ancla = new Date(dia0);
  ancla.setHours(hh || 0, mm || 0, 0, 0);
  let t = ancla.getTime();
  const paso = intervaloH * 36e5;
  const fin = dia0 + 24 * 36e5;
  while (t - paso >= dia0) t -= paso;
  while (t < dia0) t += paso;
  const out = [];
  for (; t < fin; t += paso) out.push(t);
  return out;
}
function diaISO(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// src/modules/enfermeria/demo.ts
var H = 36e5;
function demoEnfermeriaObs(now) {
  const d0 = inicioDia(now);
  const tomas = [
    [1, { pas: 128, pad: 78, fc: 66, fr: 16, temp: 36.4, spo2: 96, glucosa: 112 }],
    [5, { pas: 134, pad: 82, fc: 70, fr: 18, temp: 36.6, spo2: 95 }],
    [9, { pas: 126, pad: 76, fc: 64, fr: 16, temp: 36.5, spo2: 96 }],
    [13, { pas: 122, pad: 74, fc: 62, fr: 16, temp: 36.3, spo2: 97, glucosa: 128 }],
    [17, { pas: 118, pad: 72, fc: 60, fr: 15, temp: 36.2, spo2: 96 }]
  ];
  const unidades = { pas: "mmHg", pad: "mmHg", fc: "lpm", fr: "rpm", temp: "°C", spo2: "%", glucosa: "mg/dL" };
  const out = [];
  for (const [h, vals] of tomas) {
    const t = d0 + h * H;
    if (t > now) continue;
    for (const [k, v] of Object.entries(vals)) out.push({ id: `enf-demo-o${h}-${k}`, patientId: "p2", fecha: new Date(t).toISOString(), codigo: k, valor: v, unidad: unidades[k], fuente: "manual", etiqueta: "Hoja de enfermería" });
  }
  return out;
}
function demoEnfermeria(now) {
  const d0 = inicioDia(now);
  const iso = (h) => new Date(d0 + h * H).toISOString();
  const ya = (h) => d0 + h * H <= now;
  const ordenes = [
    { id: "asa", medicamento: "Ácido acetilsalicílico tab. 100 mg", dosis: "100 mg", via: "Oral", frecuencia: "Cada 24 horas", indicaciones: "Con alimentos" },
    { id: "meto", medicamento: "Metoprolol tab. 50 mg", dosis: "50 mg", via: "Oral", frecuencia: "Cada 12 horas", indicaciones: "No administrar si FC < 55 o TAS < 100" },
    { id: "ator", medicamento: "Atorvastatina tab. 40 mg", dosis: "40 mg", via: "Oral", frecuencia: "Cada 24 horas" },
    { id: "enox", medicamento: "Enoxaparina sol. iny. 40 mg/0.4 mL", dosis: "40 mg", via: "Subcutánea", frecuencia: "Cada 24 horas" },
    { id: "para", medicamento: "Paracetamol tab. 500 mg", dosis: "1 g", via: "Oral", frecuencia: "En caso de dolor o fiebre, máximo cada 8 horas" }
  ];
  const horarios = { "m:asa": "09:00", "m:meto": "08:00", "m:ator": "22:00", "m:enox": "10:00" };
  const mar = {};
  const correctos = ["Paciente correcto", "Medicamento correcto", "Dosis correcta", "Vía correcta", "Hora correcta"];
  const intervalos = { asa: 24, meto: 12, ator: 24, enox: 24 };
  for (const [id, h] of Object.entries(intervalos)) {
    for (const t of programarDosis(h, horarios[`m:${id}`], d0)) {
      if (t + 10 * 6e4 > now) continue;
      mar[`m:${id}@${new Date(t).toISOString()}`] = { estado: "aplicado", programada: new Date(t).toISOString(), hora: new Date(t + 10 * 6e4).toISOString(), enfermera: "Enf. Laura Pérez (demo)", correctos };
    }
  }
  if (ya(6)) mar[`m:para@prn-${d0 + 6 * H}`] = { estado: "aplicado", hora: iso(6), enfermera: "Enf. Laura Pérez (demo)", correctos, nota: "Cefalea 4/10" };
  const movs = [
    [0.5, "ingreso", "iv", 250, "Solución salina 0.9 % 1000 mL p/ 24 h (40 mL/h)"],
    [1, "ingreso", "oral", 240, "Desayuno"],
    [2, "egreso", "diuresis", 300],
    [5, "ingreso", "oral", 350, "Comida"],
    [6.5, "ingreso", "iv", 250],
    [7, "egreso", "diuresis", 420],
    [9, "egreso", "evacuaciones", 150, "Formada"],
    [11, "ingreso", "oral", 300, "Cena"],
    [12.5, "ingreso", "iv", 250],
    [13, "egreso", "diuresis", 380],
    [18.5, "ingreso", "iv", 250],
    [20, "egreso", "diuresis", 450]
  ];
  const datos = {
    dia: diaISO(d0),
    peso: 76,
    movimientos: movs.filter(([h]) => ya(h)).map(([h, tipo, via, ml, nota], i) => ({ id: `mv${i}`, hora: iso(h), tipo, via, ml, nota })),
    ordenes,
    horarios,
    mar,
    notas: ya(3) ? [{ id: "n1", hora: iso(3), turno: "matutino", formato: "soapie", autor: "Enf. Laura Pérez (demo)", soapie: { s: "Refiere descansar bien; niega dolor torácico.", o: "Consciente, orientado, TA 128/78, FC 66, SpO₂ 96 % al aire ambiente. Venoclisis permeable en antebrazo izquierdo.", a: "Riesgo de disminución del gasto cardiaco.", p: "Vigilar signos vitales c/4 h, balance hídrico estricto.", i: "Se administra medicación del horario con los 5 correctos. Se instruye sobre deambulación asistida.", e: "Paciente estable, colabora." } }] : [],
    entregas: {}
  };
  return [{ id: "enf-demo-p2", patientId: "p2", fecha: new Date(d0).toISOString(), tipo: "enfermeria", estado: "abierta", titulo: `Hoja de enfermería ${fmtFecha(new Date(d0).toISOString())}`, datos }];
}

// src/modules/inventario/demo.ts
var RAW = [
  ["Paracetamol", "500 mg 10 tabletas", "caja", "medicamento", 10, "Estante A1", 35, false, [[30, 12.5, 420, 8], [20, 13, 200, 0]]],
  ["Ibuprofeno", "400 mg 10 tabletas", "caja", "medicamento", 8, "Estante A1", 45, false, [[12, 18, 25, 6]]],
  ["Amoxicilina", "500 mg 12 cápsulas", "caja", "medicamento", 6, "Estante A2", 85, false, [[10, 42, 300, 7]]],
  ["Ketorolaco", "30 mg/1 mL solución inyectable", "ampolleta", "medicamento", 10, "Carro rojo", 40, false, [[25, 11, 50, 9], [20, 11.8, 540, 0]]],
  ["Dexametasona", "8 mg/2 mL solución inyectable", "ampolleta", "medicamento", 6, "Carro rojo", 55, false, [[15, 19, 380, 4]]],
  ["Metamizol sódico", "1 g/2 mL solución inyectable", "ampolleta", "medicamento", 6, "Carro rojo", 35, false, [[10, 8.5, -12, 2], [12, 9, 610, 3]]],
  ["Diclofenaco", "75 mg/3 mL solución inyectable", "ampolleta", "medicamento", 6, "Carro rojo", 30, false, [[8, 7, 70, 5]]],
  ["Adrenalina (epinefrina)", "1 mg/1 mL solución inyectable", "ampolleta", "medicamento", 4, "Carro rojo", null, false, [[6, 28, 150, 0]]],
  ["Salbutamol", "100 µg/dosis inhalador 200 dosis", "pieza", "medicamento", 3, "Estante A3", 120, false, [[5, 68, 480, 1]]],
  ["Omeprazol", "20 mg 14 cápsulas", "caja", "medicamento", 5, "Estante A2", 60, false, [[8, 22, 700, 2]]],
  ["Metformina", "850 mg 30 tabletas", "caja", "medicamento", 5, "Estante A2", 55, false, [[6, 25, 40, 3]]],
  ["Losartán", "50 mg 30 tabletas", "caja", "medicamento", 5, "Estante A2", 70, false, [[10, 30, 520, 2]]],
  ["Diazepam", "10 mg/2 mL solución inyectable", "ampolleta", "medicamento", 2, "Gaveta con llave", null, true, [[5, 35, 330, 1]]],
  ["Tramadol", "100 mg/2 mL solución inyectable", "ampolleta", "medicamento", 3, "Gaveta con llave", null, true, [[5, 32, 85, 3]]],
  ["Vacuna antiinfluenza", "0.5 mL jeringa prellenada", "jeringa", "vacuna", 10, "Refrigerador", 350, false, [[20, 180, 160, 12]]],
  ["Toxoide tetánico-diftérico (Td)", "0.5 mL frasco ámpula", "vial", "vacuna", 5, "Refrigerador", 250, false, [[10, 95, 55, 2]]],
  ["Solución fisiológica 0.9 %", "500 mL", "frasco", "insumo", 6, "Bodega", 45, false, [[12, 21, 400, 4]]],
  ["Jeringa desechable", "5 mL con aguja 21G", "pieza", "insumo", 50, "Cajón 1", 5, false, [[200, 1.8, 1500, 80]]],
  ["Guantes de nitrilo", "talla M caja 100", "caja", "insumo", 3, "Cajón 2", null, false, [[4, 145, 900, 2]]],
  ["Torundas de algodón", "bolsa 500 g", "paquete", "material-curacion", 2, "Cajón 2", null, false, [[3, 60, 0, 1]]],
  ["Gasas estériles", "10 x 10 cm sobre 2 piezas", "sobre", "material-curacion", 40, "Cajón 3", 6, false, [[100, 2.4, 1100, 72]]],
  ["Venda elástica", "10 cm x 5 m", "rollo", "material-curacion", 5, "Cajón 3", 35, false, [[10, 14, 0, 3]]],
  ["Sutura nylon 3-0", "con aguja 3/8 círculo", "sobre", "material-curacion", 6, "Cajón 4", 60, false, [[12, 24, 75, 8]]],
  ["Lidocaína 2 %", "frasco ámpula 50 mL", "vial", "medicamento", 2, "Estante A3", null, false, [[4, 65, 22, 1]]],
  ["Tiras reactivas de glucosa", "frasco 50 tiras", "frasco", "insumo", 2, "Estante B1", 380, false, [[3, 210, 120, 1]]]
];
function demoInventario(now) {
  const day2 = 864e5;
  const iso = (t) => new Date(t).toISOString();
  const fecha = (dias) => new Date(now + dias * day2).toISOString().slice(0, 10);
  const out = [];
  const proveedores = ["Distribuidora Médica del Centro", "Farmacéutica Nacional", "Insumos Hospitalarios MX"];
  RAW.forEach(([nombre, presentacion, unidad, categoria, stockMinimo, ubicacion, precio, controlado, lotes], i) => {
    const id = `demo-inv-${String(i + 1).padStart(2, "0")}`;
    const p = { nombre, presentacion, unidad, categoria, stockMinimo, ubicacion, controlado, ...precio !== null ? { precioVenta: precio } : {} };
    out.push({ id, fecha: iso(now - 200 * day2), tipo: "inventario", estado: "activo", titulo: `${nombre} ${presentacion}`, datos: { ...p } });
    lotes.forEach(([cantidad, costo, cad, salidas], j) => {
      const lote = `${nombre.slice(0, 3).toUpperCase()}${24 + j}${String(i * 7 + j * 3).padStart(3, "0")}`;
      const fEntrada = now - (90 - j * 30) * day2;
      out.push({
        id: `${id}-e${j}`,
        fecha: iso(fEntrada),
        tipo: "movimiento-inventario",
        titulo: `Entrada: ${nombre} ${presentacion} (+${cantidad} ${unidad})`,
        datos: { productoId: id, tipo: "entrada", cantidad, lote, ...cad ? { caducidad: fecha(cad) } : {}, costoUnitario: costo, proveedor: proveedores[(i + j) % 3], factura: `F-${1200 + i * 3 + j}` }
      });
      if (salidas > 0) {
        const aPaciente = salidas <= 2 && (categoria === "vacuna" || categoria === "medicamento" && unidad === "ampolleta" && !controlado);
        out.push({
          id: `${id}-s${j}`,
          fecha: iso(fEntrada + 20 * day2),
          tipo: "movimiento-inventario",
          ...aPaciente ? { patientId: ["p1", "p2", "p4", "p6"][i % 4] } : {},
          titulo: `${aPaciente ? "Aplicación" : "Consumo interno"}: ${nombre} ${presentacion} (−${salidas} ${unidad})`,
          datos: { productoId: id, tipo: "salida", cantidad: salidas, lote, ...cad ? { caducidad: fecha(cad) } : {}, motivo: aPaciente ? "aplicacion" : "consumo" }
        });
      }
    });
  });
  return out;
}

// src/modules/nutricion/nutri.ts
var imc = (pesoKg, tallaCm) => pesoKg > 0 && tallaCm > 0 ? pesoKg / (tallaCm / 100) ** 2 : NaN;
var icc = (cintura, cadera) => cintura > 0 && cadera > 0 ? cintura / cadera : NaN;
var ict = (cintura, tallaCm) => cintura > 0 && tallaCm > 0 ? cintura / tallaCm : NaN;
function mifflin(sexo, pesoKg, tallaCm, edadAnios) {
  return 10 * pesoKg + 6.25 * tallaCm - 5 * edadAnios + (sexo === "F" ? -161 : 5);
}
function gramosMeta(kcal, m) {
  return { kcal, hc: kcal * m.hc / 100 / 4, prot: kcal * m.prot / 100 / 4, lip: kcal * m.lip / 100 / 9 };
}
var SMAE = [
  { id: "verduras", grupo: "Verduras", kcal: 25, hc: 4, prot: 2, lip: 0 },
  { id: "frutas", grupo: "Frutas", kcal: 60, hc: 15, prot: 0, lip: 0 },
  { id: "cereales-sg", grupo: "Cereales y tubérculos", sub: "sin grasa", kcal: 70, hc: 15, prot: 2, lip: 0 },
  { id: "cereales-cg", grupo: "Cereales y tubérculos", sub: "con grasa", kcal: 115, hc: 15, prot: 2, lip: 5 },
  { id: "leguminosas", grupo: "Leguminosas", kcal: 120, hc: 20, prot: 8, lip: 1 },
  { id: "aoa-mb", grupo: "Alimentos de origen animal", sub: "muy bajo aporte de grasa", kcal: 40, hc: 0, prot: 7, lip: 1 },
  { id: "aoa-b", grupo: "Alimentos de origen animal", sub: "bajo aporte de grasa", kcal: 55, hc: 0, prot: 7, lip: 3 },
  { id: "aoa-m", grupo: "Alimentos de origen animal", sub: "moderado aporte de grasa", kcal: 75, hc: 0, prot: 7, lip: 5 },
  { id: "aoa-a", grupo: "Alimentos de origen animal", sub: "alto aporte de grasa", kcal: 100, hc: 0, prot: 7, lip: 8 },
  { id: "leche-d", grupo: "Leche", sub: "descremada", kcal: 95, hc: 12, prot: 9, lip: 2 },
  { id: "leche-s", grupo: "Leche", sub: "semidescremada", kcal: 110, hc: 12, prot: 9, lip: 4 },
  { id: "leche-e", grupo: "Leche", sub: "entera", kcal: 150, hc: 12, prot: 9, lip: 8 },
  { id: "leche-a", grupo: "Leche", sub: "con azúcar", kcal: 200, hc: 30, prot: 8, lip: 5, verificar: true },
  { id: "grasas-sp", grupo: "Aceites y grasas", sub: "sin proteína", kcal: 45, hc: 0, prot: 0, lip: 5 },
  { id: "grasas-cp", grupo: "Aceites y grasas", sub: "con proteína", kcal: 70, hc: 3, prot: 3, lip: 5 },
  { id: "azucares-sg", grupo: "Azúcares", sub: "sin grasa", kcal: 40, hc: 10, prot: 0, lip: 0 },
  { id: "azucares-cg", grupo: "Azúcares", sub: "con grasa", kcal: 85, hc: 10, prot: 0, lip: 5 }
];
var grupo = (id) => SMAE.find((g) => g.id === id);
function totalesPlan(eq) {
  const t = { kcal: 0, hc: 0, prot: 0, lip: 0 };
  for (const [id, n] of Object.entries(eq)) {
    const g = grupo(id);
    if (!g || !n) continue;
    t.kcal += g.kcal * n;
    t.hc += g.hc * n;
    t.prot += g.prot * n;
    t.lip += g.lip * n;
  }
  return t;
}
var r05 = (x) => Math.max(0, Math.round(x * 2) / 2);
var piso05 = (x) => Math.max(0, Math.floor(x * 2 + 1e-9) / 2);
function opcionesPorOmision(kcal) {
  return {
    verduras: kcal < 1400 ? 3 : 4,
    frutas: kcal < 1600 ? 2 : kcal < 2200 ? 3 : 4,
    leche: kcal < 1800 ? 1 : 2,
    lecheTipo: "leche-d",
    leguminosas: kcal < 2200 ? 1 : 2,
    azucares: 0,
    azucarTipo: "azucares-sg",
    cerealTipo: "cereales-sg",
    aoaTipo: "aoa-b",
    grasaTipo: "grasas-sp"
  };
}
function resolverEquivalentes(meta, o) {
  const eq = { verduras: o.verduras, frutas: o.frutas, [o.lecheTipo]: o.leche, leguminosas: o.leguminosas, [o.azucarTipo]: o.azucares };
  const parcial = () => totalesPlan(eq);
  const cer = grupo(o.cerealTipo);
  eq[o.cerealTipo] = (eq[o.cerealTipo] ?? 0) + r05((meta.hc - parcial().hc) / cer.hc);
  const aoa = grupo(o.aoaTipo);
  eq[o.aoaTipo] = (eq[o.aoaTipo] ?? 0) + r05((meta.prot - parcial().prot) / aoa.prot);
  const gr = grupo(o.grasaTipo);
  eq[o.grasaTipo] = (eq[o.grasaTipo] ?? 0) + r05((meta.lip - parcial().lip) / gr.lip);
  for (const k of Object.keys(eq)) if (!eq[k]) delete eq[k];
  return eq;
}
var COMIDAS = [
  { id: "desayuno", label: "Desayuno", pct: 25 },
  { id: "colacion1", label: "Colación", pct: 10 },
  { id: "comida", label: "Comida", pct: 35 },
  { id: "colacion2", label: "Colación", pct: 10 },
  { id: "cena", label: "Cena", pct: 20 }
];
function distribuir(eq, pcts) {
  const ids = COMIDAS.map((c) => c.id);
  const principal = ids.reduce((a, b) => pcts[b] > pcts[a] ? b : a);
  const total = ids.reduce((s2, id) => s2 + (pcts[id] || 0), 0) || 100;
  const out = {};
  for (const [g, n] of Object.entries(eq)) {
    if (!n) continue;
    const fila = Object.fromEntries(ids.map((id) => [id, 0]));
    let usado = 0;
    for (const id of ids) {
      if (id === principal) continue;
      fila[id] = piso05(n * (pcts[id] || 0) / total);
      usado += fila[id];
    }
    fila[principal] = Math.max(0, n - usado);
    out[g] = fila;
  }
  return out;
}

// src/modules/nutricion/demo.ts
function demoNutricion(now) {
  const fecha = new Date(now - 7 * 864e5);
  const anios = (fecha.getTime() - Date.parse("1978-04-30")) / (365.25 * 864e5);
  const peso = 93.2, talla = 174, cintura = 106, cadera = 108;
  const geb = mifflin("M", peso, talla, anios);
  const factor = 1.375;
  const kcal = Math.round((geb * factor - 500) / 50) * 50;
  const macros = { hc: 45, prot: 20, lip: 35 };
  const opciones = { ...opcionesPorOmision(kcal), aoaTipo: "aoa-mb" };
  const eq = resolverEquivalentes(gramosMeta(kcal, macros), opciones);
  const pcts = Object.fromEntries(COMIDAS.map((c) => [c.id, c.pct]));
  const r22 = (x) => Math.round(x * 100) / 100;
  return [
    {
      id: "nut-demo-p6",
      patientId: "p6",
      fecha: fecha.toISOString(),
      tipo: "nutricion",
      estado: "activo",
      titulo: `Plan de alimentación ${kcal} kcal (${macros.hc}/${macros.prot}/${macros.lip})`,
      datos: {
        antro: { peso: String(peso), talla: String(talla), cintura: String(cintura), cadera: String(cadera), grasa: "31.5", brazo: "35" },
        ecuacion: "mifflin",
        factorId: "ligera",
        factor,
        ajuste: -500,
        kcal,
        macros,
        opciones,
        eq,
        dist: distribuir(eq, pcts),
        pcts,
        objetivo: "Reducir 5–10 % del peso en 6 meses; mejorar triglicéridos",
        notas: "Agua natural 2 L al día. Preferir cereales integrales y leguminosas. Evitar bebidas azucaradas y alcohol. Caminar 30 min al día, 5 días por semana.",
        resultados: { imc: r22(imc(peso, talla)), icc: r22(icc(cintura, cadera)), ict: r22(ict(cintura, talla)), geb: r22(geb), get: r22(geb * factor) }
      }
    }
  ];
}

// src/modules/ordenes/catalogo.ts
var PREP = {
  ayuno8: "Ayuno de 8 horas (puede tomar agua natural).",
  ayuno12: "Ayuno de 9 a 12 horas (solo agua natural); evitar alcohol y comidas muy grasosas el día previo.",
  sinAyuno: "No requiere ayuno.",
  orina1: "Primera orina de la mañana, chorro medio, previo aseo genital con agua y jabón, en frasco estéril.",
  urocultivo: "Primera orina de la mañana, chorro medio, previo aseo genital, frasco estéril. Tomar ANTES de iniciar antibióticos o tras 48–72 h sin ellos (según indique su médico).",
  orina24: "Recolección de orina de 24 horas: deseche la primera orina del día, recolecte todas las siguientes hasta la primera del día siguiente (inclusive). Mantenga el recipiente en refrigeración.",
  cps: "Tres muestras de heces de días distintos (serie), en frascos limpios; evitar laxantes y medios de contraste los días previos.",
  heces: "Muestra de heces reciente en frasco limpio; no mezclar con orina.",
  sangreOculta: "Siga la dieta indicada por el laboratorio según el método (en pruebas de guayaco: evitar carnes rojas, ciertos vegetales y vitamina C 3 días antes). Las pruebas inmunoquímicas no suelen requerir dieta.",
  embarazoOrina: "Primera orina de la mañana (más concentrada).",
  coag: "No requiere ayuno estricto. Informe si toma anticoagulantes o antiagregantes (warfarina, rivaroxabán, apixabán, aspirina, clopidogrel).",
  psa: "Evitar eyaculación 48 h antes, ciclismo o tacto rectal/procedimientos urológicos recientes (comente con su médico).",
  cortisol: "Toma matutina (entre 7 y 9 h) salvo otra indicación; informe si usa corticoesteroides.",
  hormonas: "Toma matutina. En mujeres, la fecha del ciclo puede ser importante: siga la indicación de su médico.",
  tiroides: "No requiere ayuno. Si toma levotiroxina, tome la muestra antes de la dosis del día. Suspenda biotina 2 días antes (interfiere con el análisis).",
  ctog: "Ayuno de 8 a 14 horas; dieta habitual (al menos 150 g de carbohidratos al día) los 3 días previos; permanecer sentado y sin fumar durante la prueba (≈ 2–3 h).",
  cultivo: "Tomar la muestra ANTES de iniciar antibióticos, en lo posible.",
  usgAbdomen: "Ayuno de 6 a 8 horas (evita gas y contrae la vesícula). Puede tomar sus medicamentos con poca agua.",
  usgPelvico: "Vejiga llena: tomar 1 litro de agua 1 hora antes del estudio y no orinar hasta terminar (salvo vía transvaginal, que requiere vejiga vacía).",
  usgObst: "En el primer trimestre: vejiga llena (1 litro de agua 1 h antes). Después del primer trimestre no requiere preparación.",
  usgSinPrep: "No requiere preparación.",
  usgProstata: "Vejiga llena: tomar 1 litro de agua 1 hora antes del estudio.",
  mastografia: "El día del estudio no aplicar desodorante, talco, cremas ni perfume en axilas y mamas. Lleve estudios previos. De preferencia 7–10 días después del inicio de la menstruación.",
  rx: "No requiere preparación. Retirar objetos metálicos de la zona. Informe si existe posibilidad de embarazo.",
  tacSimple: "Retirar objetos metálicos. Informe si existe posibilidad de embarazo.",
  tacContraste: "Ayuno de 4 a 6 horas. Creatinina sérica reciente. Informe alergias a medios de contraste yodado, diabetes con metformina, enfermedad renal o embarazo.",
  rm: "Retirar todo objeto metálico. Informe si tiene marcapasos, implantes, clips, prótesis, claustrofobia o embarazo. Si lleva contraste (gadolinio): creatinina reciente y ayuno de 4 a 6 h.",
  ecg: "No requiere preparación. Evitar cremas en el tórax; ropa cómoda.",
  holter: "Bañarse antes de la colocación (no podrá mojar el equipo 24–48 h). Registre en un diario sus actividades y síntomas.",
  mapa: "Ropa con manga holgada. Continúe sus actividades y medicamentos habituales salvo otra indicación; registre horarios de sueño y síntomas.",
  eco: "No requiere preparación. Lleve estudios previos.",
  prueba_esfuerzo: "Ropa y calzado deportivo. Comida ligera 2–3 h antes. Pregunte a su médico si debe suspender betabloqueadores.",
  espiro: "No fumar al menos 1 hora antes, no hacer ejercicio vigoroso 1 hora antes, ropa holgada. Su médico le indicará si debe suspender broncodilatadores y por cuánto tiempo (ATS/ERS 2019).",
  densito: "No tomar suplementos de calcio 24 h antes. Informe estudios recientes con contraste o medicina nuclear.",
  endoscopia: "Ayuno de 8 horas. Acudir acompañado (sedación).",
  colonoscopia: "Preparación intestinal con laxante según indicación del gastroenterólogo; dieta de líquidos claros el día previo. Acudir acompañado (sedación).",
  eeg: "Cabello limpio y seco, sin crema ni gel. Siga las indicaciones sobre sueño y medicamentos.",
  papanicolau: "No estar menstruando; sin duchas vaginales, óvulos, cremas ni relaciones sexuales 48 h antes."
};
var RAW2 = `
bh|Hematología|L|Biometría hemática completa|58410-2|sinAyuno|Sangre total (EDTA)
hb|Hematología|L|Hemoglobina y hematocrito|718-7|sinAyuno|Sangre total (EDTA)
plaq|Hematología|L|Cuenta de plaquetas|777-3|sinAyuno|Sangre total (EDTA)
reti|Hematología|L|Reticulocitos||sinAyuno|Sangre total (EDTA)
vsg|Hematología|L|Velocidad de sedimentación globular (VSG)|4537-7|sinAyuno|Sangre total
frotis|Hematología|L|Frotis de sangre periférica||sinAyuno|Sangre total (EDTA)
grupo|Hematología|L|Grupo sanguíneo ABO|883-9|sinAyuno|Sangre total
rh|Hematología|L|Factor Rh (D)|10331-7|sinAyuno|Sangre total
coombs|Hematología|L|Prueba de Coombs directa||sinAyuno|Sangre total
tp|Coagulación|L|Tiempo de protrombina (TP)|5902-2|coag|Plasma citratado
inr|Coagulación|L|INR|6301-6|coag|Plasma citratado
ttpa|Coagulación|L|Tiempo de tromboplastina parcial activada (TTPa)||coag|Plasma citratado
fibri|Coagulación|L|Fibrinógeno|3255-7|coag|Plasma citratado
dimd|Coagulación|L|Dímero D||coag|Plasma citratado
qs3|Química sanguínea|L|Química sanguínea de 3 elementos (glucosa, urea, creatinina)||ayuno8|Suero
qs4|Química sanguínea|L|Química sanguínea de 4 elementos (glucosa, urea, creatinina, ácido úrico)||ayuno8|Suero
qs6|Química sanguínea|L|Química sanguínea de 6 elementos (glucosa, urea, creatinina, ácido úrico, colesterol y triglicéridos; varía por laboratorio)||ayuno8|Suero
qs24|Química sanguínea|L|Química sanguínea de 24 elementos (perfil bioquímico)||ayuno12|Suero
bmp|Química sanguínea|L|Panel metabólico básico|51990-0|ayuno8|Suero
cmp|Química sanguínea|L|Panel metabólico completo|24323-8|ayuno8|Suero
glu|Química sanguínea|L|Glucosa sérica en ayuno|2345-7|ayuno8|Suero
ctog|Química sanguínea|L|Curva de tolerancia oral a la glucosa 75 g (2 h)||ctog|Suero
glupp|Química sanguínea|L|Glucosa posprandial 2 h||sinAyuno|Suero
a1c|Química sanguínea|L|Hemoglobina glucosilada (HbA1c)|4548-4|sinAyuno|Sangre total (EDTA)
insulina|Química sanguínea|L|Insulina sérica en ayuno|20448-7|ayuno8|Suero
bun|Química sanguínea|L|Nitrógeno ureico en sangre (BUN)|3094-0|ayuno8|Suero
crea|Química sanguínea|L|Creatinina sérica|2160-0|ayuno8|Suero
au|Química sanguínea|L|Ácido úrico|3084-1|ayuno8|Suero
ca|Química sanguínea|L|Calcio sérico|17861-6|ayuno8|Suero
mg|Química sanguínea|L|Magnesio sérico|19123-9|ayuno8|Suero
p|Química sanguínea|L|Fósforo sérico|2777-1|ayuno8|Suero
prot|Química sanguínea|L|Proteínas totales|2885-2|ayuno8|Suero
alb|Química sanguínea|L|Albúmina sérica|1751-7|ayuno8|Suero
amil|Química sanguínea|L|Amilasa sérica|1798-8|ayuno8|Suero
lipasa|Química sanguínea|L|Lipasa sérica|3040-3|ayuno8|Suero
ck|Química sanguínea|L|Creatina fosfocinasa (CPK) total|2157-6|sinAyuno|Suero
ldh|Química sanguínea|L|Deshidrogenasa láctica (DHL)|2532-0|sinAyuno|Suero
lipidos|Perfil de lípidos|L|Perfil de lípidos (colesterol total, HDL, LDL, triglicéridos)|24331-1|ayuno12|Suero
col|Perfil de lípidos|L|Colesterol total|2093-3|ayuno12|Suero
tg|Perfil de lípidos|L|Triglicéridos|2571-8|ayuno12|Suero
hdl|Perfil de lípidos|L|Colesterol HDL|2085-9|ayuno12|Suero
ldl|Perfil de lípidos|L|Colesterol LDL (calculado)|13457-7|ayuno12|Suero
pfh|Función hepática|L|Pruebas de función hepática (PFH)|24325-3|ayuno8|Suero
alt|Función hepática|L|Alanina aminotransferasa (ALT/TGP)|1742-6|ayuno8|Suero
ast|Función hepática|L|Aspartato aminotransferasa (AST/TGO)|1920-8|ayuno8|Suero
fa|Función hepática|L|Fosfatasa alcalina|6768-6|ayuno8|Suero
ggt|Función hepática|L|Gamma glutamil transferasa (GGT)|2324-2|ayuno8|Suero
bili|Función hepática|L|Bilirrubina total|1975-2|ayuno8|Suero
elec|Electrolitos|L|Electrolitos séricos (Na, K, Cl)|24326-1|sinAyuno|Suero
na|Electrolitos|L|Sodio sérico|2951-2|sinAyuno|Suero
k|Electrolitos|L|Potasio sérico|2823-3|sinAyuno|Suero
cl|Electrolitos|L|Cloro sérico|2075-0|sinAyuno|Suero
tiroideo|Perfil tiroideo|L|Perfil tiroideo (TSH, T4 libre, T3)||tiroides|Suero
tsh|Perfil tiroideo|L|Hormona estimulante de tiroides (TSH)|3016-3|tiroides|Suero
t4l|Perfil tiroideo|L|Tiroxina libre (T4L)|3024-7|tiroides|Suero
t3|Perfil tiroideo|L|Triyodotironina total (T3)|3053-6|tiroides|Suero
antitpo|Perfil tiroideo|L|Anticuerpos antiperoxidasa tiroidea (anti-TPO)||tiroides|Suero
pcr|Inflamación e inmunología|L|Proteína C reactiva (PCR)|1988-5|sinAyuno|Suero
fr|Inflamación e inmunología|L|Factor reumatoide|11572-5|sinAyuno|Suero
aslo|Inflamación e inmunología|L|Antiestreptolisinas O (ASLO)|5370-2|sinAyuno|Suero
reacfeb|Inflamación e inmunología|L|Reacciones febriles||sinAyuno|Suero
ana|Inflamación e inmunología|L|Anticuerpos antinucleares (ANA)||sinAyuno|Suero
ferritina|Hierro y vitaminas|L|Ferritina sérica|2276-4|ayuno8|Suero
hierro|Hierro y vitaminas|L|Hierro sérico|2498-4|ayuno8|Suero
perfhierro|Hierro y vitaminas|L|Perfil de hierro (hierro, transferrina, % saturación, ferritina)||ayuno8|Suero
b12|Hierro y vitaminas|L|Vitamina B12|2132-9|ayuno8|Suero
folato|Hierro y vitaminas|L|Ácido fólico sérico|2284-8|ayuno8|Suero
vitd|Hierro y vitaminas|L|25-hidroxivitamina D|1989-3|sinAyuno|Suero
trop|Cardiaco|L|Troponina I|10839-9|sinAyuno|Suero
bnp|Cardiaco|L|Péptido natriurético tipo B (BNP)|30934-4|sinAyuno|Plasma (EDTA)
ntbnp|Cardiaco|L|NT-proBNP|33762-6|sinAyuno|Suero
ego|Orina|L|Examen general de orina (EGO)|24356-8|orina1|Orina
microalb|Orina|L|Microalbuminuria|14957-5|orina1|Orina
acr|Orina|L|Relación albúmina/creatinina en orina|9318-7|orina1|Orina
dep24|Orina|L|Depuración de creatinina en orina de 24 h||orina24|Orina de 24 h y suero
prot24|Orina|L|Proteínas en orina de 24 h||orina24|Orina de 24 h
emb|Embarazo|L|Prueba inmunológica de embarazo en orina|2106-3|embarazoOrina|Orina
bhcg|Embarazo|L|Fracción beta de hormona gonadotropina coriónica (β-hCG) cuantitativa en sangre||sinAyuno|Suero
vih|Infecciosas|L|Prueba de detección de VIH (requiere consentimiento informado)||sinAyuno|Suero
vdrl|Infecciosas|L|VDRL|5292-8|sinAyuno|Suero
hbsag|Infecciosas|L|Antígeno de superficie de hepatitis B (HBsAg)|5196-1|sinAyuno|Suero
vhc|Infecciosas|L|Anticuerpos contra hepatitis C|16128-1|sinAyuno|Suero
vha|Infecciosas|L|Anticuerpos IgM contra hepatitis A||sinAyuno|Suero
toxo|Infecciosas|L|Perfil TORCH||sinAyuno|Suero
covid|Infecciosas|L|PCR para SARS-CoV-2||sinAyuno|Exudado nasofaríngeo
influenza|Infecciosas|L|Prueba rápida de influenza A/B||sinAyuno|Exudado nasofaríngeo
dengue|Infecciosas|L|Antígeno NS1 / anticuerpos para dengue||sinAyuno|Suero
uro|Microbiología|L|Urocultivo con antibiograma|630-4|urocultivo|Orina
hemo|Microbiología|L|Hemocultivo|600-7|cultivo|Sangre
exfar|Microbiología|L|Exudado faríngeo con cultivo||cultivo|Exudado faríngeo
copro|Microbiología|L|Coprocultivo||cultivo|Heces
cps|Coproparasitoscópico|L|Coproparasitoscópico seriado (3 muestras)||cps|Heces
cpsu|Coproparasitoscópico|L|Coproparasitoscópico único||heces|Heces
amiba|Coproparasitoscópico|L|Amiba en fresco||heces|Heces
copol|Coproparasitoscópico|L|Coprológico||heces|Heces
soh|Coproparasitoscópico|L|Sangre oculta en heces|2335-8|sangreOculta|Heces
psa|Hormonas y marcadores|L|Antígeno prostático específico (PSA) total|2857-1|psa|Suero
psal|Hormonas y marcadores|L|PSA libre||psa|Suero
fsh|Hormonas y marcadores|L|Hormona folículo estimulante (FSH)|15067-2|hormonas|Suero
lh|Hormonas y marcadores|L|Hormona luteinizante (LH)|10501-5|hormonas|Suero
prl|Hormonas y marcadores|L|Prolactina|2842-3|hormonas|Suero
e2|Hormonas y marcadores|L|Estradiol|2243-4|hormonas|Suero
testo|Hormonas y marcadores|L|Testosterona total|2986-8|hormonas|Suero
cortisol|Hormonas y marcadores|L|Cortisol sérico matutino|2143-6|cortisol|Suero
ca125|Hormonas y marcadores|L|Antígeno CA-125||sinAyuno|Suero
cea|Hormonas y marcadores|L|Antígeno carcinoembrionario (ACE)||sinAyuno|Suero
pap|Citología|L|Citología cervicovaginal (Papanicolaou)||papanicolau|Exudado cervical
vph|Citología|L|Detección de VPH de alto riesgo||papanicolau|Exudado cervical
rxtorax|Radiología|G|Radiografía de tórax PA||rx|
rxtoraxl|Radiología|G|Radiografía de tórax PA y lateral||rx|
rxabd|Radiología|G|Radiografía simple de abdomen (de pie y decúbito)||rx|
rxcolc|Radiología|G|Radiografía de columna cervical AP y lateral||rx|
rxcoll|Radiología|G|Radiografía de columna lumbosacra AP y lateral||rx|
rxrod|Radiología|G|Radiografía de rodilla AP y lateral||rx|
rxmano|Radiología|G|Radiografía de mano AP y oblicua||rx|
rxsenos|Radiología|G|Radiografía de senos paranasales (Waters)||rx|
rxpelvis|Radiología|G|Radiografía de pelvis AP||rx|
rxedad|Radiología|G|Radiografía de mano izquierda para edad ósea||rx|
usgabd|Ultrasonido|G|Ultrasonido de abdomen superior (hígado y vías biliares)||usgAbdomen|
usgabdc|Ultrasonido|G|Ultrasonido abdominal completo||usgAbdomen|
usgrenal|Ultrasonido|G|Ultrasonido renal y de vías urinarias||usgPelvico|
usgpel|Ultrasonido|G|Ultrasonido pélvico||usgPelvico|
usgtv|Ultrasonido|G|Ultrasonido endovaginal||usgSinPrep|
usgobs|Ultrasonido|G|Ultrasonido obstétrico||usgObst|
usgestr|Ultrasonido|G|Ultrasonido obstétrico estructural (2.º trimestre)||usgSinPrep|
usgmam|Ultrasonido|G|Ultrasonido mamario||usgSinPrep|
usgtir|Ultrasonido|G|Ultrasonido de tiroides||usgSinPrep|
usgprost|Ultrasonido|G|Ultrasonido prostático suprapúbico||usgProstata|
usgtest|Ultrasonido|G|Ultrasonido testicular||usgSinPrep|
usgpb|Ultrasonido|G|Ultrasonido de partes blandas||usgSinPrep|
doppler|Ultrasonido|G|Ultrasonido Doppler venoso de miembros inferiores||usgSinPrep|
dopcar|Ultrasonido|G|Ultrasonido Doppler carotídeo||usgSinPrep|
mastoT|Mastografía|G|Mastografía de tamizaje bilateral||mastografia|
mastoD|Mastografía|G|Mastografía diagnóstica||mastografia|
densito|Mastografía|G|Densitometría ósea (DXA) de columna y cadera||densito|
tacsimple|Tomografía|G|Tomografía de cráneo simple||tacSimple|
taccont|Tomografía|G|Tomografía de abdomen y pelvis contrastada||tacContraste|
tactorax|Tomografía|G|Tomografía de tórax simple||tacSimple|
angiotac|Tomografía|G|Angiotomografía de tórax (protocolo TEP)||tacContraste|
urotac|Tomografía|G|Urotomografía simple||tacSimple|
rmcraneo|Resonancia magnética|G|Resonancia magnética de cráneo||rm|
rmlumbar|Resonancia magnética|G|Resonancia magnética de columna lumbar||rm|
rmrodilla|Resonancia magnética|G|Resonancia magnética de rodilla||rm|
rmhombro|Resonancia magnética|G|Resonancia magnética de hombro||rm|
ecg|Cardiología|G|Electrocardiograma de 12 derivaciones|11524-6|ecg|
eco|Cardiología|G|Ecocardiograma transtorácico||eco|
holter|Cardiología|G|Holter de 24 horas||holter|
mapa|Cardiología|G|Monitoreo ambulatorio de presión arterial (MAPA) 24 h||mapa|
esfuerzo|Cardiología|G|Prueba de esfuerzo||prueba_esfuerzo|
espiro|Neumología|G|Espirometría con broncodilatador||espiro|
eeg|Neurología|G|Electroencefalograma||eeg|
endo|Endoscopia|G|Endoscopia de tubo digestivo alto||endoscopia|
colono|Endoscopia|G|Colonoscopia||colonoscopia|
audio|Otros|G|Audiometría tonal||usgSinPrep|
`;
var CATALOGO = RAW2.trim().split("\n").map((l) => {
  const [id, grupo2, t, nombre, loinc, prep, muestra] = l.split("|");
  return {
    id,
    grupo: grupo2,
    tipo: t === "G" ? "gabinete" : "laboratorio",
    nombre,
    ...loinc ? { loinc } : {},
    ...prep && PREP[prep] ? { preparacion: PREP[prep] } : {},
    ...muestra ? { muestra } : {}
  };
});

// src/modules/ordenes/ordenes.ts
function tituloOrden(folio, items) {
  const nombres = items.map((i) => i.nombre.replace(/\s*\(.*\)\s*/g, " ").trim());
  const txt = nombres.slice(0, 3).join(", ") + (nombres.length > 3 ? ` y ${nombres.length - 3} más` : "");
  return `Orden ${folio}: ${txt}`;
}

// src/modules/ordenes/demo.ts
var item = (id) => {
  const e = CATALOGO.find((x) => x.id === id);
  return { id: e.id, nombre: e.nombre, tipo: e.tipo, ...e.loinc ? { loinc: e.loinc } : {}, ...e.preparacion ? { preparacion: e.preparacion } : {}, ...e.muestra ? { muestra: e.muestra } : {} };
};
function demoOrdenes(now) {
  const day2 = 864e5;
  const iso = (t) => new Date(t).toISOString();
  const medico = "Dra. Andrea Morales Peña";
  const items1 = ["a1c", "qs6", "lipidos", "acr", "ego"].map(item);
  const items2 = ["bh", "tsh", "ecg"].map(item);
  return [
    {
      id: "demo-orden-1",
      patientId: "p1",
      fecha: iso(now - 9 * day2),
      tipo: "orden",
      estado: "pendiente",
      titulo: tituloOrden("OR-000002", items1),
      datos: {
        folio: "OR-000002",
        items: items1,
        diagnosticos: [
          { codigo: "E11.9", nombre: "Diabetes mellitus tipo 2 sin complicaciones" },
          { codigo: "I10", nombre: "Hipertensión esencial (primaria)" }
        ],
        diagnosticoTexto: "Control trimestral",
        urgencia: "ordinaria",
        laboratorio: "Laboratorio Clínico Central",
        indicaciones: "Paciente en tratamiento con metformina y losartán.",
        medico,
        historial: [{ estado: "pendiente", fecha: iso(now - 9 * day2), por: medico }]
      }
    },
    {
      id: "demo-orden-0",
      patientId: "p1",
      fecha: iso(now - 120 * day2),
      tipo: "orden",
      estado: "revisado",
      titulo: tituloOrden("OR-000001", items2),
      datos: {
        folio: "OR-000001",
        items: items2,
        diagnosticos: [{ codigo: "I10", nombre: "Hipertensión esencial (primaria)" }],
        urgencia: "ordinaria",
        medico,
        notaRevision: "BH y TSH normales. ECG en ritmo sinusal sin alteraciones agudas.",
        historial: [
          { estado: "pendiente", fecha: iso(now - 120 * day2), por: medico },
          { estado: "muestra", fecha: iso(now - 117 * day2) },
          { estado: "resultado", fecha: iso(now - 115 * day2) },
          { estado: "revisado", fecha: iso(now - 112 * day2), por: medico }
        ]
      }
    }
  ];
}

// src/modules/prenatal/calc.ts
var DIA2 = 864e5;
function diaUTC(f) {
  const [y, m, d] = f.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}
function sumarDias(f, dias) {
  return new Date(diaUTC(f) + dias * DIA2).toISOString().slice(0, 10);
}
function diasEntre(a, b) {
  return Math.round((diaUTC(b) - diaUTC(a)) / DIA2);
}
function hoyISO(now = /* @__PURE__ */ new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`;
}
function sdgTexto(dias) {
  if (!Number.isFinite(dias)) return "—";
  const s2 = Math.floor(dias / 7);
  return `${s2}.${dias - s2 * 7} SDG`;
}
function fppNaegele(fum) {
  return sumarDias(fum, 280);
}
function umbralRedatacion(sdgFumDias) {
  if (sdgFumDias < 9 * 7) return 5;
  if (sdgFumDias < 14 * 7) return 7;
  if (sdgFumDias < 16 * 7) return 7;
  if (sdgFumDias < 22 * 7) return 10;
  if (sdgFumDias < 28 * 7) return 14;
  return 21;
}
function datar(fum, usg) {
  const fumUsg = usg && usg.fecha && usg.sdgDias > 0 ? sumarDias(usg.fecha, -usg.sdgDias) : null;
  const fppFum = fum ? fppNaegele(fum) : null;
  const fppUsg = fumUsg ? fppNaegele(fumUsg) : null;
  if (fum && fumUsg && usg) {
    const sdgFum = diasEntre(fum, usg.fecha);
    const disc = Math.abs(sdgFum - usg.sdgDias);
    const umbral = umbralRedatacion(sdgFum);
    if (disc > umbral)
      return { fumEfectiva: fumUsg, fpp: fppUsg, fppFum, fppUsg, metodo: "USG", discrepanciaDias: disc, umbralDias: umbral, explicacion: `Discrepancia de ${disc} días (> ${umbral} días para ${sdgTexto(sdgFum)} por FUM): se re-data con el ultrasonido.` };
    return { fumEfectiva: fum, fpp: fppFum, fppFum, fppUsg, metodo: "FUM", discrepanciaDias: disc, umbralDias: umbral, explicacion: `Discrepancia de ${disc} días (≤ ${umbral} días): se conserva la FUM.` };
  }
  if (fum) return { fumEfectiva: fum, fpp: fppFum, fppFum, fppUsg, metodo: "FUM", explicacion: "Datación por FUM (sin ultrasonido temprano registrado)." };
  if (fumUsg) return { fumEfectiva: fumUsg, fpp: fppUsg, fppFum, fppUsg, metodo: "USG", explicacion: "FUM desconocida: datación por ultrasonido." };
  return { fumEfectiva: null, fpp: null, fppFum, fppUsg, metodo: "ninguno", explicacion: "Sin FUM ni ultrasonido: no se puede datar." };
}
function sdgEn(fumEfectiva, fecha) {
  return diasEntre(fumEfectiva, fecha);
}
function lccAEdad(lccMm) {
  return 8.052 * Math.sqrt(lccMm) + 23.73;
}
function pfeHadlock(ccCm, caCm, lfCm) {
  return 10 ** (1.326 - 326e-5 * caCm * lfCm + 0.0107 * ccCm + 0.0438 * caCm + 0.158 * lfCm);
}
var HADLOCK91_DE = 0.127;
function pesoMedianoHadlock91(egSem) {
  return Math.exp(0.578 + 0.332 * egSem - 354e-5 * egSem * egSem);
}
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}
function percentilHadlock91(pesoG, egSem) {
  const mediana = pesoMedianoHadlock91(egSem);
  const z = (pesoG / mediana - 1) / HADLOCK91_DE;
  return { mediana, z, percentil: phi(z) * 100 };
}

// src/modules/prenatal/modelo.ts
function datacionDe(e) {
  return datar(e.fum, e.usg);
}
function tituloEmbarazo(d) {
  const fpp = datacionDe(d).fpp;
  const f = fpp ? (/* @__PURE__ */ new Date(fpp + "T12:00:00")).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "";
  return `Embarazo G${d.gesta}${f ? ` · FPP ${f}` : ""}`;
}

// src/modules/prenatal/demo.ts
var DIA3 = 864e5;
function demoPrenatal(now) {
  const f = (diasAtras) => hoyISO(new Date(now - diasAtras * DIA3));
  const iso = (diasAtras) => (/* @__PURE__ */ new Date(f(diasAtras) + "T12:00:00")).toISOString();
  const fum = f(154);
  const usgFecha = f(90);
  const lcc = 25;
  const pfe = pfeHadlock(17.8, 15.2, 3.3);
  const fechaUsg2 = f(13);
  const sdgUsg2 = sdgEn(fum, fechaUsg2);
  const emb = {
    clase: "embarazo",
    fum,
    fumConfiable: true,
    usg: { fecha: usgFecha, sdgDias: Math.round(lccAEdad(lcc)), lcc },
    gesta: 2,
    para: 1,
    cesareas: 0,
    abortos: 0,
    grupoRh: "A-",
    pesoPre: 57,
    talla: 160,
    riesgos: ["Isoinmunización / Rh negativo"],
    riesgoNotas: "Parto eutócico previo en 2021 sin complicaciones. Alergia a sulfas.",
    biometrias: [
      { fecha: usgFecha, sdgDias: sdgEn(fum, usgFecha), lcc, notas: "Embrión único, vivo. FCF 168 lpm." },
      { fecha: fechaUsg2, sdgDias: sdgUsg2, cc: 17.8, ca: 15.2, lf: 3.3, pfe, percentil: percentilHadlock91(pfe, sdgUsg2 / 7).percentil, notas: "USG estructural sin alteraciones. Placenta posterior normoinserta." }
    ]
  };
  const embId = "demo-prenatal-p5-emb";
  const visitas = [
    [90, { peso: 58, pas: 108, pad: 70, movimientos: "", edema: "no", proteinuria: "negativa", notas: "Primera consulta. Náusea matutina leve. Se indica ácido fólico y laboratorios de primer trimestre." }],
    [62, { peso: 59.5, pas: 110, pad: 70, fcf: 158, edema: "no", proteinuria: "negativa", notas: "Laboratorios normales. Coombs indirecto negativo." }],
    [34, { peso: 61.2, pas: 112, pad: 72, au: 16, fcf: 150, movimientos: "presentes", edema: "no", proteinuria: "negativa", notas: "Percibe movimientos fetales." }],
    [6, { peso: 63, pas: 114, pad: 74, au: 21, fcf: 146, movimientos: "presentes", edema: "leve", proteinuria: "negativa", presentacion: "no-valorable", notas: "Edema maleolar vespertino. Se programa Tdpa y tamiz de diabetes 24–28 SDG." }]
  ];
  const consultas = visitas.map(([d, c], i) => {
    const sdgDias = sdgEn(fum, f(d));
    const datos = { fecha: f(d), ...c, clase: "consulta", embarazoId: embId, sdgDias, obsIds: [] };
    return { id: `demo-prenatal-p5-c${i + 1}`, patientId: "p5", tipo: "prenatal", fecha: iso(d), estado: "normal", titulo: `Consulta prenatal ${Math.floor(sdgDias / 7)}.${sdgDias % 7} SDG`, datos };
  });
  return [
    { id: embId, patientId: "p5", tipo: "prenatal", fecha: iso(154), estado: "activo", titulo: tituloEmbarazo(emb), datos: emb },
    ...consultas
  ];
}

// src/modules/tamizajes/demo.ts
var DAY2 = 864e5;
function reg(id, patientId, now, dias, regla, titulo, datos) {
  const fecha = new Date(now - dias * DAY2);
  fecha.setHours(12, 0, 0, 0);
  return { id, patientId, fecha: fecha.toISOString(), tipo: "tamizaje", estado: "realizado", titulo, datos: { regla, realizado: fecha.toISOString().slice(0, 10), ...datos } };
}
function demoTamizajes(now) {
  return [
    reg("reg-tam-p1-mx", "p1", now, 3 * 365 + 20, "mama-mastografia", "Cáncer de mama: mastografía — normal / negativo", { resultado: "normal", notas: "BI-RADS 1. Hospital General." }),
    reg("reg-tam-p1-cacu", "p1", now, 300, "cacu", "Cáncer cervicouterino: Citología cervical — normal / negativo", { prueba: "citologia", resultado: "normal", notas: "Negativo a lesión intraepitelial." }),
    reg("reg-tam-p2-crc", "p2", now, 240, "colorrectal", "Cáncer colorrectal: Sangre oculta en heces — normal / negativo", { prueba: "soh", resultado: "normal", notas: "Prueba inmunoquímica negativa." })
  ];
}

// src/modules/tareas/tareas.ts
var ESTADOS = [
  { id: "abierta", label: "Abierta" },
  { id: "en-curso", label: "En curso" },
  { id: "hecha", label: "Hecha" },
  { id: "cancelada", label: "Cancelada" }
];
var ESTADO_LABEL = Object.fromEntries(ESTADOS.map((e) => [e.id, e.label]));
var PRIORIDADES = [
  { id: "urgente", label: "Urgente", peso: 4 },
  { id: "alta", label: "Alta", peso: 3 },
  { id: "media", label: "Media", peso: 2 },
  { id: "baja", label: "Baja", peso: 1 }
];
var PRIORIDAD_LABEL = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.label]));
var PESO = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.peso]));
var ETIQUETAS = [
  { id: "llamar-paciente", label: "Llamar paciente" },
  { id: "resultado-pendiente", label: "Resultado pendiente" },
  { id: "cobro", label: "Cobro" },
  { id: "insumos", label: "Insumos" },
  { id: "administrativo", label: "Administrativo" }
];
var ETIQUETA_LABEL = Object.fromEntries(ETIQUETAS.map((e) => [e.id, e.label]));
function fechaLocal(t) {
  const d = typeof t === "number" ? new Date(t) : t;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// src/modules/tareas/demo.ts
function demoTareas(now) {
  const DIA4 = 864e5;
  const iso = (t) => new Date(t).toISOString();
  const d = (dias) => fechaLocal(now + dias * DIA4);
  const DRA = "Dra. Andrea Morales Peña";
  const REC = "Laura (recepción)";
  const ENF = "Enf. Patricia Juárez";
  return [
    {
      id: "demo-tarea-1",
      tipo: "tarea",
      patientId: "p1",
      fecha: iso(now - 6 * DIA4),
      estado: "abierta",
      titulo: "Llamar para agendar control trimestral",
      datos: {
        descripcion: "Ofrecer horario por la mañana; prefiere WhatsApp.",
        asignadoNombre: REC,
        prioridad: "alta",
        vence: d(-2),
        etiquetas: ["llamar-paciente"],
        comentarios: [
          {
            fecha: iso(now - 3 * DIA4),
            autor: REC,
            texto: "Primer intento sin respuesta; se dejó mensaje."
          }
        ],
        creadoPorNombre: DRA
      }
    },
    {
      id: "demo-tarea-2",
      tipo: "tarea",
      patientId: "p2",
      fecha: iso(now - 4 * DIA4),
      estado: "en-curso",
      titulo: "Resultado de laboratorio listo: avisar para cita de revisión",
      datos: {
        descripcion: "El laboratorio envió el resultado al correo de la clínica. Agendar revisión con la doctora.",
        asignadoNombre: REC,
        prioridad: "media",
        vence: d(-1),
        etiquetas: ["resultado-pendiente", "llamar-paciente"],
        comentarios: [],
        creadoPorNombre: DRA
      }
    },
    {
      id: "demo-tarea-3",
      tipo: "tarea",
      fecha: iso(now - 2 * DIA4),
      estado: "abierta",
      titulo: "Pedir guantes de nitrilo y abatelenguas",
      datos: {
        descripcion: "Quedan 2 cajas de guantes talla M.",
        asignadoNombre: ENF,
        prioridad: "media",
        vence: d(1),
        etiquetas: ["insumos"],
        comentarios: [],
        recurrencia: "mensual",
        creadoPorNombre: ENF
      }
    },
    {
      id: "demo-tarea-4",
      tipo: "tarea",
      patientId: "p6",
      fecha: iso(now - 1 * DIA4),
      estado: "abierta",
      titulo: "Enviar factura pendiente de la consulta",
      datos: {
        descripcion: "Ya proporcionó RFC y constancia fiscal.",
        asignadoNombre: REC,
        prioridad: "baja",
        vence: d(3),
        etiquetas: ["cobro"],
        comentarios: [],
        creadoPorNombre: REC
      }
    },
    {
      id: "demo-tarea-5",
      tipo: "tarea",
      fecha: iso(now - 8 * DIA4),
      estado: "hecha",
      titulo: "Renovar aviso de funcionamiento ante COFEPRIS",
      datos: {
        descripcion: "",
        asignadoNombre: DRA,
        prioridad: "alta",
        vence: d(-3),
        etiquetas: ["administrativo"],
        comentarios: [
          {
            fecha: iso(now - 5 * DIA4),
            autor: DRA,
            texto: "Trámite enviado; acuse guardado en la carpeta de la clínica."
          }
        ],
        creadoPorNombre: DRA,
        completadaEn: iso(now - 5 * DIA4)
      }
    },
    {
      id: "demo-tarea-6",
      tipo: "tarea",
      patientId: "p8",
      fecha: iso(now - 7 * DIA4),
      estado: "cancelada",
      titulo: "Confirmar cita de seguimiento",
      datos: {
        descripcion: "La familia reagendó directamente por teléfono.",
        asignadoNombre: REC,
        prioridad: "media",
        vence: d(-4),
        etiquetas: ["llamar-paciente"],
        comentarios: [],
        creadoPorNombre: REC
      }
    },
    {
      id: "demo-tarea-7",
      tipo: "tarea",
      fecha: iso(now - 1 * DIA4),
      estado: "abierta",
      titulo: "Revisar caducidades del botiquín",
      datos: {
        descripcion: "",
        asignadoNombre: DRA,
        prioridad: "urgente",
        vence: d(0),
        etiquetas: ["insumos"],
        comentarios: [],
        recurrencia: "mensual",
        creadoPorNombre: DRA
      }
    }
  ];
}

// src/modules/triaje/esi.ts
var ZONA_PELIGRO = [
  { rango: "< 3 meses", desdeMeses: 0, hastaMeses: 3, fc: 180, fr: 50 },
  { rango: "3 meses – 3 años", desdeMeses: 3, hastaMeses: 36, fc: 160, fr: 40 },
  { rango: "3 – 8 años", desdeMeses: 36, hastaMeses: 96, fc: 140, fr: 30 },
  { rango: "> 8 años", desdeMeses: 96, hastaMeses: Infinity, fc: 100, fr: 20 }
];
var SPO2_PELIGRO = 92;
function umbralEdad(edadMeses) {
  return ZONA_PELIGRO.find((z) => edadMeses >= z.desdeMeses && edadMeses < z.hastaMeses) ?? ZONA_PELIGRO[ZONA_PELIGRO.length - 1];
}
function zonaPeligro(v, edadMeses) {
  const u = umbralEdad(edadMeses);
  const out = [];
  if (v.fc != null && v.fc > u.fc) out.push(`FC ${v.fc} lpm > ${u.fc} (${u.rango})`);
  if (v.fr != null && v.fr > u.fr) out.push(`FR ${v.fr} rpm > ${u.fr} (${u.rango})`);
  if (v.spo2 != null && v.spo2 < SPO2_PELIGRO) out.push(`SpO₂ ${v.spo2} % < ${SPO2_PELIGRO} %`);
  return out;
}
function fiebrePediatrica(edadMeses, temp, vacunasIncompletasOSinFoco = false) {
  if (edadMeses >= 36) return void 0;
  const dias = edadMeses * 30.4375;
  if (temp != null && temp > 38 && dias <= 28) return { nivelMinimo: 2, texto: "Neonato (1–28 días) con temperatura > 38.0 °C: asignar al menos ESI 2." };
  if (temp != null && temp > 38 && edadMeses < 3) return { considerar: 2, texto: "Lactante de 1–3 meses con temperatura > 38.0 °C: considerar ESI 2." };
  if (edadMeses >= 3 && (temp != null && temp > 39 || vacunasIncompletasOSinFoco && temp != null && temp > 38))
    return { considerar: 3, texto: "Niño de 3 meses a 3 años con fiebre > 39.0 °C, vacunas incompletas o sin foco evidente: considerar ESI 3." };
  return void 0;
}
function clasificarESI(e) {
  const zp = zonaPeligro(e.vitales, e.edadMeses);
  const fiebre = fiebrePediatrica(e.edadMeses, e.vitales.temp, e.vacunasIncompletasOSinFoco);
  const base = { zonaPeligro: zp, fiebre };
  if (e.salvavidas) return { ...base, nivel: 1, punto: "A", razones: ["Requiere intervención inmediata para salvar la vida"] };
  const b = [];
  if (e.altoRiesgo) b.push("Situación de alto riesgo");
  if (e.confusion) b.push("Confusión, letargo o desorientación de inicio reciente");
  if (e.dolorIntenso) b.push("Dolor o angustia intensos");
  if (b.length) return { ...base, nivel: 2, punto: "B", razones: b };
  if (fiebre?.nivelMinimo === 2) return { ...base, nivel: 2, punto: "B", razones: [fiebre.texto] };
  const r3 = Math.max(0, Math.floor(e.recursos));
  let res;
  if (r3 === 0) res = { ...base, nivel: 5, punto: "C", razones: ["No requiere recursos"] };
  else if (r3 === 1) res = { ...base, nivel: 4, punto: "C", razones: ["Requiere un recurso"] };
  else if (zp.length && e.aceptarSubirPorVitales !== false) res = { ...base, nivel: 2, punto: "D", razones: [`Requiere ${r3} recursos y tiene signos vitales en zona de peligro`, ...zp] };
  else res = { ...base, nivel: 3, punto: "D", razones: [`Requiere ${r3} recursos`] };
  if (fiebre?.considerar && fiebre.considerar < res.nivel && e.aceptarSubirPorVitales !== false) {
    res = { ...res, nivel: fiebre.considerar, razones: [...res.razones, fiebre.texto] };
  }
  return res;
}
var RECURSOS = [
  { id: "lab", nombre: "Laboratorios (sangre, orina)", cuenta: 1 },
  { id: "ecg-rx", nombre: "ECG, radiografías", cuenta: 1 },
  { id: "imagen", nombre: "TAC, RM, ultrasonido, angiografía", cuenta: 1 },
  { id: "liquidos", nombre: "Líquidos IV (hidratación)", cuenta: 1 },
  { id: "meds", nombre: "Medicamentos IV, IM o nebulizados", cuenta: 1 },
  { id: "interconsulta", nombre: "Interconsulta a especialidad", cuenta: 1 },
  { id: "proc-simple", nombre: "Procedimiento simple (sutura, sonda vesical)", cuenta: 1 },
  { id: "proc-complejo", nombre: "Procedimiento complejo (sedación consciente)", cuenta: 2 }
];
function contarRecursos(ids) {
  return [...new Set(ids)].reduce((s2, id) => s2 + (RECURSOS.find((r3) => r3.id === id)?.cuenta ?? 0), 0);
}

// src/modules/triaje/demo.ts
var NACIMIENTOS = { p3: "2021-06-20", p4: "1990-08-09", p8: "2012-09-18" };
var meses = (pid, now) => (now - Date.parse(NACIMIENTOS[pid])) / (30.4375 * 864e5);
function demoTriaje(now) {
  const casos = [
    { id: "tri-demo-1", pid: "p4", hace: 48, motivo: "Torcedura de tobillo derecho jugando futbol, no puede apoyar", dolor: 6, vitales: { fc: 88, fr: 16, spo2: 98, temp: 36.6, pas: 124, pad: 78 }, recursos: ["ecg-rx"] },
    { id: "tri-demo-2", pid: "p8", hace: 22, motivo: "Dificultad para respirar y sibilancias desde anoche; asma conocida", dolor: 2, vitales: { fc: 112, fr: 28, spo2: 91, temp: 36.9 }, recursos: ["meds", "ecg-rx"] },
    { id: "tri-demo-3", pid: "p3", hace: 9, motivo: "Fiebre y dolor de oído izquierdo desde ayer", dolor: 4, vitales: { fc: 118, fr: 24, spo2: 98, temp: 38.4 }, recursos: [] }
  ];
  return casos.map((c) => {
    const edadMeses = Math.floor(meses(c.pid, now));
    const llegada = new Date(now - c.hace * 6e4).toISOString();
    const recursos = contarRecursos(c.recursos);
    const res = clasificarESI({ edadMeses, salvavidas: false, altoRiesgo: !!c.altoRiesgo, confusion: false, dolorIntenso: false, recursos, vitales: c.vitales, aceptarSubirPorVitales: true });
    return {
      id: c.id,
      patientId: c.pid,
      fecha: llegada,
      tipo: "triaje",
      estado: "espera",
      titulo: `Triaje ESI ${res.nivel} · ${c.motivo.slice(0, 60)}`,
      datos: {
        llegada,
        edadMeses,
        motivo: c.motivo,
        dolor: c.dolor,
        vitales: c.vitales,
        salvavidas: false,
        altoRiesgo: !!c.altoRiesgo,
        confusion: false,
        dolorIntenso: false,
        recursos: c.recursos,
        aceptarSubirPorVitales: true,
        nivel: res.nivel,
        punto: res.punto,
        razones: res.razones,
        zonaPeligro: res.zonaPeligro,
        evaluadoPor: "Enf. Laura Pérez (demo)",
        evaluadoEn: llegada,
        obsIds: [],
        historial: []
      }
    };
  });
}

// src/modules/vacunacion/esquema.ts
var VACUNAS = [
  { id: "bcg", nombre: "BCG", protege: "Tuberculosis (formas graves)", via: "Intradérmica", sitio: "Región deltoidea derecha" },
  { id: "hb", nombre: "Hepatitis B", protege: "Hepatitis B", via: "Intramuscular", sitio: "Cara anterolateral externa del muslo derecho" },
  { id: "hexa", nombre: "Hexavalente acelular", protege: "Difteria, tos ferina, tétanos, poliomielitis, H. influenzae b y hepatitis B", via: "Intramuscular", sitio: "Muslo (< 18 meses) / deltoides", equivalentes: ["Pentavalente acelular (esquemas anteriores)"] },
  { id: "rota", nombre: "Rotavirus", protege: "Diarrea por rotavirus", via: "Oral", sitio: "Boca" },
  { id: "pcv", nombre: "Neumocócica conjugada", protege: "Neumonía, meningitis y otitis por neumococo", via: "Intramuscular", sitio: "Muslo / deltoides" },
  { id: "flu", nombre: "Influenza estacional", protege: "Influenza", via: "Intramuscular", sitio: "Muslo (< 18 meses) / deltoides" },
  { id: "srp", nombre: "SRP (triple viral)", protege: "Sarampión, rubéola y parotiditis", via: "Subcutánea", sitio: "Región deltoidea izquierda" },
  { id: "dpt", nombre: "DPT", protege: "Difteria, tos ferina y tétanos", via: "Intramuscular", sitio: "Región deltoidea izquierda" },
  { id: "vph", nombre: "VPH", protege: "Virus del papiloma humano (cáncer cervicouterino y otros)", via: "Intramuscular", sitio: "Región deltoidea" },
  { id: "td", nombre: "Td", protege: "Tétanos y difteria", via: "Intramuscular", sitio: "Región deltoidea" },
  { id: "tdpa", nombre: "Tdpa", protege: "Tétanos, difteria y tos ferina acelular", via: "Intramuscular", sitio: "Región deltoidea" },
  { id: "neumo23", nombre: "Neumocócica polisacárida 23-valente", protege: "Neumonía por neumococo", via: "Intramuscular", sitio: "Región deltoidea" },
  { id: "sr", nombre: "SR (doble viral)", protege: "Sarampión y rubéola", via: "Subcutánea", sitio: "Región deltoidea" },
  { id: "covid", nombre: "COVID-19", protege: "COVID-19", via: "Intramuscular", sitio: "Región deltoidea" }
];
var vacunaPorId = (id) => VACUNAS.find((v) => v.id === id);
var ESQUEMA = [
  { id: "bcg-u", vacunaId: "bcg", dosis: "Única", grupo: "infantil", edadMeses: 0, edadTexto: "Al nacer" },
  { id: "hb-1", vacunaId: "hb", dosis: "1.ª (al nacer)", grupo: "infantil", edadMeses: 0, edadTexto: "Al nacer", verificar: "Las dosis de 2 y 6 meses se cubren con la hexavalente." },
  { id: "hexa-1", vacunaId: "hexa", dosis: "1.ª", grupo: "infantil", edadMeses: 2, edadTexto: "2 meses", maxMeses: 59 },
  { id: "hexa-2", vacunaId: "hexa", dosis: "2.ª", grupo: "infantil", edadMeses: 4, edadTexto: "4 meses", maxMeses: 59 },
  { id: "hexa-3", vacunaId: "hexa", dosis: "3.ª", grupo: "infantil", edadMeses: 6, edadTexto: "6 meses", maxMeses: 59 },
  { id: "hexa-4", vacunaId: "hexa", dosis: "4.ª (refuerzo)", grupo: "infantil", edadMeses: 18, edadTexto: "18 meses", maxMeses: 59 },
  { id: "rota-1", vacunaId: "rota", dosis: "1.ª", grupo: "infantil", edadMeses: 2, edadTexto: "2 meses", maxMeses: 8, verificar: "Esquema de 2 dosis con vacuna monovalente (lineamientos 2025); edad máxima de aplicación por verificar." },
  { id: "rota-2", vacunaId: "rota", dosis: "2.ª", grupo: "infantil", edadMeses: 4, edadTexto: "4 meses", maxMeses: 8, verificar: "Edad máxima de aplicación por verificar." },
  { id: "pcv-1", vacunaId: "pcv", dosis: "1.ª", grupo: "infantil", edadMeses: 2, edadTexto: "2 meses", maxMeses: 59 },
  { id: "pcv-2", vacunaId: "pcv", dosis: "2.ª", grupo: "infantil", edadMeses: 4, edadTexto: "4 meses", maxMeses: 59 },
  { id: "pcv-3", vacunaId: "pcv", dosis: "Refuerzo", grupo: "infantil", edadMeses: 12, edadTexto: "12 meses", maxMeses: 59 },
  { id: "flu-1", vacunaId: "flu", dosis: "1.ª", grupo: "infantil", edadMeses: 6, edadTexto: "6 meses", maxMeses: 59 },
  { id: "flu-2", vacunaId: "flu", dosis: "2.ª", grupo: "infantil", edadMeses: 7, edadTexto: "7 meses (4 semanas después)", maxMeses: 59 },
  { id: "flu-inf", vacunaId: "flu", dosis: "Anual", grupo: "infantil", edadMeses: 12, edadTexto: "Cada temporada hasta los 59 meses", maxMeses: 59, regla: "anual" },
  { id: "srp-1", vacunaId: "srp", dosis: "1.ª", grupo: "infantil", edadMeses: 12, edadTexto: "12 meses" },
  { id: "srp-2", vacunaId: "srp", dosis: "2.ª", grupo: "infantil", edadMeses: 18, edadTexto: "18 meses", verificar: "Desde 2021 la 2.ª dosis pasó de los 6 años a los 18 meses." },
  { id: "dpt-r", vacunaId: "dpt", dosis: "Refuerzo", grupo: "infantil", edadMeses: 48, edadTexto: "4 años", maxMeses: 83 },
  { id: "vph-1", vacunaId: "vph", dosis: "Única", grupo: "adolescente", edadMeses: 132, edadTexto: "5.º de primaria / 11 años", maxMeses: 239, verificar: "Número de dosis y aplicación a niños por verificar con el lineamiento vigente." },
  { id: "td-ado", vacunaId: "td", dosis: "Refuerzo", grupo: "adolescente", edadMeses: 180, edadTexto: "15 años y cada 10 años", regla: "cada10", verificar: "Edad del refuerzo adolescente por verificar." },
  { id: "flu-riesgo", vacunaId: "flu", dosis: "Anual", grupo: "adulto", edadMeses: 60, edadTexto: "5–59 años con factores de riesgo", maxMeses: 719, regla: "anual" },
  { id: "tdpa-emb", vacunaId: "tdpa", dosis: "1 por embarazo", grupo: "embarazo", edadMeses: 0, edadTexto: "A partir de la semana 20 de cada embarazo", regla: "embarazo", sexo: "F", verificar: "Ventana de aplicación por verificar (CeNSIA: desde la semana 20)." },
  { id: "flu-emb", vacunaId: "flu", dosis: "Temporada", grupo: "embarazo", edadMeses: 0, edadTexto: "Cualquier trimestre en temporada", regla: "embarazo", sexo: "F" },
  { id: "flu-am", vacunaId: "flu", dosis: "Anual", grupo: "adulto-mayor", edadMeses: 720, edadTexto: "60 años y más, cada temporada", regla: "anual" },
  { id: "neumo23-am", vacunaId: "neumo23", dosis: "Única", grupo: "adulto-mayor", edadMeses: 780, edadTexto: "65 años", verificar: "Dosis única a los 65 años; tipo de vacuna neumocócica en adultos por verificar." }
];
var dosisPorId = (id) => ESQUEMA.find((d) => d.id === id);
function sumarMeses(f, meses2) {
  const [y, m, d] = f.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + meses2, 1, 12));
  const ultimo = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).getUTCDate();
  t.setUTCDate(Math.min(d, ultimo));
  return t.toISOString().slice(0, 10);
}
function inicioTemporada(hoy) {
  const [y, m] = hoy.split("-").map(Number);
  return `${m >= 10 ? y : y - 1}-10-01`;
}

// src/modules/vacunacion/demo.ts
var LAB = { bcg: "BIRMEX", hb: "GSK", hexa: "Sanofi Pasteur", rota: "GSK", pcv: "Pfizer", flu: "Sanofi Pasteur", srp: "MSD", dpt: "BIRMEX", td: "BIRMEX", vph: "MSD" };
function reg2(pid, a, i) {
  const d = dosisPorId(a.dosisId);
  const v = vacunaPorId(a.vacunaId);
  return {
    id: `demo-vac-${pid}-${i}`,
    patientId: pid,
    tipo: "vacuna",
    estado: "aplicada",
    fecha: (/* @__PURE__ */ new Date(a.fecha + "T12:00:00")).toISOString(),
    titulo: `${a.nombre ?? v?.nombre ?? a.vacunaId}${d ? ` · ${d.dosis}` : ""}`,
    datos: { ...a }
  };
}
function infantiles(nac, hasta, prefLote, nombres = {}) {
  return ESQUEMA.filter((d) => d.grupo === "infantil" && (d.regla ?? "unica") === "unica").map((d, i) => {
    const fecha = sumarMeses(nac, d.edadMeses);
    const v = vacunaPorId(d.vacunaId);
    return { dosisId: d.id, vacunaId: d.vacunaId, fecha, lote: `${prefLote}${(1e3 + i * 37).toString(36).toUpperCase()}`, laboratorio: LAB[d.vacunaId], via: v.via, sitio: v.sitio, aplicador: "Enf. Laura Méndez", ...nombres[d.vacunaId] ? { nombre: nombres[d.vacunaId] } : {} };
  }).filter((a) => a.fecha <= hasta);
}
function demoVacunacion(now) {
  const hoy = new Date(now).toISOString().slice(0, 10);
  const tempPrev = `${Number(inicioTemporada(hoy).slice(0, 4)) - 1}-10-20`;
  const sofia = [
    ...infantiles("2021-06-20", hoy, "S"),
    { dosisId: "flu-inf", vacunaId: "flu", fecha: "2022-10-25", lote: "FLU22A", laboratorio: LAB.flu, via: "Intramuscular", sitio: "Deltoides izquierdo", aplicador: "Enf. Laura Méndez" },
    { dosisId: "flu-inf", vacunaId: "flu", fecha: "2023-10-18", lote: "FLU23B", laboratorio: LAB.flu, via: "Intramuscular", sitio: "Deltoides izquierdo", aplicador: "Enf. Laura Méndez" },
    { dosisId: "flu-inf", vacunaId: "flu", fecha: "2024-11-05", lote: "FLU24C", laboratorio: LAB.flu, via: "Intramuscular", sitio: "Deltoides izquierdo", aplicador: "Enf. Laura Méndez" }
  ];
  const miguel = [
    ...infantiles("2012-09-18", hoy, "M", { hexa: "Pentavalente acelular (DPaT+VIP+Hib)" }).map((a) => a.dosisId === "srp-2" ? { ...a, fecha: "2018-09-20" } : a),
    { dosisId: "otra", vacunaId: "flu", nombre: "Influenza estacional (grupo de riesgo: asma)", fecha: tempPrev, lote: "FLU-AS", laboratorio: LAB.flu, via: "Intramuscular", sitio: "Deltoides izquierdo", aplicador: "Enf. Laura Méndez" },
    { dosisId: "otra", vacunaId: "covid", nombre: "COVID-19 (campaña)", fecha: "2022-03-10", lote: "CV-221", laboratorio: "Pfizer-BioNTech", via: "Intramuscular", sitio: "Deltoides izquierdo", aplicador: "Brigada de vacunación" }
  ];
  return [...sofia.map((a, i) => reg2("p3", a, i)), ...miguel.map((a, i) => reg2("p8", a, i))];
}

// src/modules/vision/optotipos.ts
var LINEAS_LOGMAR = Array.from({ length: 14 }, (_, i) => r2(1 - i * 0.1));
function r2(x) {
  return Math.round(x * 100) / 100;
}
function logmarADecimal(logmar) {
  return Math.pow(10, -logmar);
}
function snellenDenominador(logmar, numerador = 20) {
  return numerador * Math.pow(10, logmar);
}
var DEN_20 = [10, 12.5, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400];
var DEN_6 = [3, 3.8, 4.8, 6, 7.5, 9.5, 12, 15, 19, 24, 30, 38, 48, 60, 75, 95, 120];
function cercano(arr, v) {
  return arr.reduce((a, b) => Math.abs(Math.log(b / v)) < Math.abs(Math.log(a / v)) ? b : a);
}
function snellen(logmar, numerador = 20) {
  const d = snellenDenominador(logmar, numerador);
  const arr = numerador === 20 ? DEN_20 : DEN_6;
  const c = cercano(arr, d);
  const den = Math.abs(Math.log10(c / d)) <= 0.011 ? c : numerador === 20 ? Math.round(d) : Math.round(d * 10) / 10;
  return `${numerador}/${fmtNum(den)}`;
}
function fmtNum(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

// src/modules/vision/demo.ts
var DAY3 = 864e5;
function r(ojo, correccion, logmar, lineas) {
  return { ojo, correccion, logmar, snellen20: snellen(logmar, 20), snellen6: snellen(logmar, 6), decimal: Math.round(logmarADecimal(logmar) * 100) / 100, lineas };
}
function demoVision(now) {
  const fecha = new Date(now - 10 * DAY3).toISOString();
  return [
    {
      id: "reg-av-p8-1",
      patientId: "p8",
      fecha,
      tipo: "agudeza-visual",
      estado: "completada",
      titulo: `Agudeza visual lejana: OD ${snellen(0.22)} · OI ${snellen(0)} · AO ${snellen(-0.02)}`,
      datos: {
        distanciaM: 3,
        optotipo: "sloan",
        pxPorMm: 3.78,
        calibrada: true,
        resultados: [
          r("OD", "sin", 0.22, { "0.4": 5, "0.3": 5, "0.2": 4 }),
          r("OD", "estenopeico", 0),
          r("OI", "sin", 0, { "0.2": 5, "0.1": 5, "0": 5 }),
          r("AO", "sin", -0.02, { "0.1": 5, "0": 5, "-0.1": 1 })
        ],
        notas: "Mejora con estenopeico en OD: probable error refractivo. Referir a optometría."
      }
    }
  ];
}
function demoVisionObs(now) {
  const fecha = new Date(now - 10 * DAY3).toISOString();
  return [
    { id: "obs-av-p8-od", patientId: "p8", fecha, codigo: "agudeza-od", valor: 0.22, unidad: "logMAR", etiqueta: "Agudeza visual OD sin corrección", fuente: "manual", interpretacion: `${snellen(0.22)} (${snellen(0.22, 6)}) · a 3 m` },
    { id: "obs-av-p8-oi", patientId: "p8", fecha, codigo: "agudeza-oi", valor: 0, unidad: "logMAR", etiqueta: "Agudeza visual OI sin corrección", fuente: "manual", interpretacion: "20/20 (6/6) · a 3 m" }
  ];
}

// src/lib/seed.ts
function rng(seed) {
  return () => {
    seed = seed * 16807 % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
var day = 864e5;
function seedDB() {
  const r3 = rng(42);
  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const patients = [
    { id: "p1", nombre: "María Fernanda", apellidos: "López Ramírez", sexo: "F", fechaNac: "1968-03-14", curp: "LORM680314MDFPMR09", telefono: "55 1234 5678", email: "maria.lopez@ejemplo.mx", tipoSangre: "O+", alergias: ["Penicilina"], antecedentes: "Diabetes mellitus tipo 2 (2015). Hipertensión arterial (2018). Madre con DM2.", medicamentosActuales: ["Metformina 850 mg c/12 h", "Losartán 50 mg c/24 h"], creado: iso(now - 400 * day) },
    { id: "p2", nombre: "José Luis", apellidos: "Hernández García", sexo: "M", fechaNac: "1955-11-02", curp: "HEGJ551102HJCRRS04", telefono: "33 9876 5432", tipoSangre: "A+", alergias: [], antecedentes: "Cardiopatía isquémica, stent en 2021. Exfumador.", medicamentosActuales: ["Ácido acetilsalicílico 100 mg", "Atorvastatina 40 mg", "Metoprolol 50 mg"], creado: iso(now - 380 * day) },
    { id: "p3", nombre: "Sofía", apellidos: "Martínez Cruz", sexo: "F", fechaNac: "2021-06-20", curp: "MACS210620MNLRRFA1", telefono: "81 5555 1212", tipoSangre: "B+", alergias: ["Huevo"], antecedentes: "Producto de término, sin complicaciones. Esquema de vacunación completo para la edad.", creado: iso(now - 300 * day) },
    { id: "p4", nombre: "Carlos Alberto", apellidos: "Sánchez Torres", sexo: "M", fechaNac: "1990-08-09", telefono: "55 4444 3333", tipoSangre: "O-", alergias: [], antecedentes: "Lesión de ligamento cruzado anterior derecho (2025), en rehabilitación.", creado: iso(now - 200 * day) },
    { id: "p5", nombre: "Ana Paula", apellidos: "Gómez Rivera", sexo: "F", fechaNac: "1995-01-27", telefono: "55 2222 1111", tipoSangre: "A-", alergias: ["Sulfas"], antecedentes: "G2 P1. Embarazo actual, FUM hace 22 semanas.", creado: iso(now - 150 * day) },
    { id: "p6", nombre: "Roberto", apellidos: "Díaz Mendoza", sexo: "M", fechaNac: "1978-04-30", telefono: "22 3333 7777", tipoSangre: "AB+", alergias: [], antecedentes: "Obesidad grado I. Dislipidemia.", medicamentosActuales: ["Bezafibrato 200 mg"], creado: iso(now - 120 * day) },
    { id: "p7", nombre: "Lucía", apellidos: "Vargas Ortiz", sexo: "F", fechaNac: "1983-12-05", telefono: "55 8888 9999", alergias: [], antecedentes: "Trastorno de ansiedad generalizada en tratamiento.", medicamentosActuales: ["Sertralina 50 mg"], creado: iso(now - 90 * day) },
    { id: "p8", nombre: "Miguel Ángel", apellidos: "Ruiz Castillo", sexo: "M", fechaNac: "2012-09-18", telefono: "44 1111 2222", tipoSangre: "O+", alergias: ["Ibuprofeno"], antecedentes: "Asma intermitente.", creado: iso(now - 60 * day) }
  ];
  const observations = [];
  let oid = 0;
  const obs = (patientId, t, codigo, valor, unidad, fuente = "manual", etiqueta) => observations.push({ id: "o" + oid++, patientId, fecha: iso(t), codigo, valor: Math.round(valor * 10) / 10, unidad, fuente, etiqueta });
  const adultos = [
    ["p1", { peso: 82, pas: 148, pad: 92, glu: 182, dPeso: -0.5, dPas: -1.6, dGlu: -5 }],
    ["p2", { peso: 76, pas: 132, pad: 84, glu: 104, dPeso: 0, dPas: -0.5, dGlu: 0 }],
    ["p4", { peso: 78, pas: 118, pad: 76, glu: 88, dPeso: 0.1, dPas: 0, dGlu: 0 }],
    ["p6", { peso: 104, pas: 138, pad: 88, glu: 112, dPeso: -1.1, dPas: -0.8, dGlu: -1 }],
    ["p7", { peso: 61, pas: 112, pad: 72, glu: 90, dPeso: 0.2, dPas: 0, dGlu: 0 }]
  ];
  for (const [pid2, b] of adultos) {
    for (let m = 11; m >= 0; m--) {
      const t = now - m * 30 * day - 3 * day;
      const k = 11 - m;
      obs(pid2, t, "peso", b.peso + b.dPeso * k + (r3() - 0.5), "kg");
      obs(pid2, t, "pas", b.pas + b.dPas * k + (r3() - 0.5) * 8, "mmHg");
      obs(pid2, t, "pad", b.pad + b.dPas * 0.5 * k + (r3() - 0.5) * 6, "mmHg");
      obs(pid2, t, "fc", 70 + (r3() - 0.5) * 14, "lpm");
      obs(pid2, t, "glucosa", b.glu + b.dGlu * k + (r3() - 0.5) * 12, "mg/dL");
      if (m % 3 === 0) {
        obs(pid2, t, "colesterol", 210 - k * 2 + (r3() - 0.5) * 20, "mg/dL", "ocr");
        obs(pid2, t, "trigliceridos", 190 - k * 3 + (r3() - 0.5) * 30, "mg/dL", "ocr");
        obs(pid2, t, "creatinina", 0.9 + (r3() - 0.5) * 0.2, "mg/dL", "ocr");
      }
    }
    obs(pid2, now - 2 * day, "talla", pid2 === "p7" ? 162 : pid2 === "p1" ? 158 : 174, "cm");
    obs(pid2, now - 2 * day, "spo2", 96 + r3() * 3, "%");
    obs(pid2, now - 2 * day, "temp", 36.4 + r3() * 0.5, "°C");
  }
  ;
  [8.9, 8.4, 7.9, 7.4].forEach((v, i) => obs("p1", now - (270 - i * 90) * day, "hba1c", v, "%", "ocr"));
  [16, 13, 10, 7].forEach((v, i) => obs("p7", now - (84 - i * 28) * day, "escala", v, "pts", "escala", "GAD-7"));
  const nacSofia = (/* @__PURE__ */ new Date("2021-06-20")).getTime();
  [[0, 3.2, 50, 34.5], [6, 7.6, 66, 42.5], [12, 9.4, 75, 45.5], [24, 12.1, 86.5, 47.8], [36, 14.2, 95, 49.2], [48, 16.1, 102.5, 50.1], [60, 18.2, 109.5, 50.6]].forEach(([mes, peso, talla, pc]) => {
    const t = nacSofia + mes * 30.44 * day;
    if (t > now) return;
    obs("p3", t, "peso", peso, "kg");
    obs("p3", t, "talla", talla, "cm");
    obs("p3", t, "perimetro-cefalico", pc, "cm");
  });
  obs("p8", now - 10 * day, "peso", 44, "kg");
  obs("p8", now - 10 * day, "talla", 156, "cm");
  obs("p8", now - 10 * day, "spo2", 97, "%");
  [85, 98, 110, 121, 128].forEach((v, i) => obs("p4", now - (60 - i * 14) * day, "rom", v, "°", "camara", "Flexión de rodilla derecha"));
  [58, 59.5, 61.2, 63].forEach((v, i) => obs("p5", now - (90 - i * 28) * day, "peso", v, "kg"));
  [108, 110, 112, 114].forEach((v, i) => obs("p5", now - (90 - i * 28) * day, "pas", v, "mmHg"));
  [70, 70, 72, 74].forEach((v, i) => obs("p5", now - (90 - i * 28) * day, "pad", v, "mmHg"));
  const appointments = [];
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() + 6) % 7);
  const tipos = ["subsecuente", "primera-vez", "subsecuente", "procedimiento", "telemedicina"];
  const motivos = ["Control de diabetes", "Dolor de rodilla", "Revisión de laboratorios", "Control prenatal", "Seguimiento", "Tos y fiebre", "Control de presión", "Ansiedad, seguimiento"];
  let aid = 0;
  for (let d = 0; d < 6; d++) {
    const slots = d === 5 ? [9, 10, 11] : [9, 10, 11.5, 13, 16, 17];
    for (const h of slots) {
      if (r3() < 0.25) continue;
      const start = new Date(monday.getTime() + d * day + h * 36e5);
      const p = patients[Math.floor(r3() * patients.length)];
      const past = start.getTime() < now;
      appointments.push({
        id: "a" + aid++,
        patientId: p.id,
        inicio: start.toISOString(),
        fin: new Date(start.getTime() + 45 * 6e4).toISOString(),
        tipo: tipos[Math.floor(r3() * tipos.length)],
        estado: past ? r3() < 0.9 ? "atendida" : "no-asistio" : r3() < 0.6 ? "confirmada" : "agendada",
        motivo: motivos[Math.floor(r3() * motivos.length)]
      });
    }
  }
  const encounters = [
    {
      id: "e1",
      patientId: "p1",
      fecha: iso(now - 33 * day),
      plantilla: "SOAP",
      motivo: "Control de diabetes e hipertensión",
      subjetivo: "Refiere buen apego a metformina. Niega poliuria, polidipsia. Ocasionalmente olvida losartán. Camina 20 min 3 veces por semana.",
      objetivo: "TA 138/86 mmHg, FC 74 lpm, peso 77.2 kg. Pies sin lesiones, sensibilidad conservada con monofilamento.",
      analisis: "DM2 con mejoría de control glucémico (HbA1c 7.9 → 7.4%). HAS en metas casi alcanzadas.",
      plan: "Continuar metformina 850 mg c/12 h. Reforzar apego a losartán. Laboratorios de control en 3 meses (HbA1c, perfil de lípidos, creatinina, EGO). Plan de alimentación.",
      diagnosticos: [{ codigo: "E11.9", nombre: "Diabetes mellitus tipo 2 sin complicaciones" }, { codigo: "I10", nombre: "Hipertensión esencial (primaria)" }],
      firmada: true,
      firmadaEn: iso(now - 33 * day),
      adendas: []
    },
    {
      id: "e2",
      patientId: "p4",
      fecha: iso(now - 14 * day),
      plantilla: "Evolución",
      motivo: "Rehabilitación de rodilla",
      subjetivo: "Dolor 3/10 al subir escaleras. Mejoría progresiva.",
      objetivo: "Flexión de rodilla derecha 121° medida con goniómetro virtual. Sin derrame.",
      analisis: "Evolución favorable post-lesión de LCA.",
      plan: "Continuar ejercicios de fortalecimiento de cuádriceps. Revaloración en 2 semanas.",
      diagnosticos: [{ codigo: "S83.5", nombre: "Esguince y torcedura de ligamento cruzado de la rodilla" }],
      firmada: true,
      firmadaEn: iso(now - 14 * day),
      adendas: []
    },
    {
      id: "e3",
      patientId: "p7",
      fecha: iso(now - 28 * day),
      plantilla: "Salud mental",
      motivo: "Seguimiento de ansiedad",
      subjetivo: "Duerme mejor. Menos episodios de preocupación excesiva.",
      objetivo: "GAD-7: 10 puntos (previo 13).",
      analisis: "TAG con respuesta parcial a sertralina.",
      plan: "Continuar sertralina 50 mg. Terapia cognitivo-conductual semanal. Cita en 4 semanas.",
      diagnosticos: [{ codigo: "F41.1", nombre: "Trastorno de ansiedad generalizada" }],
      firmada: true,
      firmadaEn: iso(now - 28 * day),
      adendas: []
    }
  ];
  const prescriptions = [
    {
      id: "rx1",
      patientId: "p1",
      fecha: iso(now - 33 * day),
      folio: "RX-000101",
      items: [
        { medicamento: "Metformina", presentacion: "Tabletas 850 mg", dosis: "1 tableta", via: "Oral", frecuencia: "Cada 12 horas", duracion: "90 días", indicaciones: "Con alimentos" },
        { medicamento: "Losartán", presentacion: "Tabletas 50 mg", dosis: "1 tableta", via: "Oral", frecuencia: "Cada 24 horas", duracion: "90 días" }
      ],
      indicaciones: "Dieta baja en azúcares simples. Caminar 30 minutos diarios."
    },
    {
      id: "rx2",
      patientId: "p2",
      fecha: iso(now - 20 * day),
      folio: "RX-000102",
      items: [
        { medicamento: "Ácido acetilsalicílico", presentacion: "Tabletas 100 mg", dosis: "1 tableta", via: "Oral", frecuencia: "Cada 24 horas", duracion: "90 días", indicaciones: "Después de la comida" },
        { medicamento: "Atorvastatina", presentacion: "Tabletas 40 mg", dosis: "1 tableta", via: "Oral", frecuencia: "Cada 24 horas", duracion: "90 días", indicaciones: "Por la noche" },
        { medicamento: "Metoprolol", presentacion: "Tabletas 50 mg", dosis: "1 tableta", via: "Oral", frecuencia: "Cada 12 horas", duracion: "90 días", indicaciones: "No suspender sin indicación médica" }
      ],
      indicaciones: "Acudir a urgencias si presenta dolor torácico."
    }
  ];
  const payments = [];
  const conceptos = [["Consulta subsecuente", 800], ["Consulta primera vez", 1e3], ["Procedimiento menor", 1800], ["Videoconsulta", 700]];
  let pid = 0;
  for (let i = 0; i < 70; i++) {
    const [c, m] = conceptos[Math.floor(r3() * conceptos.length)];
    const metodo = ["efectivo", "tarjeta", "transferencia"][Math.floor(r3() * 3)];
    payments.push({ id: "pay" + pid++, patientId: patients[Math.floor(r3() * patients.length)].id, fecha: iso(now - Math.floor(r3() * 90) * day), concepto: c, monto: m, metodo, facturado: r3() < 0.4 });
  }
  const registros = [
    ...demoPrenatal(now),
    ...demoVacunacion(now),
    ...demoDesarrollo(now),
    ...demoVision(now),
    ...demoAudiometria(now),
    ...demoTamizajes(now),
    ...demoTriaje(now),
    ...demoEnfermeria(now),
    ...demoNutricion(now),
    ...demoOrdenes(now),
    ...demoCertificados(now),
    ...demoInventario(now),
    ...demoTareas(now),
    ...demoEncuestas(now)
  ];
  observations.push(...demoEnfermeriaObs(now), ...demoVisionObs(now));
  return {
    version: 2,
    patients,
    appointments,
    encounters,
    observations,
    prescriptions,
    documents: [],
    payments,
    registros,
    settings: {
      doctor: {
        nombre: "Dra. Andrea Morales Peña",
        especialidad: "Medicina Familiar",
        cedula: "12345678",
        cedulaEspecialidad: "87654321",
        universidad: "Universidad Nacional Autónoma de México",
        direccion: "Av. Insurgentes Sur 1234, Consultorio 502, Col. Del Valle, CDMX",
        telefono: "55 5000 0000",
        email: "consultorio@ejemplo.mx",
        rfc: "MOPA800101AB1"
      },
      clinica: "Clínica Demo MediSuite",
      tema: "claro",
      servicios: {}
    }
  };
}

import type { DB } from './types.js'
/** Datos sintéticos de demostración (idénticos a los del modo demo del frontend). */
const __seedTipado: () => DB = seedDB as unknown as () => DB
export { __seedTipado as seedDB }
