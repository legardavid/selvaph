const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// Conexión a Base de Datos SQLite local
const db = new sqlite3.Database('./asamblea.db', (err) => {
    if (err) console.error('Error al abrir la BD', err.message);
    else console.log('Base de datos conectada.');
});

// Inicializar Tablas y Datos de Prueba
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS unidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        torre_apto TEXT NOT NULL,
        coeficiente REAL NOT NULL,
        token TEXT UNIQUE NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS preguntas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        estado TEXT DEFAULT 'inactiva' -- 'inactiva', 'activa', 'finalizada'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS votos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pregunta_id INTEGER,
        unidad_id INTEGER,
        opcion TEXT NOT NULL,
        coeficiente REAL NOT NULL,
        hash_seguridad TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(pregunta_id) REFERENCES preguntas(id),
        FOREIGN KEY(unidad_id) REFERENCES unidades(id),
        UNIQUE(pregunta_id, unidad_id)
    )`);

    db.get(`SELECT COUNT(*) as count FROM unidades`, (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare(`INSERT INTO unidades (torre_apto, coeficiente, token) VALUES (?, ?, ?)`);
            stmt.run('Torre 1 - Apto 101', 0.0025, 'token-101-abc');
            stmt.run('Torre 1 - Apto 102', 0.0025, 'token-102-def');
            stmt.run('Torre 2 - Apto 201', 0.0050, 'token-201-ghi');
            stmt.finalize();

            db.run(`INSERT INTO preguntas (titulo, estado) VALUES ('¿Aprueba el presupuesto para la vigencia 2026?', 'activa')`);
            db.run(`INSERT INTO preguntas (titulo, estado) VALUES ('¿Aprueba la elección del Consejo de Administración?', 'inactiva')`);
            console.log('Datos y preguntas iniciales creadas.');
        }
    });
});

// ==========================================
// API ENDPOINTS
// ==========================================

app.get('/api/estado-actual/:token', (req, res) => {
    const { token } = req.params;

    db.get(`SELECT * FROM unidades WHERE token = ?`, [token], (err, unidad) => {
        if (err || !unidad) return res.status(404).json({ error: 'Token inválido.' });

        db.get(`SELECT * FROM preguntas WHERE estado = 'activa'`, [], (err, pregunta) => {
            if (!pregunta) {
                return res.json({ unidad, preguntaActiva: null, yaVoto: false });
            }

            db.get(`SELECT * FROM votos WHERE pregunta_id = ? AND unidad_id = ?`, [pregunta.id, unidad.id], (err, voto) => {
                res.json({
                    unidad,
                    preguntaActiva: pregunta,
                    yaVoto: !!voto
                });
            });
        });
    });
});

app.post('/api/votar', (req, res) => {
    const { token, opcion } = req.body;
    if (!['SÍ', 'NO', 'BLANCO'].includes(opcion)) {
        return res.status(400).json({ error: 'Opción no válida.' });
    }

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.get(`SELECT * FROM unidades WHERE token = ?`, [token], (err, unidad) => {
            if (err || !unidad) {
                db.run('ROLLBACK');
                return res.status(404).json({ error: 'Unidad no encontrada.' });
            }

            db.get(`SELECT * FROM preguntas WHERE estado = 'activa'`, [], (err, pregunta) => {
                if (err || !pregunta) {
                    db.run('ROLLBACK');
                    return res.status(400).json({ error: 'No hay ninguna votación activa.' });
                }

                db.get(`SELECT * FROM votos WHERE pregunta_id = ? AND unidad_id = ?`, [pregunta.id, unidad.id], (err, votoExistente) => {
                    if (votoExistente) {
                        db.run('ROLLBACK');
                        return res.status(400).json({ error: 'Ya ha votado en esta pregunta.' });
                    }

                    const dataHash = `${pregunta.id}-${unidad.id}-${opcion}-${Date.now()}`;
                    const hashSeguridad = crypto.createHash('sha256').update(dataHash).digest('hex');

                    db.run(`INSERT INTO votos (pregunta_id, unidad_id, opcion, coeficiente, hash_seguridad) VALUES (?, ?, ?, ?, ?)`,
                        [pregunta.id, unidad.id, opcion, unidad.coeficiente, hashSeguridad], (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Error al registrar voto.' });
                            }
                            db.run('COMMIT');
                            res.json({ success: true, hash: hashSeguridad });
                        });
                });
            });
        });
    });
});

// Endpoint para traer TODAS las preguntas con sus resultados acumulados
app.get('/api/resultados-todos', (req, res) => {
    db.all(`SELECT * FROM preguntas ORDER BY id ASC`, [], (err, preguntas) => {
        if (err) return res.status(500).json({ error: 'Error interno' });
        if (!preguntas || preguntas.length === 0) return res.json([]);

        let procesadas = 0;
        const resultadoFinal = [];

        preguntas.forEach((pregunta) => {
            db.all(`SELECT opcion, SUM(coeficiente) as total_coeficiente, COUNT(*) as total_votos 
                    FROM votos WHERE pregunta_id = ? GROUP BY opcion`, [pregunta.id], (err, rows) => {
                
                db.get(`SELECT SUM(coeficiente) as quorum FROM votos WHERE pregunta_id = ?`, [pregunta.id], (err, qRow) => {
                    resultadoFinal.push({
                        pregunta,
                        quorum: qRow.quorum || 0,
                        resultados: rows || []
                    });

                    procesadas++;
                    if (procesadas === preguntas.length) {
                        res.json(resultadoFinal);
                    }
                });
            });
        });
    });
});

app.get('/api/admin/preguntas', (req, res) => {
    db.all(`SELECT * FROM preguntas`, [], (err, rows) => res.json(rows));
});

app.post('/api/admin/crear-pregunta', (req, res) => {
    const { titulo } = req.body;
    db.run(`INSERT INTO preguntas (titulo, estado) VALUES (?, 'inactiva')`, [titulo], function(err) {
        if (err) return res.status(500).json({ error: 'Error al crear' });
        res.json({ success: true, id: this.lastID });
    });
});

app.post('/api/admin/cambiar-estado', (req, res) => {
    const { id, estado } = req.body;
    db.serialize(() => {
        if (estado === 'activa') {
            db.run(`UPDATE preguntas SET estado = 'finalizada' WHERE estado = 'activa'`);
        }
        db.run(`UPDATE preguntas SET estado = ? WHERE id = ?`, [estado, id], (err) => {
            if (err) return res.status(500).json({ error: 'Error al cambiar estado' });
            res.json({ success: true });
        });
    });
});

// ==========================================
// FRONTEND 1: PANTALLA DE VOTACIÓN (Propietarios)
// ==========================================
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Votación Asamblea - Reserva Serrat Selva</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            serrat: {
                                green: '#1E6B39',
                                teal: '#2B7067',
                                yellow: '#D9A21B',
                                orange: '#D86B27',
                                lightgreen: '#88B035',
                                dark: '#112918'
                            }
                        }
                    }
                }
            }
        </script>
    </head>
    <body class="bg-emerald-50/40 min-h-screen flex flex-col justify-between font-sans">
        <header class="bg-serrat-green text-white p-4 shadow-lg border-b-4 border-serrat-yellow">
            <div class="max-w-xl mx-auto flex justify-between items-center">
                <div>
                    <h1 class="font-black text-xl tracking-wide uppercase">RESERVA SERRAT</h1>
                    <p class="text-xs text-emerald-100 font-medium tracking-widest uppercase">Unidad Residencial &bull; SELVA</p>
                </div>
                <span id="badge-estado" class="bg-serrat-lightgreen text-white text-xs px-3 py-1 rounded-full font-bold shadow-sm">Torres 1 y 2</span>
            </div>
        </header>

        <main class="max-w-xl mx-auto p-4 w-full flex-grow">
            <div id="info-inmueble" class="bg-white rounded-2xl p-5 shadow-sm mb-5 border-l-4 border-serrat-teal border-t border-r border-b border-slate-100">
                <p class="text-xs text-serrat-teal font-bold uppercase tracking-wider">Unidad Residencial Selva:</p>
                <h2 id="txt-unidad" class="text-2xl font-black text-slate-800">Cargando...</h2>
                <div class="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 text-sm text-slate-600">
                    <span class="font-medium">Coeficiente de copropiedad:</span>
                    <strong id="txt-coeficiente" class="text-serrat-green font-mono font-bold text-base">-</strong>
                </div>
            </div>

            <div id="contenido-dinamico" class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
                <p class="text-slate-500">Cargando estado de la asamblea...</p>
            </div>
        </main>

        <footer class="bg-white border-t border-emerald-100 text-center p-4 text-xs text-slate-500">
            <strong>Reserva Serrat Selva</strong> &bull; Ley 675 de 2001 &bull; Votación Ponderada
        </footer>

        <script>
            let tokenActual = '';

            window.onload = async function() {
                const urlParams = new URLSearchParams(window.location.search);
                tokenActual = urlParams.get('token');
                if (!tokenActual) {
                    document.body.innerHTML = '<div class="p-8 text-center text-red-600 font-bold">Falta el token de acceso.</div>';
                    return;
                }
                verificarEstado();
                setInterval(verificarEstado, 4000);
            };

            async function verificarEstado() {
                try {
                    const res = await fetch(\`/api/estado-actual/\${tokenActual}\`);
                    const data = await res.json();
                    
                    document.getElementById('txt-unidad').innerText = data.unidad.torre_apto;
                    document.getElementById('txt-coeficiente').innerText = (data.unidad.coeficiente * 100).toFixed(4) + '%';

                    const contenedor = document.getElementById('contenido-dinamico');

                    if (!data.preguntaActiva) {
                        contenedor.innerHTML = \`
                            <div class="py-8">
                                <div class="w-12 h-12 bg-amber-50 text-serrat-yellow rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-xl">⏳</div>
                                <h3 class="text-lg font-bold text-slate-800 mb-2">Esperando votación</h3>
                                <p class="text-sm text-slate-500">El administrador habilitará una pregunta para Torres 1 y 2 en breve.</p>
                            </div>
                        \`;
                        return;
                    }

                    if (data.yaVoto) {
                        contenedor.innerHTML = \`
                            <div class="py-6">
                                <div class="w-12 h-12 bg-emerald-100 text-serrat-green rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-xl">✓</div>
                                <h3 class="text-lg font-bold text-slate-900 mb-1">¡Voto registrado con éxito!</h3>
                                <p class="text-xs text-slate-500 mb-4">Pregunta: <strong>\${data.preguntaActiva.titulo}</strong></p>
                                <p class="text-xs text-serrat-teal bg-emerald-50 p-3 rounded-xl font-medium border border-emerald-100">Espere a que la administración cierre esta votación o active la siguiente.</p>
                            </div>
                        \`;
                        return;
                    }

                    contenedor.innerHTML = \`
                        <h3 class="text-base font-bold text-slate-900 mb-4 text-left border-b pb-2 border-slate-100">\${data.preguntaActiva.titulo}</h3>
                        <div class="space-y-3 text-left">
                            <button onclick="emitirVoto('SÍ')" class="w-full p-3.5 rounded-xl border-2 border-emerald-200 hover:border-serrat-green bg-emerald-50/50 hover:bg-emerald-100/50 text-serrat-green font-bold transition flex justify-between items-center text-sm shadow-sm">
                                <span>🟢 SÍ (Aprobar)</span>
                            </button>
                            <button onclick="emitirVoto('NO')" class="w-full p-3.5 rounded-xl border-2 border-orange-200 hover:border-serrat-orange bg-orange-50/50 hover:bg-orange-100/50 text-serrat-orange font-bold transition flex justify-between items-center text-sm shadow-sm">
                                <span>🔴 NO (Negar)</span>
                            </button>
                            <button onclick="emitirVoto('BLANCO')" class="w-full p-3.5 rounded-xl border-2 border-slate-200 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold transition flex justify-between items-center text-sm shadow-sm">
                                <span>⚪ Voto en Blanco / Abstención</span>
                            </button>
                        </div>
                    \`;
                } catch (e) {
                    console.error(e);
                }
            }

            async function emitirVoto(opcion) {
                if (!confirm(\`¿Confirma su voto por: \${opcion}?\`)) return;
                try {
                    const res = await fetch('/api/votar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: tokenActual, opcion })
                    });
                    const data = await res.json();
                    if (!res.ok) { alert(data.error); return; }
                    verificarEstado();
                } catch (e) {
                    alert('Error de red.');
                }
            }
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// FRONTEND 2: PANEL DE ADMINISTRACIÓN (/admin)
// ==========================================
app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Panel Admin - Reserva Serrat Selva</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            serrat: {
                                green: '#1E6B39',
                                teal: '#2B7067',
                                yellow: '#D9A21B',
                                orange: '#D86B27',
                                lightgreen: '#88B035',
                                dark: '#112918'
                            }
                        }
                    }
                }
            }
        </script>
    </head>
    <body class="bg-slate-100 min-h-screen p-6 font-sans">
        <div class="max-w-2xl mx-auto">
            <header class="mb-6 pb-4 border-b border-slate-200">
                <div class="flex items-center gap-3">
                    <div class="w-4 h-10 bg-serrat-green rounded-full"></div>
                    <div>
                        <h1 class="text-2xl font-black text-slate-800 tracking-wide">RESERVA SERRAT SELVA</h1>
                        <p class="text-xs text-serrat-teal font-semibold">Panel de Control de Asamblea &bull; Torre 1 y Torre 2</p>
                    </div>
                </div>
            </header>

            <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 mb-6 border-t-4 border-t-serrat-green">
                <h3 class="font-bold text-slate-800 mb-3 text-sm">Agregar Nueva Pregunta / Decisión</h3>
                <div class="flex gap-2">
                    <input type="text" id="txt-nueva-pregunta" placeholder="Ej: ¿Aprueba el presupuesto para la vigencia 2026?" class="flex-grow border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:border-serrat-green focus:ring-1 focus:ring-serrat-green">
                    <button onclick="crearPregunta()" class="bg-serrat-green text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-emerald-800 transition">Crear</button>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
                <h3 class="font-bold text-slate-800 mb-3 text-sm">Preguntas de la Asamblea</h3>
                <div id="lista-preguntas" class="space-y-3">
                    <p class="text-sm text-slate-400">Cargando...</p>
                </div>
            </div>

            <div class="mt-6 text-center">
                <a href="/en-vivo" target="_blank" class="text-serrat-teal hover:text-serrat-green underline text-sm font-bold">Ver Pantalla de Resultados en Vivo ↗</a>
            </div>
        </div>

        <script>
            async function cargarPreguntas() {
                const res = await fetch('/api/admin/preguntas');
                const preguntas = await res.json();
                const contenedor = document.getElementById('lista-preguntas');
                
                if (preguntas.length === 0) {
                    contenedor.innerHTML = '<p class="text-sm text-slate-400">No hay preguntas creadas.</p>';
                    return;
                }

                let html = '';
                preguntas.forEach(p => {
                    let badgeColor = 'bg-slate-100 text-slate-600';
                    if (p.estado === 'activa') badgeColor = 'bg-emerald-100 text-serrat-green font-bold border border-emerald-200';
                    if (p.estado === 'finalizada') badgeColor = 'bg-amber-100 text-amber-800 font-semibold border border-amber-200';

                    html += \`
                        <div class="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
                            <div>
                                <span class="text-xs px-2.5 py-0.5 rounded-full \${badgeColor}">\${p.estado.toUpperCase()}</span>
                                <h4 class="font-semibold text-slate-800 text-sm mt-1">\${p.titulo}</h4>
                            </div>
                            <div class="flex gap-2">
                                \${p.estado !== 'activa' ? \`<button onclick="cambiarEstado(\${p.id}, 'activa')" class="bg-serrat-green text-white text-xs px-3.5 py-2 rounded-lg font-bold hover:bg-emerald-800 transition">Activar</button>\` : ''}
                                \${p.estado === 'activa' ? \`<button onclick="cambiarEstado(\${p.id}, 'finalizada')" class="bg-serrat-orange text-white text-xs px-3.5 py-2 rounded-lg font-bold hover:bg-orange-700 transition">Cerrar Votación</button>\` : ''}
                            </div>
                        </div>
                    \`;
                });
                contenedor.innerHTML = html;
            }

            async function crearPregunta() {
                const titulo = document.getElementById('txt-nueva-pregunta').value;
                if (!titulo) return alert('Escribe el título de la pregunta');
                await fetch('/api/admin/crear-pregunta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ titulo })
                });
                document.getElementById('txt-nueva-pregunta').value = '';
                cargarPreguntas();
            }

            async function cambiarEstado(id, estado) {
                await fetch('/api/admin/cambiar-estado', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, estado })
                });
                cargarPreguntas();
            }

            cargarPreguntas();
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// FRONTEND 3: DASHBOARD EN VIVO (/en-vivo)
// ==========================================
app.get('/en-vivo', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resultados en Vivo - Reserva Serrat Selva</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            serrat: {
                                green: '#1E6B39',
                                teal: '#2B7067',
                                yellow: '#D9A21B',
                                orange: '#D86B27',
                                lightgreen: '#88B035',
                                dark: '#0C1C12'
                            }
                        }
                    }
                }
            }
        </script>
    </head>
    <body class="bg-serrat-dark text-white min-h-screen flex flex-col justify-between p-6 font-sans">
        <header class="text-center mb-6 pb-4 border-b border-emerald-900/50">
            <h1 class="text-3xl font-black tracking-wider text-emerald-100 uppercase">RESERVA SERRAT SELVA</h1>
            <p class="text-serrat-yellow font-bold text-sm mt-1 uppercase tracking-widest">Torre 1 &bull; Torre 2 &bull; Consolidado de Asamblea</p>
        </header>

        <main class="max-w-4xl mx-auto w-full flex-grow space-y-6" id="contenedor-preguntas">
            <p class="text-center text-emerald-200/60">Cargando consolidado de resultados...</p>
        </main>

        <footer class="text-center text-emerald-200/40 text-xs mt-6">
            Actualización automática en tiempo real &bull; Asamblea General Reserva Serrat Selva
        </footer>

        <script>
            async function actualizarDashboard() {
                try {
                    const res = await fetch('/api/resultados-todos');
                    const lista = await res.json();
                    
                    const contenedor = document.getElementById('contenedor-preguntas');
                    if (!lista || lista.length === 0) {
                        contenedor.innerHTML = '<p class="text-emerald-200/60 text-center">No hay preguntas registradas todavía.</p>';
                        return;
                    }

                    let html = '';
                    lista.forEach((item, index) => {
                        let badgeClase = 'bg-slate-800 text-slate-400 border border-slate-700';
                        let badgeTexto = 'INACTIVA';
                        if (item.pregunta.estado === 'activa') {
                            badgeClase = 'bg-serrat-green text-white animate-pulse border border-emerald-400';
                            badgeTexto = '🟢 VOTACIÓN EN CURSO';
                        } else if (item.pregunta.estado === 'finalizada') {
                            badgeClase = 'bg-serrat-orange text-white border border-orange-400';
                            badgeTexto = '🔒 CERRADA / FINALIZADA';
                        }

                        const quorumPorcentaje = (item.quorum * 100).toFixed(2);

                        let barrasHtml = '';
                        if (!item.resultados || item.resultados.length === 0) {
                            barrasHtml = '<p class="text-slate-400 text-sm italic py-2">Aún no se han emitido votos para esta pregunta.</p>';
                        } else {
                            item.resultados.forEach(r => {
                                const porcentajeCoef = (r.total_coeficiente * 100).toFixed(2);
                                let colorBarra = 'bg-serrat-teal';
                                if (r.opcion === 'SÍ') colorBarra = 'bg-serrat-green';
                                if (r.opcion === 'NO') colorBarra = 'bg-serrat-orange';
                                if (r.opcion === 'BLANCO') colorBarra = 'bg-slate-500';

                                barrasHtml += \`
                                    <div class="mb-3">
                                        <div class="flex justify-between text-sm font-semibold mb-1">
                                            <span>\${r.opcion} (\${r.total_votos} unidades votantes)</span>
                                            <span class="font-mono font-bold text-serrat-yellow">\${porcentajeCoef}%</span>
                                        </div>
                                        <div class="w-full bg-slate-900/80 rounded-full h-3.5 overflow-hidden border border-slate-800">
                                            <div class="\${colorBarra} h-3.5 rounded-full transition-all duration-500" style="width: \${Math.min(porcentajeCoef, 100)}%"></div>
                                        </div>
                                    </div>
                                \`;
                            });
                        }

                        html += \`
                            <div class="bg-slate-900/90 border border-emerald-900/60 rounded-2xl p-6 shadow-xl">
                                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 border-b border-emerald-900/40 pb-3">
                                    <div>
                                        <span class="text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider \${badgeClase}">\${badgeTexto}</span>
                                        <h3 class="text-lg font-bold text-white mt-2">Pregunta \${index + 1}: \${item.pregunta.titulo}</h3>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-xs text-emerald-200/60 block uppercase font-medium">Quórum Alcanzado</span>
                                        <span class="text-2xl font-mono font-black text-serrat-yellow">\${quorumPorcentaje}%</span>
                                    </div>
                                </div>
                                <div class="mt-4">
                                    \${barrasHtml}
                                </div>
                            </div>
                        \`;
                    });

                    contenedor.innerHTML = html;
                } catch (e) {
                    console.error("Error actualizando pantalla en vivo:", e);
                }
            }

            setInterval(actualizarDashboard, 3000);
            actualizarDashboard();
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Aplicación corriendo en http://localhost:${PORT}`);
    console.log(`Panel de Administración: http://localhost:${PORT}/admin`);
    console.log(`Pantalla en Vivo (Histórico): http://localhost:${PORT}/en-vivo`);
});