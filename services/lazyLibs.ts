/**
 * Carga diferida de librerías pesadas de exportación.
 * xlsx (~430 KB) y jspdf (~350 KB) solo se descargan cuando el
 * usuario exporta o importa un archivo, no al abrir la app.
 */

export const loadXLSX = async () => await import('xlsx');

export const loadPdf = async () => {
    const [jspdfMod, autoTableMod] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
    ]);
    return { jsPDF: jspdfMod.jsPDF, autoTable: autoTableMod.default };
};
