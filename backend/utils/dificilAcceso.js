// backend/utils/dificilAcceso.js
import pool from '../db/pool.js';

/**
 * Obtiene candidatas por región para estrategias AUTOMÁTICAS.
 * - Si avoidDificilAcceso === true, excluye las enlistadas en public.farmacia_dificil_acceso
 * - Si avoidDificilAcceso === false, devuelve todas (igual manda la UI/algoritmo después).
 *
 * @param {{ region: string|null, avoidDificilAcceso: boolean, withCoords?: boolean }} args
 * @returns {Promise<Array<{id:number, clues:string, unidad:string, latitud:number, longitud:number, dificil_acceso:boolean}>>}
 */
export async function getCandidateStopsByRegion({ region, avoidDificilAcceso, withCoords = true }) {
  const params = [];
  const where = ['f.latitud IS NOT NULL', 'f.longitud IS NOT NULL'];

  if (region) {
    params.push(region);
    where.push(`f.region_sanitaria = $${params.length}`);
  }

  let sql = `
    SELECT
      f.id, f.clues, f.unidad, f.latitud, f.longitud,
      (fda.clues IS NOT NULL) AS dificil_acceso
    FROM public.farmacia f
    LEFT JOIN public.farmacia_dificil_acceso fda
      ON fda.clues = f.clues
  `;

  if (avoidDificilAcceso) {
    // preferimos evitarlas en estrategias automáticas
    where.push(`fda.clues IS NULL`);
  }

  if (where.length) {
    sql += ` WHERE ${where.join(' AND ')} `;
  }
  sql += ` ORDER BY f.clues`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Obtiene farmacias por IDs (para MANUAL/plantilla).
 * - NO filtra por difícil acceso; solo agrega el flag para que lo veas y lo decidas.
 *
 * @param {number[]} ids
 * @returns {Promise<Array<{id:number, clues:string, unidad:string, latitud:number, longitud:number, dificil_acceso:boolean}>>}
 */
export async function getPharmaciesByIds(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  // Construimos parámetros $1, $2, ...
  const params = ids.map((_, i) => `$${i + 1}`).join(',');
  const sql = `
    SELECT
      f.id, f.clues, f.unidad, f.latitud, f.longitud,
      (fda.clues IS NOT NULL) AS dificil_acceso
    FROM public.farmacia f
    LEFT JOIN public.farmacia_dificil_acceso fda
      ON fda.clues = f.clues
    WHERE f.id IN (${params})
    ORDER BY f.clues
  `;
  const { rows } = await pool.query(sql, ids);
  return rows;
}
