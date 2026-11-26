/* Contexto de cada lectura: tendencia, zona saludable, navegador de variables y descarga. */
'use strict';

const VISTA = (() => {
  // Límites iguales a los de las alertas: fuera de ellos hay aviso.
  const ZONAS = { turbidez: [0, 50], ph: [6.5, 8.5], oxigeno: [7, 12], temperatura: [10, 30], tds: [0, 600], conductividad: [0, 1500] };
  const ESCENAS = [
    { id: 'turb', campo: 'turbidez', nombre: 'Turbidez', decimales: 1, unidad: ' NTU' },
    { id: 'ph', campo: 'ph', nombre: 'Acidez', decimales: 2, unidad: '' },
    { id: 'od', campo: 'oxigeno', nombre: 'Oxígeno', decimales: 2, unidad: ' mg/L' },
    { id: 'temp', campo: 'temperatura', nombre: 'Temperatura', decimales: 0, unidad: ' °C' },
    { id: 'nivel', campo: 'nivel', nombre: 'Nivel', decimales: 0, unidad: '' },
  ];
  const FACTOR_PICO = 5;

  // Tope de la escala cuando un pico aislado aplastaría el resto; null si no hace falta.
  function topeSinPicos(serie) {
    if (serie.length < 10) return null;
    const orden = [...serie].sort((a, b) => a - b);
    const p95 = orden[Math.floor((orden.length - 1) * .95)];
    return p95 > 0 && orden[orden.length - 1] > p95 * FACTOR_PICO ? Math.ceil(p95 * 1.4 / 10) * 10 : null;
  }

  // ---------- Minigráfica de cada escena ----------
  function crearTendencias() {
    ESCENAS.forEach(({ id }) => {
      const caja = document.createElement('figure');
      caja.className = 'tendencia';
      caja.innerHTML = '<svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1"/></svg><figcaption></figcaption>';
      document.querySelector(`#c-${id} .lectura`).append(caja);
    });
  }

  function describirCambio(serie, { decimales, unidad }) {
    if (serie.length < 2) return '';
    const [antes, ahora] = serie.slice(-2);
    const diferencia = ahora - antes;
    if (Math.abs(diferencia) < .5 / 10 ** decimales) return 'Igual que en la lectura anterior.';
    return `${diferencia > 0 ? 'Subió' : 'Bajó'} ${Math.abs(diferencia).toFixed(decimales)}${unidad} frente a la lectura anterior.`;
  }

  function pintarTendencia(escena, lecturas) {
    const esNivel = escena.campo === 'nivel';
    const serie = lecturas.map(l => esNivel ? Number(l.nivel === 'ALTO') : num(l[escena.campo]));
    const tope = esNivel ? null : topeSinPicos(serie);
    const maximo = tope ?? Math.max(...serie);
    const minimo = Math.min(...serie);
    const rango = maximo - minimo || 1;
    const puntos = serie.map((v, i) => {
      const x = serie.length > 1 ? (i / (serie.length - 1)) * 300 : 150;
      const y = 54 - ((Math.min(v, maximo) - minimo) / rango) * 48;
      return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });
    const figura = document.querySelector(`#c-${escena.id} .tendencia`);
    figura.querySelector('path').setAttribute('d', 'M' + puntos.join(' L'));
    const altas = serie.filter(Boolean).length;
    const resumen = esNivel
      ? `El agua estuvo alta en ${altas} de las últimas ${serie.length} lecturas.`
      : `${describirCambio(serie, escena)} Últimas ${serie.length} lecturas: entre ${minimo.toFixed(escena.decimales)} y ${Math.max(...serie).toFixed(escena.decimales)}${escena.unidad}.` +
        (tope ? ' La línea recorta un pico aislado.' : '');
    figura.querySelector('figcaption').textContent = resumen.trim();
  }

  // ---------- Navegador: semáforo de variables y atajo a cada escena ----------
  function crearNavegador() {
    const nav = document.createElement('nav');
    nav.className = 'navegador';
    nav.setAttribute('aria-label', 'Variables de la quebrada');
    nav.innerHTML = ESCENAS.map(e => `<a href="#c-${e.id}" data-id="${e.id}"><span>${e.nombre}</span></a>`).join('');
    document.body.append(nav);

    const visibles = new Set();
    const vigia = new IntersectionObserver(entradas => {
      entradas.forEach(e => visibles[e.isIntersecting ? 'add' : 'delete'](e.target.id));
      nav.classList.toggle('visible', visibles.size > 0);
      nav.querySelectorAll('a').forEach(a => {
        if (visibles.has('c-' + a.dataset.id)) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    ESCENAS.forEach(e => vigia.observe(document.getElementById('c-' + e.id)));
  }

  function pintarSemaforo() {
    document.querySelectorAll('.navegador a').forEach(a => {
      const escena = document.getElementById('c-' + a.dataset.id);
      const estado = escena.classList.contains('danger') ? 'danger' : escena.classList.contains('warn') ? 'warn' : '';
      a.className = estado;
      const texto = estado === 'danger' ? 'en peligro' : estado === 'warn' ? 'con precaución' : 'normal';
      a.setAttribute('aria-label', `${a.textContent}: ${texto}`);
    });
  }

  // ---------- Zona saludable dibujada detrás de la gráfica principal ----------
  const bandaSaludable = {
    id: 'bandaSaludable',
    beforeDatasetsDraw(chart) {
      const zona = ZONAS[sensorActual];
      const { ctx, chartArea: area, scales: { y } } = chart;
      if (!zona || !area) return;
      const arriba = Math.max(area.top, y.getPixelForValue(zona[1]));
      const abajo = Math.min(area.bottom, y.getPixelForValue(zona[0]));
      if (abajo <= arriba) return;
      ctx.save();
      ctx.fillStyle = 'rgba(143,227,168,.14)';
      ctx.fillRect(area.left, arriba, area.right - area.left, abajo - arriba);
      ctx.restore();
    },
  };

  // Ajusta el eje y explica qué quedó fuera de la vista.
  function ajustarEscala(chart, serie) {
    const casilla = document.getElementById('recortar');
    const tope = topeSinPicos(serie);
    casilla.closest('label').hidden = !tope;
    chart.options.scales.y.max = tope && casilla.checked ? tope : undefined;
    const zona = ZONAS[sensorActual];
    const unidad = UNIDADES[sensorActual] ? ' ' + UNIDADES[sensorActual] : '';
    const notas = zona ? [`Franja verde: de ${zona[0]} a ${zona[1]}${unidad}, sin aviso.`] : [];
    if (tope && casilla.checked) notas.push(`Hay un pico de ${Math.max(...serie)} ${UNIDADES[sensorActual]} que se sale de la vista.`);
    document.getElementById('nota-grafica').textContent = notas.join(' ');
  }

  // ---------- Descarga de las lecturas ----------
  function celdaCsv(valor) {
    let texto = String(valor ?? '');
    // Evita que una hoja de cálculo ejecute como fórmula un texto que venga de los datos.
    if (/^[=+\-@\t\r]/.test(texto) && !Number.isFinite(Number(texto))) texto = "'" + texto;
    return `"${texto.replace(/"/g, '""')}"`;
  }

  function descargarCsv() {
    const campos = ['tds', 'turbidez', 'ph', 'temperatura', 'conductividad', 'oxigeno', 'humedad', 'nivel'];
    const filas = [['fecha', 'hora', ...campos], ...historial.lecturas.map(l => [fmtFecha(l.fecha), fmtHora(l.hora), ...campos.map(c => l[c])])];
    const contenido = '﻿' + filas.map(f => f.map(celdaCsv).join(',')).join('\r\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    enlace.download = 'lecturas-quebrada-miraflores.csv';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  function iniciar() {
    crearTendencias();
    crearNavegador();
    document.getElementById('recortar').addEventListener('change', () => pintarGrafica());
    document.getElementById('descargar').addEventListener('click', descargarCsv);
    document.addEventListener('lectura', pintarSemaforo);
    document.addEventListener('historial', () => {
      ESCENAS.forEach(e => pintarTendencia(e, historial.lecturas));
      document.getElementById('descargar').hidden = false;
    });
  }

  return { iniciar, bandaSaludable, ajustarEscala };
})();

VISTA.iniciar();
