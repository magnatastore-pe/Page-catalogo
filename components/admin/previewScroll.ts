/**
 * Lleva la vista previa del panel a una página concreta del catálogo.
 *
 * Estaba escrito dos veces, igual, en AdminEditor y en el asistente de
 * creación; vive acá para que los dos caminos se comporten idéntico
 * (incluidas las dos sutilezas de abajo, que costaron sendos bugs).
 */
export function scrollPreviewToPage(index: number) {
  requestAnimationFrame(() => {
    // El catálogo vive dentro del iframe de PreviewFrame — en OTRO
    // documento — tanto en la vista móvil como en la de escritorio, así
    // que buscar `.page` en `document` no encuentra nada.
    const frame = document.querySelector<HTMLIFrameElement>("iframe.admin-preview-frame");
    const page = frame?.contentDocument?.querySelectorAll<HTMLElement>(".page")[index];
    if (!page || !frame?.contentWindow) return;

    // Se scrollea la ventana DEL IFRAME a mano en vez de usar
    // `page.scrollIntoView()`: ese método scrollea todos los
    // contenedores scrolleables hacia arriba en el árbol, y eso
    // atraviesa el borde del iframe — corría también la "pantalla" del
    // dispositivo en el documento padre, justo lo que mide la barra de
    // navegador simulada, que desaparecía al tocar cualquier página
    // (bug real reportado). `offsetTop` alcanza porque cada `.page` es
    // hija directa del <main> del catálogo.
    frame.contentWindow.scrollTo({ top: page.offsetTop, behavior: "smooth" });

    // Respuesta visible al clic aunque no haya nada que scrollear: sin
    // esto, pedir "ver" una página en la que la vista previa ya estaba
    // no producía ningún cambio y el botón parecía roto.
    page.classList.remove("page-focus-flash");
    // Forzar un reflow reinicia la animación si se toca dos veces
    // seguidas; sin esto la segunda vez no se ve nada.
    void page.offsetWidth;
    page.classList.add("page-focus-flash");
    setTimeout(() => page.classList.remove("page-focus-flash"), 1200);
  });
}
