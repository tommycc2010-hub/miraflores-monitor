/* Todas las variables en una sola gráfica, sobre una base común: % de la escala de cada una. */
'use strict';

(() => {
  // El orden y el color son fijos: ocultar una variable no repinta las demás.
  // "tope" es el valor que corresponde al 100 % en la gráfica.
  const SERIES = [
    { campo: 'turbidez', nombre: 'Turbidez', unidad: 'NTU', tope: 200, color: '#3987e5', punto: 'circle' },
    { campo: 'ph', nombre: 'pH', unidad: '', tope: 14, color: '#d95926', punto: 'rect' },
    { campo: 'oxigeno', nombre: 'Oxígeno', unidad: 'mg/L', tope: 12, color: '#199e70', punto: 'triangle' },
    { campo: 'temperatura', nombre: 'Temperatura', unidad: '°C', tope: 40, color: '#c98500', punto: 'rectRot' },
    { campo: 'nivel', nombre: 'Nivel', unidad: '', tope: 1, color: '#d55181', punto: 'rectRounded', escalon: true },
    { campo: 'tds', nombre: 'TDS', unidad: 'ppm', tope: 900, color: '#0ca30c', punto: 'star' },
    { campo: 'conductividad', nombre: 'Conductividad', unidad: 'µS/cm', tope: 1500, color: '#9085e9', punto: 'crossRot' },
    { campo: 'humedad', nombre: 'Humedad', unidad: '%', tope: 100, color: '#e66767', punto: 'cross' },
  ];
  const POSICION_NIVEL = { ALTO: 75, BAJO: 25 };

  const ocultas = new Set();
  let chart = null;
  let visible = false;

  const porcentaje = (serie, lectura) => serie.escalon
    ? POSICION_NIVEL[lectura.nivel] ?? null
    : Math.min(100, (num(lectura[serie.campo]) / serie.tope) * 100);

  const valorReal = (serie, lectura) => serie.escalon
    ? String(lectura.nivel || '--')
    : `${num(lectura[serie.campo])} ${serie.unidad}`.trim();

  // Línea vertical que marca la lectura señalada.
  const guia = {
    id: 'guia',
    afterDatasetsDraw({ ctx, chartArea, tooltip }) {
      const activo = tooltip?.getActiveElements?.()[0];
      if (!activo) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(238,246,238,.4)';
      ctx.beginPath();
      ctx.moveTo(activo.element.x, chartArea.top);
      ctx.lineTo(activo.element.x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  const conjuntos = lecturas => SERIES.map((s, i) => ({
    label: s.nombre,
    data: lecturas.map(l => porcentaje(s, l)),
    borderColor: s.color,
    backgroundColor: s.color,
    borderWidth: 2,
    pointStyle: s.punto,
    pointRadius: ctx => ctx.dataIndex % 7 === i % 7 ? 4 : 0, // marcas alternadas para no depender solo del color
    pointHoverRadius: 6,
    stepped: Boolean(s.escalon),
    tension: s.escalon ? 0 : .25,
    hidden: ocultas.has(s.campo),
  }));

  function crear() {
    if (!window.Chart || chart || !visible || !historial.lecturas.length) return;
    chart = new Chart(document.getElementById('grafica-todas'), {
      type: 'line',
      plugins: [guia],
      data: { labels: historial.etiquetas, datasets: conjuntos(historial.lecturas) },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 1100 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            usePointStyle: true,
            callbacks: { label: c => ` ${SERIES[c.datasetIndex].nombre}: ${valorReal(SERIES[c.datasetIndex], historial.lecturas[c.dataIndex])}` },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#a9c9c2', maxTicksLimit: 7 } },
          y: { min: 0, max: 104, grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#a9c9c2', stepSize: 25, callback: v => v <= 100 ? v + ' %' : '' } },
        },
      },
    });
  }

  function pintar() {
    pintarLeyenda();
    if (!chart) { crear(); return; }
    chart.data.labels = historial.etiquetas;
    chart.data.datasets = conjuntos(historial.lecturas);
    chart.update();
  }

  // La leyenda muestra el último valor real y sirve para ocultar o mostrar cada variable.
  function pintarLeyenda() {
    const ultima = historial.lecturas[historial.lecturas.length - 1];
    if (!ultima) return;
    SERIES.forEach(s => {
      const boton = document.querySelector(`#leyenda-todas [data-campo="${s.campo}"]`);
      boton.querySelector('b').textContent = valorReal(s, ultima);
      boton.querySelector('small').textContent = s.escalon ? 'bajo 25 %, alto 75 %' : `100 % = ${s.tope} ${s.unidad}`.trim();
    });
  }

  function iniciar() {
    const leyenda = document.getElementById('leyenda-todas');
    leyenda.replaceChildren(...SERIES.map(s => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.dataset.campo = s.campo;
      boton.setAttribute('aria-pressed', 'true');
      boton.style.setProperty('--serie', s.color);
      boton.innerHTML = `<span>${s.nombre}</span><b>--</b><small></small>`;
      boton.addEventListener('click', () => {
        const mostrar = ocultas.has(s.campo);
        ocultas[mostrar ? 'delete' : 'add'](s.campo);
        boton.setAttribute('aria-pressed', String(mostrar));
        pintar();
      });
      return boton;
    }));

    document.addEventListener('historial', pintar);
    const vigia = new IntersectionObserver(entradas => {
      if (!entradas.some(e => e.isIntersecting)) return;
      visible = true;
      vigia.disconnect();
      crear();
    }, { rootMargin: '0px 0px -20% 0px' });
    vigia.observe(document.getElementById('grafica-todas').parentElement);
  }

  iniciar();
})();
