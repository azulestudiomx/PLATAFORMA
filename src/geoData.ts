/**
 * Carga diferida del GeoJSON de secciones electorales (~2.3 MB).
 * Antes venía en el bundle principal; ahora es un chunk aparte que
 * solo se descarga cuando una página con mapa seccional lo necesita.
 */

let geoCache: any = null;
let centroidsCache: Map<number, [number, number]> | null = null;

export const loadCampecheGeo = async (): Promise<any> => {
    if (!geoCache) {
        geoCache = (await import('./campeche_secciones_wgs84.json')).default;
    }
    return geoCache;
};

const getCentroid = (feature: any): [number, number] | null => {
    if (!feature || !feature.geometry) return null;
    const { type, coordinates } = feature.geometry;
    let latSum = 0;
    let lngSum = 0;
    let count = 0;

    const processPolygon = (polygonCoords: any) => {
        polygonCoords.forEach((ring: any) => {
            ring.forEach((coord: any) => {
                lngSum += coord[0];
                latSum += coord[1];
                count++;
            });
        });
    };

    if (type === 'Polygon') {
        processPolygon(coordinates);
    } else if (type === 'MultiPolygon') {
        coordinates.forEach((poly: any) => processPolygon(poly));
    }

    if (count === 0) return null;
    return [latSum / count, lngSum / count];
};

export const loadSectionCentroids = async (): Promise<Map<number, [number, number]>> => {
    if (!centroidsCache) {
        const geo = await loadCampecheGeo();
        centroidsCache = new Map<number, [number, number]>();
        if (geo && geo.features) {
            geo.features.forEach((feat: any) => {
                const seccion = Number(feat?.properties?.seccion);
                if (!isNaN(seccion)) {
                    const centroid = getCentroid(feat);
                    if (centroid) {
                        centroidsCache!.set(seccion, centroid);
                    }
                }
            });
        }
    }
    return centroidsCache;
};
