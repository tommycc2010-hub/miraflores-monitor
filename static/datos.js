/* Lectura de la hoja de datos y llenado del contenido. Las animaciones viven en animaciones.js. */
'use strict';

const API = 'https://script.google.com/macros/s/AKfycbwTrhFETmZhlzBCHZmjIb2B1ik6EJE8176H68b0uzzq-WMYGlEVbDSN33dNkgPMCCrf3w/exec';
const RESERVA = [6.1141364, -75.6205823]; // Reserva ecológica Miraflores (497H+MQ)
const ZONA = 'America/Bogota';
const HORAS_VIGENCIA = 24;
const REFRESCO_MS = 10000;

const NOMBRES = { turbidez: 'turbidez', ph: 'pH', oxigeno: 'oxígeno disuelto', temperatura: 'temperatura', tds: 'TDS', conductividad: 'conductividad' };
const UNIDADES = { turbidez: 'NTU', ph: '', oxigeno: 'mg/L', temperatura: '°C', tds: 'ppm', conductividad: 'µS/cm' };

// Escapa texto que viene de la hoja antes de insertarlo como HTML.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

// Sheets envía las celdas de solo-hora como fechas de 1899 en UTC y las
// fechas como medianoche local en UTC; se muestran en hora de Colombia.
const aFecha = v => { const d = new Date(v); return isNaN(d) ? null : d; };
const fmtHora = v => {
  const d = aFecha(v);
  return d ? d.toLocaleTimeString('es-CO', { timeZone: ZONA, hour12: false }) : String(v ?? '--');
};
const fmtFecha = v => {
  const d = aFecha(v);
  return d ? d.toLocaleDateString('es-CO', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }) : String(v ?? '--');
};
const fmtDiaHora = l => `${fmtFecha(l.fecha).slice(0, 5)} ${fmtHora(l.hora)}`;

// El Apps Script devuelve el mismo día repetido; se conserva una fila por fecha.
const unicosPorFecha = filas => [...new Map(filas.map(p => [fmtFecha(p.fecha), p])).values()];

const num = v => parseFloat(v) || 0;

const clsTDS = v => v < 300 ? ['Excelente', ''] : v < 600 ? ['Buena', ''] : v < 900 ? ['Regular', 'warn'] : ['Contaminada', 'danger'];
const clsTurb = v => v < 5 ? ['Clara', ''] : v < 50 ? ['Levemente turbia', 'warn'] : v < 200 ? ['Turbia', 'warn'] : ['Muy turbia', 'danger'];
const clsPH = v => v < 6.5 ? ['Ácido', 'danger'] : v <= 8.5 ? ['Neutro', ''] : ['Básico', 'warn'];
const clsNivel = v => v === 'ALTO' ? ['Alto', ''] : ['Bajo', 'warn'];
const clsTemp = v => v < 10 ? ['Fría', 'warn'] : v <= 25 ? ['Normal', ''] : ['Cálida', 'warn'];
const clsHum = v => v < 40 ? ['Baja', 'warn'] : v <= 80 ? ['Normal', ''] : ['Alta', 'warn'];
const clsEC = v => v < 200 ? ['Muy pura', ''] : v < 800 ? ['Saludable', ''] : v < 1500 ? ['Mineral', 'warn'] : ['Alta', 'danger'];
const clsOD = v => v < 5 ? ['Crítico', 'danger'] : v < 7 ? ['Bajo', 'warn'] : v <= 12 ? ['Normal', ''] : ['Alto', ''];
const clsCal = v => v === 'Buena' ? 'b-ok' : v === 'Regular' ? 'b-warn' : 'b-danger';

let sensorActual = 'turbidez';
let grafica = null;
let historial = { lecturas: [], etiquetas: [] };
let huellaTablas = '';
let hayDatos = false;

const $ = id => document.getElementById(id);

// Guarda el valor como dato; animaciones.js decide cómo contarlo en pantalla.
function ponerMedida(id, valor, decimales, [etiqueta, estado]) {
  const el = $('v-' + id);
  if (typeof valor === 'number') {
    el.dataset.valor = valor;
    el.dataset.decimales = decimales;
  } else {
    el.textContent = valor;
  }
  $('b-' + id).textContent = etiqueta;
  const caja = $('c-' + id);
  caja.classList.remove('warn', 'danger');
  if (estado) caja.classList.add(estado);
}

