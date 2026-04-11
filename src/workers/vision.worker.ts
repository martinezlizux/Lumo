
import jsfeat from 'jsfeat';

// Configuración de JSFeat
jsfeat.cache.allocate(2);

let curr_img_pyr = new jsfeat.pyramid_t(3);
let prev_img_pyr = new jsfeat.pyramid_t(3);
let point_count = 0;
const point_status = new Uint8Array(100);
const ref_xy = new Float32Array(100 * 2);  // Posiciones originales (referencia)
const prev_xy = new Float32Array(100 * 2); // Posiciones en frame anterior
const curr_xy = new Float32Array(100 * 2); // Posiciones en frame actual

// Matrices para Homografía
const homo_kernel = new jsfeat.motion_model.homography2d();
const homo_transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t);

let is_initialized = false;
let width = 0;
let height = 0;

self.onmessage = (e) => {
  const { type, data, w, h } = e.data;

  if (type === 'init') {
    width = w;
    height = h;
    curr_img_pyr.allocate(width, height, jsfeat.U8_t | jsfeat.C1_t);
    prev_img_pyr.allocate(width, height, jsfeat.U8_t | jsfeat.C1_t);
    is_initialized = true;
    return;
  }

  if (!is_initialized) return;

  const imageData = new Uint8ClampedArray(data);
  
  // Convertir a escala de grises
  jsfeat.imgproc.grayscale(imageData, width, height, curr_img_pyr.data[0]);
  curr_img_pyr.build(curr_img_pyr.data[0], true);

  if (type === 'anchor') {
    // Detección de puntos FAST
    const corners = [];
    for (let i = 0; i < width * height; ++i) corners[i] = new jsfeat.keypoint_t();
    
    // Umbral de detección (ajustado para balancear velocidad y cantidad de puntos)
    const threshold = 25;
    const count = jsfeat.fast_corners.detect(curr_img_pyr.data[0], corners, threshold);
    
    // Seleccionar los mejores 100 puntos
    corners.sort((a, b) => b.score - a.score);
    point_count = Math.min(count, 100);
    
    for (let i = 0; i < point_count; ++i) {
      ref_xy[i << 1] = corners[i].x;
      ref_xy[(i << 1) + 1] = corners[i].y;
      prev_xy[i << 1] = corners[i].x;
      prev_xy[(i << 1) + 1] = corners[i].y;
      point_status[i] = 1;
    }

    self.postMessage({ type: 'anchored', points: getPointsArray() });
  } 
  else if (type === 'track') {
    if (point_count < 8) {
      self.postMessage({ type: 'lost' });
      return;
    }

    // Seguimiento Lucas-Kanade incremental (prev -> curr)
    jsfeat.optical_flow_lk.track(
      prev_img_pyr, curr_img_pyr, 
      prev_xy, curr_xy, 
      point_count, 
      21, // win_size (ajustado para resolución 320px)
      30, // max_iterations
      point_status, 
      0.01, // epsilon
      0.0001 // min_eigen (reducido para ser más robusto)
    );

    // Contar puntos válidos antes de RANSAC
    let tracked_count = 0;
    for (let i = 0; i < point_count; ++i) {
      if (point_status[i] === 1) tracked_count++;
    }

    if (tracked_count > 8) {
      // Filtrar puntos con RANSAC comparando contra la referencia ORIGINAL
      // Esto nos da la homografía start -> current
      const match_mask = new jsfeat.matrix_t(point_count, 1, jsfeat.U8_t | jsfeat.C1_t);
      const ok = jsfeat.ransac.find_model(
        homo_kernel, 
        ref_xy, curr_xy, 
        point_count, 
        homo_transform, 
        match_mask, 
        500 // iters
      );

      if (ok) {
        // Actualizar estados internos basado en inliers de RANSAC
        let inlier_count = 0;
        for (let i = 0; i < point_count; ++i) {
           if (match_mask.data[i] === 0) {
             point_status[i] = 0; // Marcar outliers como perdidos
           } else {
             inlier_count++;
           }
        }

        self.postMessage({ 
          type: 'tracked', 
          matrix: Array.from(homo_transform.data),
          points: getPointsArray(),
          score: inlier_count / point_count
        });
      } else {
        self.postMessage({ type: 'lost' });
      }
    } else {
      self.postMessage({ type: 'lost' });
    }
  }

  // Preparar para el siguiente frame
  // Intercambiar pirámides
  const tmp = prev_img_pyr;
  prev_img_pyr = curr_img_pyr;
  curr_img_pyr = tmp;
  
  // Guardar curr_xy en prev_xy solo para los puntos que se trackearon
  for (let i = 0; i < point_count * 2; ++i) {
    prev_xy[i] = curr_xy[i];
  }
};

function getPointsArray() {
  const points = [];
  for (let i = 0; i < point_count; ++i) {
    if (point_status[i] === 1) {
      points.push({ x: curr_xy[i << 1], y: curr_xy[(i << 1) + 1] });
    }
  }
  return points;
}
