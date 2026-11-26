/* Animaciones ligadas al desplazamiento. Sin GSAP o con "reducir movimiento", todo se ve fijo y completo. */
'use strict';

(() => {
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animar = !quieto && Boolean(window.gsap && window.ScrollTrigger);
  const todos = sel => [...document.querySelectorAll(sel)];
  const limitar = v => Math.min(1, Math.max(0, v));

  // ---------- Instrumentos: cada uno traduce una lectura a una variable CSS ----------
  const fijar = (id, nombre, valor) => document.getElementById(id).style.setProperty(nombre, valor);

  function sembrar(contenedor, cantidad, clase) {
    const caja = document.getElementById(contenedor);
    if (caja.childElementCount === cantidad) return;
    caja.replaceChildren(...Array.from({ length: cantidad }, (_, i) => {
      const p = document.createElement('i');
      p.className = clase;
      // Distribución estable (sin azar) para que no salte en cada refresco.
      p.style.setProperty('--x', ((i * 37) % 91 + 4) + '%');
      p.style.setProperty('--y', ((i * 53) % 83 + 6) + '%');
      p.style.setProperty('--t', (3 + (i % 5) * .7) + 's');
      p.style.setProperty('--d', (-(i % 9) * .6) + 's');
      p.style.setProperty('--s', (5 + (i % 4) * 3) + 'px');
      return p;
    }));
  }

  document.addEventListener('lectura', ({ detail: d }) => {
    const turbidez = Number(d.turbidez) || 0;
    // Escala logarítmica: 0 NTU es agua limpia y 1000 NTU o más es totalmente opaca.
    const turbio = limitar(Math.log10(turbidez + 1) / 3);
    fijar('c-turb', '--turbio', turbio.toFixed(3));
    sembrar('particulas', Math.round(6 + turbio * 40), 'grano');
    fijar('c-ph', '--pos', limitar((Number(d.ph) || 0) / 14).toFixed(3));
    sembrar('burbujas', Math.round(limitar((Number(d.oxigeno) || 0) / 12) * 26), 'burbuja');
    fijar('c-temp', '--calor', limitar((Number(d.temperatura) || 0) / 40).toFixed(3));
    fijar('c-nivel', '--altura', d.nivel === 'ALTO' ? '.78' : '.28');
    todos('[data-valor]').forEach(el => { if (el.dataset.visto) contar(el); });
  });

  // ---------- Números que cuentan al aparecer o al cambiar ----------
  function contar(el) {
    const meta = Number(el.dataset.valor);
    if (!Number.isFinite(meta)) return;
    const decimales = Number(el.dataset.decimales) || 0;
    if (el.dataset.mostrado === String(meta)) return;
    el.dataset.mostrado = String(meta);
    if (!animar) { el.textContent = meta.toFixed(decimales); return; }
    const estado = { v: 0 };
    gsap.to(estado, { v: meta, duration: 1.4, ease: 'power3.out', onUpdate: () => { el.textContent = estado.v.toFixed(decimales); } });
  }

  const alVer = (el, accion, margen = '0px 0px -18% 0px') => {
    const vigia = new IntersectionObserver(entradas => {
      if (entradas.some(e => e.isIntersecting)) { vigia.disconnect(); accion(); }
    }, { rootMargin: margen });
    vigia.observe(el);
  };

  todos('.escena, .gota').forEach(seccion => alVer(seccion, () => {
    seccion.classList.add('activa');
    seccion.querySelectorAll('[id^="v-"]').forEach(el => { el.dataset.visto = '1'; contar(el); });
  }));

  // ---------- Mapa: vuela hasta la reserva cuando entra en pantalla ----------
  function iniciarMapa() {
    const caja = document.getElementById('mapa');
    if (!window.L) { caja.textContent = 'No se pudo cargar el mapa.'; return; }
    const mapa = L.map(caja, { scrollWheelZoom: false }).setView(RESERVA, animar ? 11 : 16);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    L.circleMarker(RESERVA, { radius: 10, color: '#fff', weight: 3, fillColor: '#d9482b', fillOpacity: 1 })
      .addTo(mapa).bindTooltip('Reserva ecológica Miraflores', { permanent: true, direction: 'top', offset: [0, -10] });
    if (animar) alVer(caja, () => mapa.flyTo(RESERVA, 16, { duration: 3.2 }), '0px 0px -35% 0px');
  }
  iniciarMapa();
  alVer(document.getElementById('grafica'), () => crearGrafica(quieto));

  if (!animar) return;

  // ---------- Coreografía con GSAP ----------
  gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.add('con-movimiento');
  const recorrido = (trigger, extra = {}) => ({ trigger, start: 'top bottom', end: 'bottom top', scrub: .6, ...extra });
  const aparecer = (el, desde, inicio = 'top 82%') => gsap.from(el, {
    autoAlpha: 0, duration: .9, ease: 'power3.out', ...desde,
    scrollTrigger: { trigger: el, start: inicio, toggleActions: 'play none none reverse' },
  });

  // Portada: entrada y profundidad al bajar.
  gsap.from('.portada-texto > *', { y: 44, autoAlpha: 0, duration: 1, stagger: .14, ease: 'power3.out' });
  const salidaPortada = { trigger: '.portada', start: 'top top', end: 'bottom top', scrub: .5 };
  gsap.to('.portada-fondo', { yPercent: 18, scale: 1.18, ease: 'none', scrollTrigger: salidaPortada });
  gsap.to('.portada-texto', { yPercent: -28, opacity: 0, ease: 'none', scrollTrigger: salidaPortada });

  // El río lateral se llena a medida que se avanza por la página.
  gsap.fromTo('.caudal span', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: .3 } });

  // Frase de entrada: las palabras se encienden una a una.
  const frase = document.querySelector('.frase p');
  frase.replaceChildren(...frase.textContent.trim().split(/\s+/).flatMap(palabra => {
    const s = document.createElement('span');
    s.textContent = palabra;
    return [s, ' '];
  }));
  gsap.fromTo('.frase span', { opacity: .14 }, {
    opacity: 1, stagger: .1, ease: 'none',
    scrollTrigger: { trigger: '.frase', start: 'top 75%', end: 'center 40%', scrub: .4 },
  });

  // Cada escena: texto e instrumento llegan desde lados opuestos; el nombre gigante se desliza.
  const ancho = window.matchMedia('(min-width: 800px)').matches;
  todos('.escena').forEach((escena, i) => {
    const lado = ancho ? (i % 2 ? -1 : 1) : 0;
    aparecer(escena.querySelector('.lectura'), { x: -70 * lado, y: 50 }, 'top 68%');
    aparecer(escena.querySelector('.instrumento'), { x: 90 * lado, y: 60, scale: .8, rotation: 4 * lado }, 'top 72%');
    gsap.fromTo(escena.querySelector('.marca-agua'), { xPercent: i % 2 ? -22 : 12 },
      { xPercent: i % 2 ? 12 : -22, ease: 'none', scrollTrigger: recorrido(escena) });
    gsap.fromTo(escena.querySelector('.instrumento-flota'), { y: 40 },
      { y: -40, ease: 'none', scrollTrigger: recorrido(escena) });
  });

  todos('.titulo-seccion').forEach(el => aparecer(el, { y: 60 }));
  todos('.gota').forEach((el, i) => aparecer(el, { x: i % 2 ? 90 : -90 }, 'top 88%'));
  aparecer(document.getElementById('alertas'), { y: 70 });
  aparecer(document.querySelector('.grafica-panel'), { x: ancho ? -80 : 0, y: 50 });
  aparecer(document.querySelector('.mapa-panel'), { x: ancho ? 80 : 0, y: 50, scale: .92 });
  todos('.dato').forEach((el, i) => aparecer(el, { y: 40, delay: i * .08 }, 'top 92%'));
  todos('.tabla').forEach(el => aparecer(el, { y: 80 }));
  gsap.from('.pie > *', { y: 40, autoAlpha: 0, stagger: .15, scrollTrigger: { trigger: '.pie', start: 'top 95%' } });

  // Leaflet y las fuentes cambian alturas después de cargar.
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