const REGLAS_ALERTA = [
  [d => d.tds > 900, d => ['danger', 'Peligro: TDS muy alto', `TDS: ${d.tds} ppm. Alta concentración de sólidos disueltos. Posible contaminación química o industrial.`]],
  [d => d.tds > 600 && d.tds <= 900, d => ['warn', 'Precaución: TDS elevado', `TDS: ${d.tds} ppm. Nivel regular. Se recomienda monitoreo continuo.`]],
  [d => d.turbidez > 200, d => ['danger', 'Peligro: turbidez crítica', `Turbidez: ${d.turbidez} NTU. Posible vertimiento, erosión severa o evento de contaminación.`]],
  [d => d.turbidez > 50 && d.turbidez <= 200, d => ['warn', 'Precaución: turbidez elevada', `Turbidez: ${d.turbidez} NTU. Agua moderadamente turbia. Puede deberse a lluvias o sedimentos.`]],
  [d => d.ph < 6.5, d => ['danger', 'Peligro: pH ácido', `pH: ${d.ph}. El agua está acidificada y puede ser letal para organismos acuáticos.`]],
  [d => d.ph > 8.5, d => ['warn', 'Precaución: pH básico', `pH: ${d.ph}. Fuera del rango óptimo para la vida acuática.`]],
  [d => d.oxigeno < 5, d => ['danger', 'Peligro: oxígeno crítico', `OD: ${d.oxigeno} mg/L. Insuficiente para sostener vida acuática.`]],
  [d => d.oxigeno >= 5 && d.oxigeno < 7, d => ['warn', 'Precaución: oxígeno bajo', `OD: ${d.oxigeno} mg/L. Por debajo del óptimo.`]],
  [d => d.conductividad > 1500, d => ['danger', 'Peligro: conductividad muy alta', `EC: ${d.conductividad} µS/cm. Posible contaminación industrial o agrícola.`]],
  [d => d.temperatura > 30, d => ['warn', 'Precaución: temperatura alta', `Temperatura: ${d.temperatura} °C. El calor reduce el oxígeno disuelto.`]],
];

function pintarAlertas(act) {
  const alertas = REGLAS_ALERTA.filter(([aplica]) => aplica(act)).map(([, crear]) => crear(act));
  const peor = alertas.find(a => a[0] === 'danger') || alertas[0];
  $('estado-titulo').textContent = peor ? peor[1] : 'La quebrada está en calma';
  $('estado-general').className = 'estado-general' + (peor ? ' ' + peor[0] : '');
  const filas = alertas.length ? alertas : [['ok', 'Todo en rangos saludables', 'La calidad del agua está dentro de lo esperado para la vida acuática.']];
  const html = filas.map(([tipo, titulo, desc]) =>
    `<li class="alerta alerta-${tipo}"><strong>${esc(titulo)}</strong><span>${esc(desc)}</span></li>`).join('');
  const lista = $('alertas');
  if (lista.dataset.html !== html) {
    lista.dataset.html = html;
    lista.innerHTML = html;
  }
}

// La fecha viene de la columna "fecha" y la hora de "hora"; se combinan en hora de Colombia.
function pintarUltimaLectura(act) {
  const el = $('ultima-lectura');
  if (!act.fecha) { el.textContent = 'Última lectura: sin fecha'; return; }
  const [dia, mes, anio] = fmtFecha(act.fecha).split('/');
  const momento = new Date(`${anio}-${mes}-${dia}T${fmtHora(act.hora)}-05:00`);
  const antigua = Date.now() - momento.getTime() > HORAS_VIGENCIA * 3600 * 1000;
  el.textContent = `Última lectura: ${dia}/${mes}/${anio}, ${fmtHora(act.hora)}` +
    (antigua ? '. Dato antiguo, no es el estado actual.' : '');
  el.classList.toggle('antigua', antigua);
}

function pintarActual(act) {
  ponerMedida('turb', num(act.turbidez), 1, clsTurb(num(act.turbidez)));
  ponerMedida('ph', num(act.ph), 2, clsPH(num(act.ph)));
  ponerMedida('od', num(act.oxigeno), 2, clsOD(num(act.oxigeno)));
  ponerMedida('temp', num(act.temperatura), 0, clsTemp(num(act.temperatura)));
  ponerMedida('nivel', act.nivel || '--', 0, clsNivel(act.nivel));
  ponerMedida('tds', num(act.tds), 1, clsTDS(num(act.tds)));
  ponerMedida('ec', num(act.conductividad), 1, clsEC(num(act.conductividad)));
  ponerMedida('hum', num(act.humedad), 0, clsHum(num(act.humedad)));
  pintarAlertas(act);
  pintarUltimaLectura(act);
  document.dispatchEvent(new CustomEvent('lectura', { detail: act }));
}

