// ── db.js — IndexedDB wrapper ──────────────────────────────────────────────
const DB_NAME = 'lectorAcademico';
const DB_VERSION = 1;

const DB = {
  db: null,

  async open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('materias')) {
          db.createObjectStore('materias', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('lecturas')) {
          const ls = db.createObjectStore('lecturas', { keyPath: 'id', autoIncrement: true });
          ls.createIndex('materia', 'materia', { unique: false });
        }
        if (!db.objectStoreNames.contains('pdfs')) {
          db.createObjectStore('pdfs', { keyPath: 'lecturaId' });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(store) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async get(store, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async put(store, obj) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async add(store, obj) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).add(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(store, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

// ── Seed data ──────────────────────────────────────────────────────────────
const SEED_MATERIAS = [
  { nombre: "Introducción a las RRII", color: "#C4531A", unidades: ["Unidad 1 – Sistema Internacional", "Unidad 2 – Actores", "Unidad 3 – Teorías"] },
  { nombre: "Ciencia Política", color: "#2E6BA8", unidades: ["Unidad 1 – El Estado", "Unidad 2 – Democracia", "Unidad 3 – Partidos"] },
  { nombre: "Epistemología", color: "#5A8A3C", unidades: ["Unidad 1 – Neopositivismo", "Unidad 2 – Popper", "Unidad 3 – Kuhn"] },
  { nombre: "Filosofía Premoderna", color: "#8B4BAB", unidades: ["Unidad 1 – Presocráticos", "Unidad 2 – Platón", "Unidad 3 – Aristóteles"] },
  { nombre: "Sociología General", color: "#C4853A", unidades: ["Unidad 1 – Durkheim", "Unidad 2 – Weber", "Unidad 3 – Giddens"] },
  { nombre: "Escritura Argumentativa", color: "#2E8B7A", unidades: ["Unidad 1 – Argumento", "Unidad 2 – Ensayo", "Unidad 3 – Retórica"] },
];

const SEED_LECTURAS = [
  { titulo: "Barbé – El sistema internacional", materia: 1, unidad: "Unidad 1 – Sistema Internacional", paginas: 34, leido: false, deadline: "2025-05-20", subrayados: [{ texto: "El sistema internacional se define como el conjunto de interacciones entre unidades políticas soberanas.", color: "#FFE066", pagina: 3 }], notas: "" },
  { titulo: "Marsh & Stoker – Cap. 1: Introducción a la teoría política", materia: 2, unidad: "Unidad 1 – El Estado", paginas: 28, leido: false, deadline: "2025-05-22", subrayados: [], notas: "" },
  { titulo: "Popper – La lógica de la investigación científica (sel.)", materia: 3, unidad: "Unidad 2 – Popper", paginas: 22, leido: true, deadline: "2025-05-18", subrayados: [{ texto: "Una teoría que no puede ser refutada por ningún acontecimiento concebible no es científica.", color: "#A8D8EA", pagina: 7 }], notas: "Ver relación con Kuhn en la unidad siguiente." },
  { titulo: "Reale & Antiseri – Los presocráticos", materia: 4, unidad: "Unidad 1 – Presocráticos", paginas: 18, leido: false, deadline: "2025-05-25", subrayados: [], notas: "" },
  { titulo: "Durkheim – El suicidio (introducción)", materia: 5, unidad: "Unidad 1 – Durkheim", paginas: 15, leido: false, deadline: "2025-05-28", subrayados: [], notas: "" },
  { titulo: "Hobsbawm – La era de los extremos, cap. 1", materia: 1, unidad: "Unidad 2 – Actores", paginas: 30, leido: false, deadline: "2025-05-30", subrayados: [], notas: "" },
  { titulo: "Levitsky & Way – Autoritarismo competitivo", materia: 2, unidad: "Unidad 2 – Democracia", paginas: 24, leido: false, deadline: "2025-06-02", subrayados: [], notas: "" },
];

async function seedIfEmpty() {
  const existing = await DB.getAll('materias');
  if (existing.length > 0) return;
  for (const m of SEED_MATERIAS) await DB.add('materias', m);
  for (const l of SEED_LECTURAS) await DB.add('lecturas', l);
}