function pintarTablaLecturas(lecturas) {
  $('total-lect').textContent = lecturas.length + ' registros';
  $('tabla-lect').innerHTML = [...lecturas].reverse().slice(0, 30).map(f => `
    <tr>
      <td>${esc(fmtDiaHora(f))}</td>
      <td>${num(f.tds).toFixed(1)}</td>
      <td>${num(f.turbidez).toFixed(1)}</td>
      <td>${num(f.ph).toFixed(2)}</td>
      <td>${esc(f.temperatura || '--')} °C</td>
      <td>${num(f.conductividad).toFixed(1)}</td>
      <td>${num(f.oxigeno).toFixed(2)}</td>
      <td>${esc(f.nivel || '--')}</td>
    </tr>`).join('');
}

function pintarTablaDiaria(promedios) {
  $('tabla-diario').innerHTML = unicosPorFecha(promedios).reverse().map(p => `
    <tr>
      <td>${esc(fmtFecha(p.fecha))}</td>
      <td>${num(p.tds).toFixed(1)}</td>
      <td>${num(p.turbidez).toFixed(1)}</td>
      <td>${num(p.ph).toFixed(2)}</td>
      <td>${esc(p.registros)}</td>
      <td><span class="badge ${clsCal(p.calidad)}">${esc(p.calidad)}</span></td>
    </tr>`).join('');
}

const serieActual = () => historial.lecturas.map(l => num(l[sensorActual]));

function pintarGrafica() {
  const serie = serieActual();
  if (grafica) {
    VISTA.ajustarEscala(grafica, serie);
    grafica.data.labels = historial.etiquetas;
    grafica.data.datasets[0].data = serie;
    grafica.update();
  }
  $('s-count').textContent = serie.length;
  if (!serie.length) return;
  const resumen = { avg: serie.reduce((a, b) => a + b, 0) / serie.length, max: Math.max(...serie), min: Math.min(...serie) };
  Object.entries(resumen).forEach(([clave, valor]) => {
    $('s-' + clave).textContent = valor.toFixed(1);
    $(`s-${clave}-u`).textContent = UNIDADES[sensorActual];
  });
}

// Se llama cuando la sección entra en pantalla para que la línea se dibuje a la vista.
function crearGrafica(sinMovimiento) {
  if (!window.Chart || grafica) return;
  const puntos = () => historial.etiquetas.length || 1;
  grafica = new Chart($('grafica').getContext('2d'), {
    type: 'line',
    plugins: [VISTA.bandaSaludable],
    data: { labels: [], datasets: [{ data: [], borderColor: '#ffc65c', backgroundColor: 'rgba(255,198,92,.14)', borderWidth: 2.5, tension: .35, pointRadius: 2, fill: true }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: sinMovimiento ? false : {
        duration: 900,
        delay: ctx => ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * (900 / puntos()) : 0,
      },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#a9c9c2', maxTicksLimit: 7 } },
        y: { grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#a9c9c2' } },
      },
    },
  });
  pintarGrafica();
}

function cambiarSensor(boton) {
  sensorActual = boton.dataset.sensor;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-pressed', String(t === boton)));
  $('titulo-historial').textContent = 'Historial de ' + NOMBRES[sensorActual];
  pintarGrafica();
}

async function actualizar() {
  const conexion = $('estado');
  try {
    const respuesta = await fetch(API);
    if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
    const d = await respuesta.json();
    if (d.actual && d.actual.tds !== undefined) {
      hayDatos = true;
      pintarActual(d.actual);
    }
    // Solo se repinta si cambió algo, para no mover las tablas mientras alguien las lee.
    const huella = JSON.stringify([d.lecturas, d.promedios]);
    if (huella !== huellaTablas) {
      huellaTablas = huella;
      if (d.lecturas?.length) {
        historial = { lecturas: d.lecturas, etiquetas: d.lecturas.map(fmtDiaHora) };
        pintarGrafica();
        pintarTablaLecturas(d.lecturas);
        document.dispatchEvent(new CustomEvent('historial'));
      }
      if (d.promedios?.length) pintarTablaDiaria(d.promedios);
    }
    conexion.textContent = 'Conectado a la hoja de datos';
    conexion.classList.remove('sin-conexion');
  } catch (error) {
    console.warn('No se pudo leer la hoja de datos:', error);
    conexion.textContent = 'Sin conexión';
    conexion.classList.add('sin-conexion');
    if (!hayDatos) {
      $('estado-titulo').textContent = 'No pudimos leer la quebrada';
      $('ultima-lectura').textContent = `Revisa tu conexión a internet. Volvemos a intentar cada ${REFRESCO_MS / 1000} segundos.`;
    }
  }
}

document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => cambiarSensor(b)));
// La primera consulta espera a que extras.js y animaciones.js estén escuchando.
document.addEventListener('DOMContentLoaded', actualizar);
setInterval(actualizar, REFRESCO_MS);
