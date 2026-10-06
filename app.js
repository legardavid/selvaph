require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
app.use(express.json({ limit: '32kb' }));
app.set('trust proxy', 1);

// Conexión a Base de Datos SQLite local
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, 'asamblea.db');
const db = new sqlite3.Database(databasePath, (err) => {
    if (err) console.error('Error al abrir la BD:', err.message);
    else console.log('Base de datos conectada.');
});

const SECRET_SEED = process.env.TOKEN_SECRET || (process.env.NODE_ENV === 'production'
    ? ''
    : crypto.randomBytes(32).toString('hex'));

if (SECRET_SEED.length < 32) {
    throw new Error('Configure TOKEN_SECRET con al menos 32 caracteres.');
}

const generarTokenSeguro = (cadena) => {
    return crypto.createHmac('sha256', SECRET_SEED)
                 .update(cadena)
                 .digest('hex')
                 .substring(0, 32);
};

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

let transactionQueue = Promise.resolve();

function withTransaction(operation) {
    const transaction = transactionQueue.then(async () => {
        await dbRun('BEGIN IMMEDIATE');
        try {
            const result = await operation();
            await dbRun('COMMIT');
            return result;
        } catch (err) {
            await dbRun('ROLLBACK').catch(() => {});
            throw err;
        }
    });
    transactionQueue = transaction.catch(() => {});
    return transaction;
}

function requestError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function sameSecret(actual, expected) {
    const actualHash = crypto.createHash('sha256').update(String(actual)).digest();
    const expectedHash = crypto.createHash('sha256').update(String(expected)).digest();
    return crypto.timingSafeEqual(actualHash, expectedHash);
}

function requireBasicAuth(userEnv, defaultUser, passwordEnv, realm) {
    return (req, res, next) => {
        const expectedUser = process.env[userEnv] || defaultUser;
        const expectedPassword = process.env[passwordEnv];
        if (!expectedPassword) {
            return res.status(503).send(`Configure ${passwordEnv} para habilitar este acceso.`);
        }

        const authorization = req.get('authorization') || '';
        const match = authorization.match(/^Basic\s+(.+)$/i);
        let username = '';
        let password = '';
        if (match) {
            try {
                const credentials = Buffer.from(match[1], 'base64').toString('utf8');
                const separator = credentials.indexOf(':');
                if (separator >= 0) {
                    username = credentials.slice(0, separator);
                    password = credentials.slice(separator + 1);
                }
            } catch (err) {}
        }

        if (!sameSecret(username, expectedUser) || !sameSecret(password, expectedPassword)) {
            res.set('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
            return res.status(401).send('Autenticación requerida.');
        }
        next();
    };
}

app.use('/registro', requireBasicAuth('REGISTRO_USER', 'Registro', 'REGISTRO_PASSWORD', 'Mesa de registro'));
app.use('/api/registro', requireBasicAuth('REGISTRO_USER', 'Registro', 'REGISTRO_PASSWORD', 'Mesa de registro'));
app.use('/admin', requireBasicAuth('ADMIN_USER', 'admin', 'ADMIN_PASSWORD', 'Administración'));
app.use('/api/admin', requireBasicAuth('ADMIN_USER', 'admin', 'ADMIN_PASSWORD', 'Administración'));

// LISTADO OFICIAL DE COEFICIENTES DE LOS 384 APARTAMENTOS
const UNIDADES_REALES = [
    // TORRE 1
    { torre_apto: 'Torre 1 - Apto 101', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 101') },
    { torre_apto: 'Torre 1 - Apto 102', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 102') },
    { torre_apto: 'Torre 1 - Apto 103', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 103') },
    { torre_apto: 'Torre 1 - Apto 104', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 104') },
    { torre_apto: 'Torre 1 - Apto 105', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 105') },
    { torre_apto: 'Torre 1 - Apto 106', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 106') },
    { torre_apto: 'Torre 1 - Apto 107', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 107') },
    { torre_apto: 'Torre 1 - Apto 108', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 108') },
    { torre_apto: 'Torre 1 - Apto 201', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 201') },
    { torre_apto: 'Torre 1 - Apto 202', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 202') },
    { torre_apto: 'Torre 1 - Apto 203', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 203') },
    { torre_apto: 'Torre 1 - Apto 204', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 204') },
    { torre_apto: 'Torre 1 - Apto 205', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 205') },
    { torre_apto: 'Torre 1 - Apto 206', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 206') },
    { torre_apto: 'Torre 1 - Apto 207', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 207') },
    { torre_apto: 'Torre 1 - Apto 208', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 208') },
    { torre_apto: 'Torre 1 - Apto 301', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 301') },
    { torre_apto: 'Torre 1 - Apto 302', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 302') },
    { torre_apto: 'Torre 1 - Apto 303', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 303') },
    { torre_apto: 'Torre 1 - Apto 304', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 304') },
    { torre_apto: 'Torre 1 - Apto 305', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 305') },
    { torre_apto: 'Torre 1 - Apto 306', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 306') },
    { torre_apto: 'Torre 1 - Apto 307', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 307') },
    { torre_apto: 'Torre 1 - Apto 308', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 308') },
    { torre_apto: 'Torre 1 - Apto 401', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 401') },
    { torre_apto: 'Torre 1 - Apto 402', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 402') },
    { torre_apto: 'Torre 1 - Apto 403', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 403') },
    { torre_apto: 'Torre 1 - Apto 404', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 404') },
    { torre_apto: 'Torre 1 - Apto 405', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 405') },
    { torre_apto: 'Torre 1 - Apto 406', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 406') },
    { torre_apto: 'Torre 1 - Apto 407', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 407') },
    { torre_apto: 'Torre 1 - Apto 408', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 408') },
    { torre_apto: 'Torre 1 - Apto 501', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 501') },
    { torre_apto: 'Torre 1 - Apto 502', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 502') },
    { torre_apto: 'Torre 1 - Apto 503', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 503') },
    { torre_apto: 'Torre 1 - Apto 504', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 504') },
    { torre_apto: 'Torre 1 - Apto 505', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 505') },
    { torre_apto: 'Torre 1 - Apto 506', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 506') },
    { torre_apto: 'Torre 1 - Apto 507', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 507') },
    { torre_apto: 'Torre 1 - Apto 508', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 508') },
    { torre_apto: 'Torre 1 - Apto 601', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 601') },
    { torre_apto: 'Torre 1 - Apto 602', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 602') },
    { torre_apto: 'Torre 1 - Apto 603', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 603') },
    { torre_apto: 'Torre 1 - Apto 604', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 604') },
    { torre_apto: 'Torre 1 - Apto 605', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 605') },
    { torre_apto: 'Torre 1 - Apto 606', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 606') },
    { torre_apto: 'Torre 1 - Apto 607', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 607') },
    { torre_apto: 'Torre 1 - Apto 608', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 608') },
    { torre_apto: 'Torre 1 - Apto 701', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 701') },
    { torre_apto: 'Torre 1 - Apto 702', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 702') },
    { torre_apto: 'Torre 1 - Apto 703', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 703') },
    { torre_apto: 'Torre 1 - Apto 704', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 704') },
    { torre_apto: 'Torre 1 - Apto 705', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 705') },
    { torre_apto: 'Torre 1 - Apto 706', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 706') },
    { torre_apto: 'Torre 1 - Apto 707', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 707') },
    { torre_apto: 'Torre 1 - Apto 708', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 708') },
    { torre_apto: 'Torre 1 - Apto 801', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 801') },
    { torre_apto: 'Torre 1 - Apto 802', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 802') },
    { torre_apto: 'Torre 1 - Apto 803', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 803') },
    { torre_apto: 'Torre 1 - Apto 804', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 804') },
    { torre_apto: 'Torre 1 - Apto 805', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 805') },
    { torre_apto: 'Torre 1 - Apto 806', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 806') },
    { torre_apto: 'Torre 1 - Apto 807', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 807') },
    { torre_apto: 'Torre 1 - Apto 808', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 808') },
    { torre_apto: 'Torre 1 - Apto 901', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 901') },
    { torre_apto: 'Torre 1 - Apto 902', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 902') },
    { torre_apto: 'Torre 1 - Apto 903', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 903') },
    { torre_apto: 'Torre 1 - Apto 904', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 904') },
    { torre_apto: 'Torre 1 - Apto 905', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 905') },
    { torre_apto: 'Torre 1 - Apto 906', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 906') },
    { torre_apto: 'Torre 1 - Apto 907', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 907') },
    { torre_apto: 'Torre 1 - Apto 908', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 908') },
    { torre_apto: 'Torre 1 - Apto 1001', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1001') },
    { torre_apto: 'Torre 1 - Apto 1002', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1002') },
    { torre_apto: 'Torre 1 - Apto 1003', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1003') },
    { torre_apto: 'Torre 1 - Apto 1004', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1004') },
    { torre_apto: 'Torre 1 - Apto 1005', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1005') },
    { torre_apto: 'Torre 1 - Apto 1006', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1006') },
    { torre_apto: 'Torre 1 - Apto 1007', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1007') },
    { torre_apto: 'Torre 1 - Apto 1008', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1008') },
    { torre_apto: 'Torre 1 - Apto 1101', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1101') },
    { torre_apto: 'Torre 1 - Apto 1102', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1102') },
    { torre_apto: 'Torre 1 - Apto 1103', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1103') },
    { torre_apto: 'Torre 1 - Apto 1104', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1104') },
    { torre_apto: 'Torre 1 - Apto 1105', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1105') },
    { torre_apto: 'Torre 1 - Apto 1106', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1106') },
    { torre_apto: 'Torre 1 - Apto 1107', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1107') },
    { torre_apto: 'Torre 1 - Apto 1108', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1108') },
    { torre_apto: 'Torre 1 - Apto 1201', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1201') },
    { torre_apto: 'Torre 1 - Apto 1202', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1202') },
    { torre_apto: 'Torre 1 - Apto 1203', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1203') },
    { torre_apto: 'Torre 1 - Apto 1204', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1204') },
    { torre_apto: 'Torre 1 - Apto 1205', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1205') },
    { torre_apto: 'Torre 1 - Apto 1206', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1206') },
    { torre_apto: 'Torre 1 - Apto 1207', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1207') },
    { torre_apto: 'Torre 1 - Apto 1208', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1208') },
    { torre_apto: 'Torre 1 - Apto 1301', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1301') },
    { torre_apto: 'Torre 1 - Apto 1302', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1302') },
    { torre_apto: 'Torre 1 - Apto 1303', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1303') },
    { torre_apto: 'Torre 1 - Apto 1304', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1304') },
    { torre_apto: 'Torre 1 - Apto 1305', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1305') },
    { torre_apto: 'Torre 1 - Apto 1306', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1306') },
    { torre_apto: 'Torre 1 - Apto 1307', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1307') },
    { torre_apto: 'Torre 1 - Apto 1308', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1308') },
    { torre_apto: 'Torre 1 - Apto 1401', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1401') },
    { torre_apto: 'Torre 1 - Apto 1402', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1402') },
    { torre_apto: 'Torre 1 - Apto 1403', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1403') },
    { torre_apto: 'Torre 1 - Apto 1404', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1404') },
    { torre_apto: 'Torre 1 - Apto 1405', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1405') },
    { torre_apto: 'Torre 1 - Apto 1406', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1406') },
    { torre_apto: 'Torre 1 - Apto 1407', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1407') },
    { torre_apto: 'Torre 1 - Apto 1408', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1408') },
    { torre_apto: 'Torre 1 - Apto 1501', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1501') },
    { torre_apto: 'Torre 1 - Apto 1502', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1502') },
    { torre_apto: 'Torre 1 - Apto 1503', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1503') },
    { torre_apto: 'Torre 1 - Apto 1504', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1504') },
    { torre_apto: 'Torre 1 - Apto 1505', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1505') },
    { torre_apto: 'Torre 1 - Apto 1506', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1506') },
    { torre_apto: 'Torre 1 - Apto 1507', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1507') },
    { torre_apto: 'Torre 1 - Apto 1508', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1508') },
    { torre_apto: 'Torre 1 - Apto 1601', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1601') },
    { torre_apto: 'Torre 1 - Apto 1602', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1602') },
    { torre_apto: 'Torre 1 - Apto 1603', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1603') },
    { torre_apto: 'Torre 1 - Apto 1604', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1604') },
    { torre_apto: 'Torre 1 - Apto 1605', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1605') },
    { torre_apto: 'Torre 1 - Apto 1606', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1606') },
    { torre_apto: 'Torre 1 - Apto 1607', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1607') },
    { torre_apto: 'Torre 1 - Apto 1608', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1608') },
    { torre_apto: 'Torre 1 - Apto 1701', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1701') },
    { torre_apto: 'Torre 1 - Apto 1702', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1702') },
    { torre_apto: 'Torre 1 - Apto 1703', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1703') },
    { torre_apto: 'Torre 1 - Apto 1704', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1704') },
    { torre_apto: 'Torre 1 - Apto 1705', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1705') },
    { torre_apto: 'Torre 1 - Apto 1706', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1706') },
    { torre_apto: 'Torre 1 - Apto 1707', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1707') },
    { torre_apto: 'Torre 1 - Apto 1708', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1708') },
    { torre_apto: 'Torre 1 - Apto 1801', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1801') },
    { torre_apto: 'Torre 1 - Apto 1802', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1802') },
    { torre_apto: 'Torre 1 - Apto 1803', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1803') },
    { torre_apto: 'Torre 1 - Apto 1804', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1804') },
    { torre_apto: 'Torre 1 - Apto 1805', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1805') },
    { torre_apto: 'Torre 1 - Apto 1806', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1806') },
    { torre_apto: 'Torre 1 - Apto 1807', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1807') },
    { torre_apto: 'Torre 1 - Apto 1808', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1808') },
    { torre_apto: 'Torre 1 - Apto 1901', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1901') },
    { torre_apto: 'Torre 1 - Apto 1902', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1902') },
    { torre_apto: 'Torre 1 - Apto 1903', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1903') },
    { torre_apto: 'Torre 1 - Apto 1904', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1904') },
    { torre_apto: 'Torre 1 - Apto 1905', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1905') },
    { torre_apto: 'Torre 1 - Apto 1906', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1906') },
    { torre_apto: 'Torre 1 - Apto 1907', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 1907') },
    { torre_apto: 'Torre 1 - Apto 1908', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 1908') },
    { torre_apto: 'Torre 1 - Apto 2001', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2001') },
    { torre_apto: 'Torre 1 - Apto 2002', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2002') },
    { torre_apto: 'Torre 1 - Apto 2003', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2003') },
    { torre_apto: 'Torre 1 - Apto 2004', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2004') },
    { torre_apto: 'Torre 1 - Apto 2005', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2005') },
    { torre_apto: 'Torre 1 - Apto 2006', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2006') },
    { torre_apto: 'Torre 1 - Apto 2007', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2007') },
    { torre_apto: 'Torre 1 - Apto 2008', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2008') },
    { torre_apto: 'Torre 1 - Apto 2101', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2101') },
    { torre_apto: 'Torre 1 - Apto 2102', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2102') },
    { torre_apto: 'Torre 1 - Apto 2103', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2103') },
    { torre_apto: 'Torre 1 - Apto 2104', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2104') },
    { torre_apto: 'Torre 1 - Apto 2105', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2105') },
    { torre_apto: 'Torre 1 - Apto 2106', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2106') },
    { torre_apto: 'Torre 1 - Apto 2107', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2107') },
    { torre_apto: 'Torre 1 - Apto 2108', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2108') },
    { torre_apto: 'Torre 1 - Apto 2201', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2201') },
    { torre_apto: 'Torre 1 - Apto 2202', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2202') },
    { torre_apto: 'Torre 1 - Apto 2203', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2203') },
    { torre_apto: 'Torre 1 - Apto 2204', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2204') },
    { torre_apto: 'Torre 1 - Apto 2205', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2205') },
    { torre_apto: 'Torre 1 - Apto 2206', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2206') },
    { torre_apto: 'Torre 1 - Apto 2207', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2207') },
    { torre_apto: 'Torre 1 - Apto 2208', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2208') },
    { torre_apto: 'Torre 1 - Apto 2301', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2301') },
    { torre_apto: 'Torre 1 - Apto 2302', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2302') },
    { torre_apto: 'Torre 1 - Apto 2303', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2303') },
    { torre_apto: 'Torre 1 - Apto 2304', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2304') },
    { torre_apto: 'Torre 1 - Apto 2305', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2305') },
    { torre_apto: 'Torre 1 - Apto 2306', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2306') },
    { torre_apto: 'Torre 1 - Apto 2307', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2307') },
    { torre_apto: 'Torre 1 - Apto 2308', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 1 - Apto 2308') },
    { torre_apto: 'Torre 1 - Apto 2401', coeficiente: 0.002221834834520098, token: generarTokenSeguro('Torre 1 - Apto 2401') },
    { torre_apto: 'Torre 1 - Apto 2402', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2402') },
    { torre_apto: 'Torre 1 - Apto 2403', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2403') },
    { torre_apto: 'Torre 1 - Apto 2404', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2404') },
    { torre_apto: 'Torre 1 - Apto 2405', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2405') },
    { torre_apto: 'Torre 1 - Apto 2406', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2406') },
    { torre_apto: 'Torre 1 - Apto 2407', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 1 - Apto 2407') },
    { torre_apto: 'Torre 1 - Apto 2408', coeficiente: 0.002221834834520098, token: generarTokenSeguro('Torre 1 - Apto 2408') },

    // TORRE 2
    { torre_apto: 'Torre 2 - Apto 109', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 109') },
    { torre_apto: 'Torre 2 - Apto 110', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 110') },
    { torre_apto: 'Torre 2 - Apto 111', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 111') },
    { torre_apto: 'Torre 2 - Apto 112', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 112') },
    { torre_apto: 'Torre 2 - Apto 113', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 113') },
    { torre_apto: 'Torre 2 - Apto 114', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 114') },
    { torre_apto: 'Torre 2 - Apto 115', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 115') },
    { torre_apto: 'Torre 2 - Apto 116', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 116') },
    { torre_apto: 'Torre 2 - Apto 209', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 209') },
    { torre_apto: 'Torre 2 - Apto 210', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 210') },
    { torre_apto: 'Torre 2 - Apto 211', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 211') },
    { torre_apto: 'Torre 2 - Apto 212', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 212') },
    { torre_apto: 'Torre 2 - Apto 213', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 213') },
    { torre_apto: 'Torre 2 - Apto 214', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 214') },
    { torre_apto: 'Torre 2 - Apto 215', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 215') },
    { torre_apto: 'Torre 2 - Apto 216', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 216') },
    { torre_apto: 'Torre 2 - Apto 309', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 309') },
    { torre_apto: 'Torre 2 - Apto 310', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 310') },
    { torre_apto: 'Torre 2 - Apto 311', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 311') },
    { torre_apto: 'Torre 2 - Apto 312', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 312') },
    { torre_apto: 'Torre 2 - Apto 313', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 313') },
    { torre_apto: 'Torre 2 - Apto 314', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 314') },
    { torre_apto: 'Torre 2 - Apto 315', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 315') },
    { torre_apto: 'Torre 2 - Apto 316', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 316') },
    { torre_apto: 'Torre 2 - Apto 409', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 409') },
    { torre_apto: 'Torre 2 - Apto 410', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 410') },
    { torre_apto: 'Torre 2 - Apto 411', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 411') },
    { torre_apto: 'Torre 2 - Apto 412', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 412') },
    { torre_apto: 'Torre 2 - Apto 413', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 413') },
    { torre_apto: 'Torre 2 - Apto 414', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 414') },
    { torre_apto: 'Torre 2 - Apto 415', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 415') },
    { torre_apto: 'Torre 2 - Apto 416', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 416') },
    { torre_apto: 'Torre 2 - Apto 509', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 509') },
    { torre_apto: 'Torre 2 - Apto 510', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 510') },
    { torre_apto: 'Torre 2 - Apto 511', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 511') },
    { torre_apto: 'Torre 2 - Apto 512', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 512') },
    { torre_apto: 'Torre 2 - Apto 513', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 513') },
    { torre_apto: 'Torre 2 - Apto 514', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 514') },
    { torre_apto: 'Torre 2 - Apto 515', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 515') },
    { torre_apto: 'Torre 2 - Apto 516', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 516') },
    { torre_apto: 'Torre 2 - Apto 609', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 609') },
    { torre_apto: 'Torre 2 - Apto 610', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 610') },
    { torre_apto: 'Torre 2 - Apto 611', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 611') },
    { torre_apto: 'Torre 2 - Apto 612', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 612') },
    { torre_apto: 'Torre 2 - Apto 613', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 613') },
    { torre_apto: 'Torre 2 - Apto 614', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 614') },
    { torre_apto: 'Torre 2 - Apto 615', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 615') },
    { torre_apto: 'Torre 2 - Apto 616', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 616') },
    { torre_apto: 'Torre 2 - Apto 709', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 709') },
    { torre_apto: 'Torre 2 - Apto 710', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 710') },
    { torre_apto: 'Torre 2 - Apto 711', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 711') },
    { torre_apto: 'Torre 2 - Apto 712', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 712') },
    { torre_apto: 'Torre 2 - Apto 713', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 713') },
    { torre_apto: 'Torre 2 - Apto 714', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 714') },
    { torre_apto: 'Torre 2 - Apto 715', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 715') },
    { torre_apto: 'Torre 2 - Apto 716', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 716') },
    { torre_apto: 'Torre 2 - Apto 809', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 809') },
    { torre_apto: 'Torre 2 - Apto 810', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 810') },
    { torre_apto: 'Torre 2 - Apto 811', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 811') },
    { torre_apto: 'Torre 2 - Apto 812', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 812') },
    { torre_apto: 'Torre 2 - Apto 813', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 813') },
    { torre_apto: 'Torre 2 - Apto 814', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 814') },
    { torre_apto: 'Torre 2 - Apto 815', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 815') },
    { torre_apto: 'Torre 2 - Apto 816', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 816') },
    { torre_apto: 'Torre 2 - Apto 909', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 909') },
    { torre_apto: 'Torre 2 - Apto 910', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 910') },
    { torre_apto: 'Torre 2 - Apto 911', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 911') },
    { torre_apto: 'Torre 2 - Apto 912', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 912') },
    { torre_apto: 'Torre 2 - Apto 913', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 913') },
    { torre_apto: 'Torre 2 - Apto 914', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 914') },
    { torre_apto: 'Torre 2 - Apto 915', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 915') },
    { torre_apto: 'Torre 2 - Apto 916', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 916') },
    { torre_apto: 'Torre 2 - Apto 1009', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1009') },
    { torre_apto: 'Torre 2 - Apto 1010', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1010') },
    { torre_apto: 'Torre 2 - Apto 1011', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1011') },
    { torre_apto: 'Torre 2 - Apto 1012', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1012') },
    { torre_apto: 'Torre 2 - Apto 1013', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1013') },
    { torre_apto: 'Torre 2 - Apto 1014', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1014') },
    { torre_apto: 'Torre 2 - Apto 1015', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1015') },
    { torre_apto: 'Torre 2 - Apto 1016', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1016') },
    { torre_apto: 'Torre 2 - Apto 1109', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1109') },
    { torre_apto: 'Torre 2 - Apto 1110', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1110') },
    { torre_apto: 'Torre 2 - Apto 1111', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1111') },
    { torre_apto: 'Torre 2 - Apto 1112', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1112') },
    { torre_apto: 'Torre 2 - Apto 1113', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1113') },
    { torre_apto: 'Torre 2 - Apto 1114', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1114') },
    { torre_apto: 'Torre 2 - Apto 1115', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1115') },
    { torre_apto: 'Torre 2 - Apto 1116', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1116') },
    { torre_apto: 'Torre 2 - Apto 1209', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1209') },
    { torre_apto: 'Torre 2 - Apto 1210', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1210') },
    { torre_apto: 'Torre 2 - Apto 1211', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1211') },
    { torre_apto: 'Torre 2 - Apto 1212', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1212') },
    { torre_apto: 'Torre 2 - Apto 1213', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1213') },
    { torre_apto: 'Torre 2 - Apto 1214', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1214') },
    { torre_apto: 'Torre 2 - Apto 1215', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1215') },
    { torre_apto: 'Torre 2 - Apto 1216', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1216') },
    { torre_apto: 'Torre 2 - Apto 1309', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1309') },
    { torre_apto: 'Torre 2 - Apto 1310', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1310') },
    { torre_apto: 'Torre 2 - Apto 1311', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1311') },
    { torre_apto: 'Torre 2 - Apto 1312', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1312') },
    { torre_apto: 'Torre 2 - Apto 1313', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1313') },
    { torre_apto: 'Torre 2 - Apto 1314', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1314') },
    { torre_apto: 'Torre 2 - Apto 1315', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1315') },
    { torre_apto: 'Torre 2 - Apto 1316', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1316') },
    { torre_apto: 'Torre 2 - Apto 1409', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1409') },
    { torre_apto: 'Torre 2 - Apto 1410', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1410') },
    { torre_apto: 'Torre 2 - Apto 1411', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1411') },
    { torre_apto: 'Torre 2 - Apto 1412', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1412') },
    { torre_apto: 'Torre 2 - Apto 1413', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1413') },
    { torre_apto: 'Torre 2 - Apto 1414', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1414') },
    { torre_apto: 'Torre 2 - Apto 1415', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1415') },
    { torre_apto: 'Torre 2 - Apto 1416', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1416') },
    { torre_apto: 'Torre 2 - Apto 1509', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1509') },
    { torre_apto: 'Torre 2 - Apto 1510', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1510') },
    { torre_apto: 'Torre 2 - Apto 1511', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1511') },
    { torre_apto: 'Torre 2 - Apto 1512', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1512') },
    { torre_apto: 'Torre 2 - Apto 1513', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1513') },
    { torre_apto: 'Torre 2 - Apto 1514', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1514') },
    { torre_apto: 'Torre 2 - Apto 1515', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1515') },
    { torre_apto: 'Torre 2 - Apto 1516', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1516') },
    { torre_apto: 'Torre 2 - Apto 1609', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1609') },
    { torre_apto: 'Torre 2 - Apto 1610', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1610') },
    { torre_apto: 'Torre 2 - Apto 1611', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1611') },
    { torre_apto: 'Torre 2 - Apto 1612', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1612') },
    { torre_apto: 'Torre 2 - Apto 1613', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1613') },
    { torre_apto: 'Torre 2 - Apto 1614', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1614') },
    { torre_apto: 'Torre 2 - Apto 1615', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1615') },
    { torre_apto: 'Torre 2 - Apto 1616', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1616') },
    { torre_apto: 'Torre 2 - Apto 1709', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1709') },
    { torre_apto: 'Torre 2 - Apto 1710', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1710') },
    { torre_apto: 'Torre 2 - Apto 1711', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1711') },
    { torre_apto: 'Torre 2 - Apto 1712', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1712') },
    { torre_apto: 'Torre 2 - Apto 1713', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1713') },
    { torre_apto: 'Torre 2 - Apto 1714', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1714') },
    { torre_apto: 'Torre 2 - Apto 1715', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1715') },
    { torre_apto: 'Torre 2 - Apto 1716', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1716') },
    { torre_apto: 'Torre 2 - Apto 1809', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1809') },
    { torre_apto: 'Torre 2 - Apto 1810', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1810') },
    { torre_apto: 'Torre 2 - Apto 1811', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1811') },
    { torre_apto: 'Torre 2 - Apto 1812', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1812') },
    { torre_apto: 'Torre 2 - Apto 1813', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1813') },
    { torre_apto: 'Torre 2 - Apto 1814', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1814') },
    { torre_apto: 'Torre 2 - Apto 1815', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1815') },
    { torre_apto: 'Torre 2 - Apto 1816', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1816') },
    { torre_apto: 'Torre 2 - Apto 1909', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1909') },
    { torre_apto: 'Torre 2 - Apto 1910', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1910') },
    { torre_apto: 'Torre 2 - Apto 1911', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1911') },
    { torre_apto: 'Torre 2 - Apto 1912', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1912') },
    { torre_apto: 'Torre 2 - Apto 1913', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1913') },
    { torre_apto: 'Torre 2 - Apto 1914', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1914') },
    { torre_apto: 'Torre 2 - Apto 1915', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 1915') },
    { torre_apto: 'Torre 2 - Apto 1916', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 1916') },
    { torre_apto: 'Torre 2 - Apto 2009', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 2009') },
    { torre_apto: 'Torre 2 - Apto 2010', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2010') },
    { torre_apto: 'Torre 2 - Apto 2011', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2011') },
    { torre_apto: 'Torre 2 - Apto 2012', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2012') },
    { torre_apto: 'Torre 2 - Apto 2013', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2013') },
    { torre_apto: 'Torre 2 - Apto 2014', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2014') },
    { torre_apto: 'Torre 2 - Apto 2015', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2015') },
    { torre_apto: 'Torre 2 - Apto 2016', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 2016') },
    { torre_apto: 'Torre 2 - Apto 2109', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 2109') },
    { torre_apto: 'Torre 2 - Apto 2110', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2110') },
    { torre_apto: 'Torre 2 - Apto 2111', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2111') },
    { torre_apto: 'Torre 2 - Apto 2112', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2112') },
    { torre_apto: 'Torre 2 - Apto 2113', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2113') },
    { torre_apto: 'Torre 2 - Apto 2114', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2114') },
    { torre_apto: 'Torre 2 - Apto 2115', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2115') },
    { torre_apto: 'Torre 2 - Apto 2116', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 2116') },
    { torre_apto: 'Torre 2 - Apto 2209', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 2209') },
    { torre_apto: 'Torre 2 - Apto 2210', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2210') },
    { torre_apto: 'Torre 2 - Apto 2211', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2211') },
    { torre_apto: 'Torre 2 - Apto 2212', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2212') },
    { torre_apto: 'Torre 2 - Apto 2213', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2213') },
    { torre_apto: 'Torre 2 - Apto 2214', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2214') },
    { torre_apto: 'Torre 2 - Apto 2215', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2215') },
    { torre_apto: 'Torre 2 - Apto 2216', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 2216') },
    { torre_apto: 'Torre 2 - Apto 2309', coeficiente: 0.002269426483201756, token: generarTokenSeguro('Torre 2 - Apto 2309') },
    { torre_apto: 'Torre 2 - Apto 2310', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2310') },
    { torre_apto: 'Torre 2 - Apto 2311', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2311') },
    { torre_apto: 'Torre 2 - Apto 2312', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2312') },
    { torre_apto: 'Torre 2 - Apto 2313', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2313') },
    { torre_apto: 'Torre 2 - Apto 2314', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2314') },
    { torre_apto: 'Torre 2 - Apto 2315', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2315') },
    { torre_apto: 'Torre 2 - Apto 2316', coeficiente: 0.002221834834520098, token: generarTokenSeguro('Torre 2 - Apto 2316') },
    { torre_apto: 'Torre 2 - Apto 2409', coeficiente: 0.002221834834520098, token: generarTokenSeguro('Torre 2 - Apto 2409') },
    { torre_apto: 'Torre 2 - Apto 2410', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2410') },
    { torre_apto: 'Torre 2 - Apto 2411', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2411') },
    { torre_apto: 'Torre 2 - Apto 2412', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2412') },
    { torre_apto: 'Torre 2 - Apto 2413', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2413') },
    { torre_apto: 'Torre 2 - Apto 2414', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2414') },
    { torre_apto: 'Torre 2 - Apto 2415', coeficiente: 0.002727161890746691, token: generarTokenSeguro('Torre 2 - Apto 2415') },
    { torre_apto: 'Torre 2 - Apto 2416', coeficiente: 0.002221834834520098, token: generarTokenSeguro('Torre 2 - Apto 2416') }
];

// INICIALIZACIÓN Y MIGRACIÓN AUTOMÁTICA DE BASE DE DATOS
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS apoderados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT,
        token TEXT UNIQUE NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS unidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        torre_apto TEXT NOT NULL,
        coeficiente REAL NOT NULL,
        token TEXT UNIQUE NOT NULL,
        registrado INTEGER DEFAULT 0,
        apoderado_id INTEGER
    )`, () => {
        db.run(`ALTER TABLE unidades ADD COLUMN apoderado_id INTEGER`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS preguntas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        estado TEXT DEFAULT 'inactiva'
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

    // Inserción de los 384 apartamentos con sus coeficientes exactos
    db.get(`SELECT COUNT(*) as count FROM unidades`, (err, row) => {
        if (!row || row.count === 0) {
            const stmt = db.prepare(`INSERT INTO unidades (torre_apto, coeficiente, token, registrado) VALUES (?, ?, ?, 0)`);
            UNIDADES_REALES.forEach(u => stmt.run(u.torre_apto, u.coeficiente, u.token));
            stmt.finalize();

            db.run(`INSERT INTO preguntas (titulo, estado) VALUES ('¿Aprueba el presupuesto para la vigencia 2026?', 'inactiva')`);
            db.run(`INSERT INTO preguntas (titulo, estado) VALUES ('¿Aprueba la elección del Consejo de Administración?', 'inactiva')`);
            console.log('384 apartamentos inicializados correctamente.');
        }
    });
});

// Resolver representación para un token de apartamento o apoderado.
async function resolverRepresentacion(token) {
    if (typeof token !== 'string' || token.length === 0) return null;

    const apoderado = await dbGet(`SELECT * FROM apoderados WHERE token = ?`, [token]);
    if (apoderado) {
        const unidades = await dbAll(`SELECT * FROM unidades WHERE apoderado_id = ?`, [apoderado.id]);
        if (unidades.length === 0) return null;
        const coefTotal = unidades.reduce((acc, unidad) => acc + unidad.coeficiente, 0);
        const desc = `Apoderado: ${apoderado.nombre} (${unidades.map(unidad => unidad.torre_apto).join(' + ')})`;
        return { esApoderado: true, apoderado, unidades, coefTotal, desc };
    }

    const unidad = await dbGet(`SELECT * FROM unidades WHERE token = ?`, [token]);
    if (!unidad) return null;
    if (!unidad.apoderado_id) {
        return { esApoderado: false, unidades: [unidad], coefTotal: unidad.coeficiente, desc: unidad.torre_apto };
    }

    const apoderadoAsignado = await dbGet(`SELECT * FROM apoderados WHERE id = ?`, [unidad.apoderado_id]);
    if (!apoderadoAsignado) return null;
    const unidades = await dbAll(`SELECT * FROM unidades WHERE apoderado_id = ?`, [unidad.apoderado_id]);
    if (unidades.length === 0) return null;
    const coefTotal = unidades.reduce((acc, representada) => acc + representada.coeficiente, 0);
    const desc = `Apoderado: ${apoderadoAsignado.nombre} (${unidades.map(representada => representada.torre_apto).join(' + ')})`;
    return { esApoderado: true, apoderado: apoderadoAsignado, unidades, coefTotal, desc };
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Registrar Propietario o Apoderado con Múltiples Poderes
app.post('/api/registro/consultar', async (req, res) => {
    const { esApoderado, nombrePersona, telefono, unidadesList } = req.body || {};
    if (typeof esApoderado !== 'boolean' || !Array.isArray(unidadesList) || unidadesList.length === 0 || unidadesList.length > 384) {
        return res.status(400).json({ error: 'Proporcione una lista válida de inmuebles.' });
    }
    if (nombrePersona !== undefined && typeof nombrePersona !== 'string') {
        return res.status(400).json({ error: 'El nombre debe ser texto.' });
    }
    if (telefono !== undefined && typeof telefono !== 'string') {
        return res.status(400).json({ error: 'El teléfono debe ser texto.' });
    }

    const nombreApoderado = typeof nombrePersona === 'string' ? nombrePersona.trim() : '';
    const telefonoLimpio = typeof telefono === 'string' ? telefono.trim() : '';
    if (nombreApoderado.length > 200 || telefonoLimpio.length > 30) {
        return res.status(400).json({ error: 'El nombre o teléfono excede el máximo permitido.' });
    }
    if (esApoderado && !nombreApoderado) {
        return res.status(400).json({ error: 'Indique el nombre completo del apoderado.' });
    }

    const nombresBuscados = [];
    for (const inmueble of unidadesList) {
        const torre = String(inmueble?.torre ?? '').trim();
        const apartamento = String(inmueble?.apartamento ?? '').trim();
        if (!['1', '2'].includes(torre) || !/^\d{3,4}$/.test(apartamento)) {
            return res.status(400).json({ error: 'Cada inmueble debe indicar una torre y un número de apartamento válidos.' });
        }
        nombresBuscados.push(`Torre ${torre} - Apto ${apartamento}`);
    }
    if (new Set(nombresBuscados).size !== nombresBuscados.length) {
        return res.status(400).json({ error: 'La lista contiene apartamentos repetidos.' });
    }

    try {
        const resultado = await withTransaction(async () => {
            const placeholders = nombresBuscados.map(() => '?').join(',');
            const encontrados = await dbAll(
                `SELECT * FROM unidades WHERE torre_apto IN (${placeholders})`,
                nombresBuscados
            );
            if (encontrados.length !== nombresBuscados.length) {
                throw requestError(404, 'Uno o más apartamentos no existen en la torre seleccionada. Revise torre y apartamento.');
            }

            const porNombre = new Map(encontrados.map(unidad => [unidad.torre_apto, unidad]));
            const unidades = nombresBuscados.map(nombre => porNombre.get(nombre));
            if (unidades.some(unidad => !unidad)) {
                throw requestError(404, 'No se encontraron exactamente los apartamentos solicitados.');
            }
            if (unidades.some(unidad => Number(unidad.registrado) === 1 || unidad.apoderado_id !== null)) {
                throw requestError(409, 'Uno o más apartamentos ya están registrados o asignados a un apoderado.');
            }

            const usaApoderado = esApoderado || unidades.length > 1;
            const baseUrl = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
            let targetUrl;
            let whatsappUrl = null;
            let respuesta;

            if (usaApoderado) {
                const nombre = nombreApoderado || 'Apoderado';
                const token = crypto.randomBytes(32).toString('hex');
                const insertado = await dbRun(
                    `INSERT INTO apoderados (nombre, telefono, token) VALUES (?, ?, ?)`,
                    [nombre, telefonoLimpio, token]
                );
                const ids = unidades.map(unidad => unidad.id);
                const idsPlaceholders = ids.map(() => '?').join(',');
                const actualizacion = await dbRun(
                    `UPDATE unidades SET registrado = 1, apoderado_id = ? WHERE id IN (${idsPlaceholders}) AND registrado = 0 AND apoderado_id IS NULL`,
                    [insertado.lastID, ...ids]
                );
                if (actualizacion.changes !== ids.length) {
                    throw requestError(409, 'Uno o más apartamentos dejaron de estar disponibles.');
                }

                targetUrl = `${baseUrl}/?token=${encodeURIComponent(token)}`;
                const listaAptosTxt = unidades.map(unidad => unidad.torre_apto).join(', ');
                if (telefonoLimpio) {
                    let numero = telefonoLimpio.replace(/\D/g, '');
                    if (numero.length === 10) numero = `57${numero}`;
                    const mensaje = `¡Hola ${nombre}! Registro con (${unidades.length}) inmueble(s) [${listaAptosTxt}] para la Asamblea Reserva Serrat Selva.\n\nAcceda a votar aquí:\n${targetUrl}`;
                    whatsappUrl = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
                }
                respuesta = {
                    success: true,
                    esApoderado: true,
                    nombrePersona: nombre,
                    unidadesRepresentadas: unidades
                };
            } else {
                const unidad = unidades[0];
                const actualizacion = await dbRun(
                    `UPDATE unidades SET registrado = 1 WHERE id = ? AND registrado = 0 AND apoderado_id IS NULL`,
                    [unidad.id]
                );
                if (actualizacion.changes !== 1) {
                    throw requestError(409, 'El apartamento ya está registrado o asignado a un apoderado.');
                }

                targetUrl = `${baseUrl}/?token=${encodeURIComponent(unidad.token)}`;
                if (telefonoLimpio) {
                    let numero = telefonoLimpio.replace(/\D/g, '');
                    if (numero.length === 10) numero = `57${numero}`;
                    const mensaje = `¡Hola! Registro exitoso para ${unidad.torre_apto} en la Asamblea Reserva Serrat Selva.\n\nAcceda a su votación aquí:\n${targetUrl}`;
                    whatsappUrl = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
                }
                respuesta = { success: true, esApoderado: false, unidad };
            }

            const qrImage = await QRCode.toDataURL(targetUrl, {
                width: 320,
                margin: 2,
                color: { dark: '#1E6B39', light: '#FFFFFF' }
            });
            return { ...respuesta, targetUrl, qrImage, whatsappUrl };
        });
        return res.json(resultado);
    } catch (err) {
        console.error('Error al registrar inmuebles:', err.message);
        return res.status(err.status || 500).json({
            error: err.status ? err.message : 'Error interno al registrar los inmuebles.'
        });
    }
});

// Consultar Estado Actual para Votación
app.get('/api/estado-actual/:token', async (req, res) => {
    try {
        const rep = await resolverRepresentacion(req.params.token);
        if (!rep) return res.status(404).json({ error: 'Token inválido o no encontrado.' });

        const pregunta = await dbGet(`SELECT * FROM preguntas WHERE estado = 'activa'`);
        if (!pregunta) {
            return res.json({
                unidad: { torre_apto: rep.desc, coeficiente: rep.coefTotal },
                preguntaActiva: null,
                yaVoto: false
            });
        }

        const unitIds = rep.unidades.map(unidad => unidad.id);
        const placeholders = unitIds.map(() => '?').join(',');
        const vRow = await dbGet(
            `SELECT COUNT(*) as vcount FROM votos WHERE pregunta_id = ? AND unidad_id IN (${placeholders})`,
            [pregunta.id, ...unitIds]
        );
        return res.json({
            unidad: { torre_apto: rep.desc, coeficiente: rep.coefTotal },
            preguntaActiva: pregunta,
            yaVoto: vRow.vcount > 0
        });
    } catch (err) {
        console.error('Error al consultar estado de votación:', err.message);
        return res.status(500).json({ error: 'No se pudo consultar el estado de votación.' });
    }
});

// Emitir Voto
app.post('/api/votar', async (req, res) => {
    const { token, opcion } = req.body || {};
    if (typeof token !== 'string' || !['SÍ', 'NO', 'BLANCO'].includes(opcion)) {
        return res.status(400).json({ error: 'Token u opción de voto no válidos.' });
    }

    try {
        const rep = await resolverRepresentacion(token);
        if (!rep) return res.status(404).json({ error: 'Token inválido.' });

        const resultado = await withTransaction(async () => {
            const pregunta = await dbGet(`SELECT * FROM preguntas WHERE estado = 'activa'`);
            if (!pregunta) throw requestError(400, 'No hay ninguna votación activa en este momento.');

            const unitIds = rep.unidades.map(unidad => unidad.id);
            const placeholders = unitIds.map(() => '?').join(',');
            const existente = await dbGet(
                `SELECT COUNT(*) as vcount FROM votos WHERE pregunta_id = ? AND unidad_id IN (${placeholders})`,
                [pregunta.id, ...unitIds]
            );
            if (existente.vcount > 0) {
                throw requestError(409, 'Uno o más inmuebles de esta representación ya votaron esta pregunta.');
            }

            for (const unidad of rep.unidades) {
                const hash = crypto.randomBytes(32).toString('hex');
                await dbRun(
                    `INSERT INTO votos (pregunta_id, unidad_id, opcion, coeficiente, hash_seguridad) VALUES (?, ?, ?, ?, ?)`,
                    [pregunta.id, unidad.id, opcion, unidad.coeficiente, hash]
                );
            }
            return { success: true, totalInmueblesVotados: rep.unidades.length };
        });
        return res.json(resultado);
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Uno o más inmuebles de esta representación ya votaron esta pregunta.' });
        }
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('Error al guardar el voto:', err.message);
        return res.status(500).json({ error: 'No se pudo registrar el voto.' });
    }
});

// Quórum y Asistencia Global (Suma Exacta por Poderes)
app.get('/api/quorum-global', (req, res) => {
    db.get(`SELECT SUM(CASE WHEN registrado = 1 THEN coeficiente ELSE 0 END) as quorum_registrado,
                   COUNT(CASE WHEN registrado = 1 THEN 1 END) as total_registrados,
                   COUNT(*) as total_unidades FROM unidades`, [], (err, row) => {
        if (err) return res.status(500).json({ error: 'Error al calcular quórum.' });
        res.json({
            quorumRegistrado: row.quorum_registrado || 0,
            totalRegistrados: row.total_registrados || 0,
            totalUnidades: row.total_unidades || 384
        });
    });
});

// Resultados de Preguntas
app.get('/api/resultados-todos', (req, res) => {
    db.all(`SELECT * FROM preguntas ORDER BY CASE estado WHEN 'activa' THEN 1 WHEN 'finalizada' THEN 2 ELSE 3 END ASC, id DESC`, [], (err, preguntas) => {
        if (err || !preguntas || preguntas.length === 0) return res.json([]);

        const promesas = preguntas.map(pregunta => {
            return new Promise((resolve) => {
                db.all(`SELECT opcion, SUM(coeficiente) as total_coeficiente, COUNT(*) as total_votos FROM votos WHERE pregunta_id = ? GROUP BY opcion`, [pregunta.id], (err, rows) => {
                    db.get(`SELECT SUM(coeficiente) as quorum FROM votos WHERE pregunta_id = ?`, [pregunta.id], (err, qRow) => {
                        resolve({ pregunta, quorum: qRow ? qRow.quorum || 0 : 0, resultados: rows || [] });
                    });
                });
            });
        });

        Promise.all(promesas).then(resultados => res.json(resultados));
    });
});

// ADMIN ENDPOINTS
app.get('/api/admin/preguntas', async (req, res) => {
    try {
        return res.json(await dbAll(`SELECT * FROM preguntas ORDER BY id DESC`));
    } catch (err) {
        console.error('Error al consultar preguntas:', err.message);
        return res.status(500).json({ error: 'No se pudieron consultar las preguntas.' });
    }
});

app.post('/api/admin/crear-pregunta', async (req, res) => {
    const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
    if (!titulo || titulo.length > 500) return res.status(400).json({ error: 'El título es obligatorio y debe tener máximo 500 caracteres.' });
    try {
        const resultado = await dbRun(`INSERT INTO preguntas (titulo, estado) VALUES (?, 'inactiva')`, [titulo]);
        return res.json({ success: true, id: resultado.lastID });
    } catch (err) {
        console.error('Error al crear pregunta:', err.message);
        return res.status(500).json({ error: 'No se pudo crear la pregunta.' });
    }
});

app.post('/api/admin/editar-pregunta', async (req, res) => {
    const titulo = typeof req.body?.titulo === 'string' ? req.body.titulo.trim() : '';
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id < 1 || !titulo || titulo.length > 500) {
        return res.status(400).json({ error: 'Indique un ID y un título válidos.' });
    }
    try {
        const resultado = await dbRun(`UPDATE preguntas SET titulo = ? WHERE id = ?`, [titulo, id]);
        if (resultado.changes === 0) return res.status(404).json({ error: 'Pregunta no encontrada.' });
        return res.json({ success: true });
    } catch (err) {
        console.error('Error al editar pregunta:', err.message);
        return res.status(500).json({ error: 'No se pudo editar la pregunta.' });
    }
});

app.post('/api/admin/borrar-pregunta', async (req, res) => {
    const id = Number(req.body?.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Indique un ID de pregunta válido.' });
    try {
        await withTransaction(async () => {
            const pregunta = await dbGet(`SELECT id FROM preguntas WHERE id = ?`, [id]);
            if (!pregunta) throw requestError(404, 'Pregunta no encontrada.');
            await dbRun(`DELETE FROM votos WHERE pregunta_id = ?`, [id]);
            await dbRun(`DELETE FROM preguntas WHERE id = ?`, [id]);
        });
        return res.json({ success: true });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('Error al borrar pregunta:', err.message);
        return res.status(500).json({ error: 'No se pudo borrar la pregunta.' });
    }
});

app.post('/api/admin/cambiar-estado', async (req, res) => {
    const id = Number(req.body?.id);
    const estado = req.body?.estado;
    if (!Number.isInteger(id) || id < 1 || !['activa', 'inactiva', 'finalizada'].includes(estado)) {
        return res.status(400).json({ error: 'Indique un ID y un estado válidos.' });
    }
    try {
        await withTransaction(async () => {
            const pregunta = await dbGet(`SELECT id FROM preguntas WHERE id = ?`, [id]);
            if (!pregunta) throw requestError(404, 'Pregunta no encontrada.');
            if (estado === 'activa') {
                await dbRun(`UPDATE preguntas SET estado = 'finalizada' WHERE estado = 'activa'`);
            }
            await dbRun(`UPDATE preguntas SET estado = ? WHERE id = ?`, [estado, id]);
        });
        return res.json({ success: true });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('Error al cambiar estado de pregunta:', err.message);
        return res.status(500).json({ error: 'No se pudo cambiar el estado de la pregunta.' });
    }
});

// ==========================================
// FRONTEND 0: MESA DE REGISTRO UNIFICADA (/registro)
// ==========================================
app.get('/registro', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mesa de Registro - Reserva Serrat Selva</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                theme: { extend: { colors: { serrat: { green: '#1E6B39', teal: '#2B7067', yellow: '#D9A21B', orange: '#D86B27' } } } }
            }
        </script>
    </head>
    <body class="bg-emerald-50/40 min-h-screen flex flex-col justify-between font-sans">
        <header class="bg-serrat-green text-white p-4 shadow-lg border-b-4 border-serrat-yellow">
            <div class="max-w-md mx-auto text-center">
                <h1 class="font-black text-xl tracking-wide uppercase">RESERVA SERRAT SELVA</h1>
                <p class="text-xs text-emerald-100 font-medium tracking-widest uppercase">Mesa de Entrada &bull; Registro de Asistencia</p>
            </div>
        </header>

        <main class="max-w-md mx-auto p-4 w-full flex-grow flex items-center">
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 w-full">
                <h2 class="text-sm font-bold text-slate-800 uppercase mb-4 border-b pb-2">Registro de Inmuebles</h2>

                <!-- Inmueble Principal -->
                <div class="space-y-4">
                    <div id="lista-inmuebles" class="space-y-3">
                        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 fila-inmueble">
                            <label class="block text-[11px] font-bold text-slate-600 uppercase mb-1">Inmueble 1 (Principal)</label>
                            <div class="flex gap-2">
                                <select class="w-1/3 border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white sel-torre">
                                    <option value="1">Torre 1</option>
                                    <option value="2">Torre 2</option>
                                </select>
                                <input type="text" placeholder="Apto (Ej: 101)" class="w-2/3 border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white txt-apto">
                            </div>
                        </div>
                    </div>

                    <!-- Casilla para Apoderados y Poderes Adicionales -->
                    <div class="pt-2">
                        <label class="flex items-center gap-2 cursor-pointer p-3 bg-emerald-50 rounded-xl border border-emerald-200 hover:bg-emerald-100/60 transition">
                            <input type="checkbox" id="chk-apoderado" onchange="toggleApoderado(this.checked)" class="w-4 h-4 text-serrat-green rounded border-slate-300 focus:ring-serrat-green">
                            <span class="text-xs font-bold text-serrat-green uppercase">➕ ¿Tiene apoderados o representa más apartamentos con poder?</span>
                        </label>
                    </div>

                    <!-- Sección dinámica de apoderados -->
                    <div id="sec-apoderado-extra" class="hidden space-y-3 pt-2 border-t border-slate-100">
                        <div>
                            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Nombre Completo del Apoderado</label>
                            <input type="text" id="txt-nombre-persona" placeholder="Nombre completo del apoderado" class="w-full border border-slate-300 rounded-xl p-3 text-sm font-semibold bg-slate-50">
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Poderes / Inmuebles Adicionales</label>
                            <button type="button" onclick="agregarFilaInmueble()" class="w-full py-2.5 px-3 bg-serrat-teal text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition">
                                🏢 + Adicionar otra Torre y Apto
                            </button>
                        </div>
                    </div>

                    <!-- Teléfono opcional -->
                    <div class="pt-2">
                        <label class="block text-xs font-bold text-slate-700 uppercase mb-1">Teléfono / WhatsApp (Opcional)</label>
                        <input type="tel" id="txt-telefono" placeholder="Ej: 3001234567" class="w-full border border-slate-300 rounded-xl p-3 text-sm font-semibold bg-slate-50">
                    </div>

                    <button onclick="procesarRegistro()" class="w-full bg-serrat-green text-white font-bold p-3.5 rounded-xl shadow-sm hover:bg-emerald-800 transition text-sm mt-3">
                        📱 Generar Acceso y Código QR
                    </button>
                </div>

                <!-- Resultado del Registro -->
                <div id="resultado-registro" class="hidden mt-6 pt-5 border-t border-slate-100 text-center">
                    <div class="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-200">
                        <span class="text-xs font-bold text-serrat-teal uppercase tracking-wider block mb-1">Registro Exitoso</span>
                        <h3 id="res-unidad" class="text-base font-black text-slate-900 mb-3">-</h3>
                        <div class="bg-white p-3 rounded-xl inline-block shadow-md border border-emerald-100 mb-3">
                            <img id="img-qr" src="" alt="Código QR" class="w-52 h-52 mx-auto">
                        </div>
                        <div>
                            <a id="btn-ingresar" href="#" target="_blank" class="block w-full bg-serrat-teal hover:bg-emerald-800 text-white text-xs font-bold py-2.5 rounded-lg mb-2">Abrir Papeleta Digital ↗</a>
                            <a id="btn-whatsapp" href="#" target="_blank" class="hidden w-full bg-[#25D366] text-white text-xs font-bold py-3 rounded-xl shadow-sm">💬 Enviar Papeleta por WhatsApp</a>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <script>
            let numInmuebles = 1;

            function toggleApoderado(activo) {
                document.getElementById('sec-apoderado-extra').classList.toggle('hidden', !activo);
                if (activo && document.querySelectorAll('.fila-inmueble').length === 1) {
                    agregarFilaInmueble();
                }
            }

            function agregarFilaInmueble() {
                numInmuebles++;
                const contenedor = document.getElementById('lista-inmuebles');
                const div = document.createElement('div');
                div.className = 'p-3 bg-slate-50 rounded-xl border border-slate-200 fila-inmueble relative';
                div.innerHTML = \`
                    <div class="flex justify-between items-center mb-1">
                        <label class="block text-[11px] font-bold text-slate-600 uppercase">Inmueble / Poder \${numInmuebles}</label>
                        <button type="button" onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold text-xs hover:underline">Eliminar</button>
                    </div>
                    <div class="flex gap-2">
                        <select class="w-1/3 border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white sel-torre">
                            <option value="1">Torre 1</option>
                            <option value="2">Torre 2</option>
                        </select>
                        <input type="text" placeholder="Apto (Ej: 101)" class="w-2/3 border border-slate-300 rounded-lg p-2 text-xs font-semibold bg-white txt-apto">
                    </div>
                \`;
                contenedor.appendChild(div);
            }

            async function procesarRegistro() {
                const esApoderado = document.getElementById('chk-apoderado').checked;
                const nombrePersona = document.getElementById('txt-nombre-persona').value.trim();
                const telefono = document.getElementById('txt-telefono').value.trim();

                const filas = document.querySelectorAll('.fila-inmueble');
                const unidadesIngresadas = Array.from(filas).map(f => ({
                    torre: f.querySelector('.sel-torre').value,
                    apartamento: f.querySelector('.txt-apto').value.trim()
                }));
                const unidadIncompleta = unidadesIngresadas.some(u => u.apartamento !== '' && !/^\d{3,4}$/.test(u.apartamento));
                if (unidadIncompleta) {
                    return alert('Revise cada inmueble: seleccione la torre e indique un apartamento válido de 3 o 4 dígitos.');
                }
                const unidadesList = unidadesIngresadas.filter(u => u.apartamento !== '');

                const clavesUnidades = unidadesList.map(u => \`\${u.torre}-\${u.apartamento}\`);
                if (new Set(clavesUnidades).size !== clavesUnidades.length) {
                    return alert('La lista contiene apartamentos repetidos.');
                }

                if (unidadesList.length === 0) {
                    return alert('Por favor ingrese al menos un número de apartamento.');
                }

                if (esApoderado && !nombrePersona) {
                    return alert('Por favor ingrese el nombre completo del apoderado.');
                }

                try {
                    const res = await fetch('/api/registro/consultar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            esApoderado,
                            nombrePersona,
                            telefono,
                            unidadesList,
                            host: window.location.origin
                        })
                    });

                    const data = await res.json();
                    if (!res.ok) return alert(data.error);

                    document.getElementById('res-unidad').innerText = data.esApoderado 
                        ? \`Apoderado: \${data.nombrePersona} (\${data.unidadesRepresentadas.length} inmueble/poderes)\` 
                        : data.unidad.torre_apto;

                    document.getElementById('img-qr').src = data.qrImage;
                    document.getElementById('btn-ingresar').href = data.targetUrl;

                    const btnWA = document.getElementById('btn-whatsapp');
                    if (data.whatsappUrl) {
                        btnWA.href = data.whatsappUrl;
                        btnWA.classList.remove('hidden');
                    } else {
                        btnWA.classList.add('hidden');
                    }

                    document.getElementById('resultado-registro').classList.remove('hidden');
                } catch (e) {
                    alert('Error de conexión.');
                }
            }
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// FRONTEND 1: PANTALLA DE VOTACIÓN UNIFICADA (/)
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
                theme: { extend: { colors: { serrat: { green: '#1E6B39', teal: '#2B7067', yellow: '#D9A21B', orange: '#D86B27' } } } }
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
            </div>
        </header>

        <main class="max-w-xl mx-auto p-4 w-full flex-grow">
            <div id="info-inmueble" class="bg-white rounded-2xl p-5 shadow-sm mb-5 border-l-4 border-serrat-teal border border-slate-100">
                <p class="text-xs text-serrat-teal font-bold uppercase tracking-wider">Acreditación:</p>
                <h2 id="txt-unidad" class="text-lg font-black text-slate-800">Cargando...</h2>
                <div class="flex justify-between items-center mt-3 pt-2 border-t border-slate-100 text-sm text-slate-600">
                    <span class="font-medium">Coeficiente Representado:</span>
                    <strong id="txt-coeficiente" class="text-serrat-green font-mono font-bold text-base">-</strong>
                </div>
            </div>

            <div id="contenido-dinamico" class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
                <p class="text-slate-500">Cargando estado de la asamblea...</p>
            </div>
        </main>

        <footer class="bg-white border-t border-emerald-100 text-center p-4 text-xs text-slate-500">
            <strong>Reserva Serrat Selva</strong> &bull; Votación Ponderada Digital
        </footer>

        <script>
            let tokenActual = '';

            window.onload = function() {
                const urlParams = new URLSearchParams(window.location.search);
                tokenActual = urlParams.get('token');
                if (!tokenActual) {
                    document.getElementById('contenido-dinamico').innerHTML = '<div class="py-6 text-red-600 font-bold">Falta el token de acceso. Solicítelo en la mesa de registro.</div>';
                    return;
                }
                verificarEstado();
                setInterval(verificarEstado, 3000);
            };

            async function verificarEstado() {
                try {
                    const res = await fetch(\`/api/estado-actual/\${tokenActual}\`);
                    const data = await res.json();
                    if (!res.ok) {
                        document.getElementById('contenido-dinamico').innerHTML = \`<div class="py-6 text-red-600 font-bold">\${data.error || 'Token inválido'}</div>\`;
                        return;
                    }

                    document.getElementById('txt-unidad').innerText = data.unidad.torre_apto;
                    document.getElementById('txt-coeficiente').innerText = (data.unidad.coeficiente * 100).toFixed(2) + '%';

                    const contenedor = document.getElementById('contenido-dinamico');

                    if (!data.preguntaActiva) {
                        contenedor.innerHTML = '<div class="py-8"><h3 class="text-lg font-bold text-slate-800">Esperando que se active la siguiente pregunta...</h3></div>';
                        return;
                    }

                    if (data.yaVoto) {
                        contenedor.innerHTML = '<div class="py-6"><h3 class="text-lg font-bold text-emerald-700">✅ ¡Su voto ha sido registrado exitosamente!</h3><p class="text-xs text-slate-500 mt-2">Espere a que el moderador presente la siguiente pregunta.</p></div>';
                        return;
                    }

                    contenedor.innerHTML = \`
                        <h3 class="text-base font-bold text-slate-900 mb-4 text-left border-b pb-2">\${data.preguntaActiva.titulo}</h3>
                        <div class="space-y-3 text-left">
                            <button onclick="emitirVoto('SÍ')" class="w-full p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 text-serrat-green font-black text-lg hover:bg-emerald-100 transition">🟢 SÍ (Aprobar)</button>
                            <button onclick="emitirVoto('NO')" class="w-full p-4 rounded-xl border-2 border-orange-300 bg-orange-50 text-serrat-orange font-black text-lg hover:bg-orange-100 transition">🔴 NO (Negar)</button>
                            <button onclick="emitirVoto('BLANCO')" class="w-full p-4 rounded-xl border-2 border-slate-300 bg-slate-50 text-slate-700 font-black text-lg hover:bg-slate-100 transition">⚪ VOTO EN BLANCO</button>
                        </div>
                    \`;
                } catch (e) { console.error(e); }
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
                    if (!res.ok) alert(data.error);
                    verificarEstado();
                } catch (e) {
                    alert('Error al enviar la votación.');
                }
            }
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// FRONTEND 2: TABLERO DE ADMINISTRACIÓN (/admin)
// ==========================================
app.get('/admin', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Administración Asamblea - Reserva Serrat Selva</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                theme: { extend: { colors: { serrat: { green: '#1E6B39', teal: '#2B7067', yellow: '#D9A21B', orange: '#D86B27' } } } }
            }
        </script>
    </head>
    <body class="bg-slate-100 min-h-screen font-sans">
        <header class="bg-slate-900 text-white p-4 shadow-md border-b-4 border-serrat-yellow">
            <div class="max-w-4xl mx-auto flex justify-between items-center">
                <h1 class="font-black text-lg uppercase tracking-wide">Panel de Control &bull; Reserva Serrat Selva</h1>
                <a href="/en-vivo" target="_blank" class="bg-serrat-teal text-white text-xs px-3 py-2 rounded-lg font-bold">🖥️ Abrir Pantalla En Vivo ↗</a>
            </div>
        </header>

        <main class="max-w-4xl mx-auto p-4 space-y-6">
            <!-- Quórum Actual -->
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex justify-between items-center">
                <div>
                    <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Quórum Registrado en Mesa</span>
                    <h2 id="adm-quorum" class="text-3xl font-black text-serrat-green">0.00%</h2>
                </div>
                <div class="text-right">
                    <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Unidades / Poderes Registrados</span>
                    <p id="adm-unidades" class="text-2xl font-bold text-slate-800">0 / 384</p>
                </div>
            </div>

            <!-- Crear Pregunta -->
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 class="font-bold text-slate-800 text-sm uppercase mb-3">Crear Nueva Moción / Pregunta</h3>
                <div class="flex gap-2">
                    <input type="text" id="txt-nueva-pregunta" placeholder="Escriba el enunciado de la pregunta..." class="flex-grow border border-slate-300 rounded-xl p-3 text-sm font-semibold">
                    <button onclick="crearPregunta()" class="bg-serrat-green hover:bg-emerald-800 text-white px-5 rounded-xl font-bold text-sm">Guardar</button>
                </div>
            </div>

            <!-- Listado de Preguntas -->
            <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h3 class="font-bold text-slate-800 text-sm uppercase mb-4">Gestión de Votaciones</h3>
                <div id="lista-preguntas-admin" class="space-y-4">Cargando preguntas...</div>
            </div>
        </main>

        <script>
            window.onload = function() {
                cargarQuorum();
                cargarPreguntas();
                setInterval(() => { cargarQuorum(); cargarPreguntas(); }, 4000);
            };

            async function cargarQuorum() {
                const res = await fetch('/api/quorum-global');
                const data = await res.json();
                document.getElementById('adm-quorum').innerText = (data.quorumRegistrado * 100).toFixed(2) + '%';
                document.getElementById('adm-unidades').innerText = \`\${data.totalRegistrados} / \${data.totalUnidades}\`;
            }

            async function cargarPreguntas() {
                const res = await fetch('/api/admin/preguntas');
                const preguntas = await res.json();
                const contenedor = document.getElementById('lista-preguntas-admin');

                if (preguntas.length === 0) {
                    contenedor.innerHTML = '<p class="text-slate-400 text-sm">No hay preguntas creadas.</p>';
                    return;
                }

                contenedor.innerHTML = preguntas.map(p => \`
                    <div class="p-4 rounded-xl border \${p.estado === 'activa' ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'} flex justify-between items-center">
                        <div class="max-w-lg">
                            <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded \${p.estado === 'activa' ? 'bg-emerald-600 text-white' : p.estado === 'finalizada' ? 'bg-slate-600 text-white' : 'bg-yellow-500 text-white'}">\${p.estado}</span>
                            <h4 class="font-bold text-slate-800 text-sm mt-1">\${escaparHtml(p.titulo)}</h4>
                        </div>
                        <div class="flex gap-2">
                            <button data-editar="\${p.id}" data-titulo="\${escaparHtml(p.titulo)}" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg">✏️ Editar</button>
                            \${p.estado === 'inactiva' ? \`<button onclick="cambiarEstado(\${p.id}, 'activa')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-lg">▶️ Abrir</button>\` : ''}
                            \${p.estado === 'activa' ? \`<button onclick="cambiarEstado(\${p.id}, 'finalizada')" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg">⏹️ Cerrar</button>\` : ''}
                            \${p.estado === 'finalizada' ? \`<button onclick="cambiarEstado(\${p.id}, 'activa')" class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold px-3 py-2 rounded-lg">🔄 Reabrir</button>\` : ''}
                            <button onclick="borrarPregunta(\${p.id})" class="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold px-2.5 py-2 rounded-lg">🗑️</button>
                        </div>
                    </div>
                \`).join('');

                contenedor.querySelectorAll('[data-editar]').forEach(boton => {
                    boton.addEventListener('click', () => editarPregunta(Number(boton.dataset.editar), boton.dataset.titulo));
                });
            }

            function escaparHtml(valor) {
                return String(valor).replace(/[&<>"']/g, caracter => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                }[caracter]));
            }

            async function crearPregunta() {
                const titulo = document.getElementById('txt-nueva-pregunta').value;
                if (!titulo) return alert('Ingrese un enunciado');
                await fetch('/api/admin/crear-pregunta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ titulo })
                });
                document.getElementById('txt-nueva-pregunta').value = '';
                cargarPreguntas();
            }

            async function editarPregunta(id, tituloActual) {
                const nuevoTitulo = prompt('Edite el enunciado de la pregunta/moción:', tituloActual);
                if (!nuevoTitulo || nuevoTitulo.trim() === '') return;
                await fetch('/api/admin/editar-pregunta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, titulo: nuevoTitulo.trim() })
                });
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

            async function borrarPregunta(id) {
                if (!confirm('¿Seguro que desea eliminar esta pregunta y sus votos?')) return;
                await fetch('/api/admin/borrar-pregunta', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                cargarPreguntas();
            }
        </script>
    </body>
    </html>
    `);
});

// ==========================================
// FRONTEND 3: PANTALLA EN VIVO / PROYECTOR (/en-vivo)
// ==========================================
app.get('/en-vivo', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resultados En Vivo - Reserva Serrat Selva</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                theme: { extend: { colors: { serrat: { green: '#1E6B39', teal: '#2B7067', yellow: '#D9A21B', orange: '#D86B27' } } } }
            }
        </script>
    </head>
    <body class="bg-slate-950 text-white min-h-screen p-6 font-sans">
        <header class="border-b border-slate-800 pb-4 mb-6 flex justify-between items-center">
            <div>
                <h1 class="text-2xl font-black uppercase tracking-wider text-serrat-yellow">ASAMBLEA GENERAL ORDINARIA 2026</h1>
                <p class="text-xs text-slate-400 uppercase tracking-widest">Reserva Serrat Selva &bull; Resultados en Tiempo Real</p>
            </div>
            <div class="bg-slate-900 border border-slate-800 px-6 py-3 rounded-2xl text-right">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Quórum Global Presente</span>
                <span id="live-quorum" class="text-2xl font-black text-emerald-400 font-mono">0.00%</span>
                <span id="live-personas-count" class="text-xs text-slate-400 block mt-0.5">0 unidades representadas</span>
            </div>
        </header>

        <main id="live-contenedor" class="space-y-6">Cargando resultados...</main>

        <script>
            window.onload = function() {
                actualizarVivi();
                setInterval(actualizarVivi, 2500);
            };

            async function actualizarVivi() {
                try {
                    const qRes = await fetch('/api/quorum-global');
                    const qData = await qRes.json();
                    document.getElementById('live-quorum').innerText = (qData.quorumRegistrado * 100).toFixed(2) + '%';
                    document.getElementById('live-personas-count').innerText = \`\${qData.totalRegistrados} de \${qData.totalUnidades} unidades representadas\`;

                    const res = await fetch('/api/resultados-todos');
                    const lista = await res.json();
                    const contenedor = document.getElementById('live-contenedor');

                    if (lista.length === 0) {
                        contenedor.innerHTML = '<div class="text-center py-20 text-slate-500 font-bold text-xl">Sin votaciones activas en este momento</div>';
                        return;
                    }

                    contenedor.innerHTML = lista.map(item => {
                        const p = item.pregunta;
                        const totalCoef = item.quorum || 0;

                        let mapOp = { 'SÍ': 0, 'NO': 0, 'BLANCO': 0 };
                        let mapVotosCount = { 'SÍ': 0, 'NO': 0, 'BLANCO': 0 };

                        item.resultados.forEach(r => {
                            mapOp[r.opcion] = r.total_coeficiente || 0;
                            mapVotosCount[r.opcion] = r.total_votos || 0;
                        });

                        const calcPct = (val) => totalCoef > 0 ? ((val / totalCoef) * 100).toFixed(2) : '0.00';

                        return \`
                        <div class="bg-slate-900 border \${p.estado === 'activa' ? 'border-emerald-500 shadow-lg shadow-emerald-950/50' : 'border-slate-800'} rounded-3xl p-6">
                            <div class="flex justify-between items-start mb-4 border-b border-slate-800 pb-3">
                                <div>
                                    <span class="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full \${p.estado === 'activa' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}">\${p.estado}</span>
                                    <h2 class="text-xl font-bold mt-2 text-slate-100">\${escaparHtml(p.titulo)}</h2>
                                </div>
                                <div class="text-right">
                                    <span class="text-xs text-slate-400 font-medium">Votos Computados:</span>
                                    <span class="text-lg font-mono font-bold text-emerald-400 block">\${(totalCoef * 100).toFixed(2)}%</span>
                                </div>
                            </div>

                            <div class="space-y-4">
                                <div>
                                    <div class="flex justify-between text-sm font-bold mb-1">
                                        <span class="text-emerald-400">🟢 SÍ: \${calcPct(mapOp['SÍ'])}% (\${(mapOp['SÍ'] * 100).toFixed(2)}%)</span>
                                        <span class="text-slate-400 font-normal">\${mapVotosCount['SÍ']} inmuebles</span>
                                    </div>
                                    <div class="w-full bg-slate-800 h-4 rounded-full overflow-hidden">
                                        <div class="bg-emerald-500 h-full transition-all duration-500" style="width: \${calcPct(mapOp['SÍ'])}%"></div>
                                    </div>
                                </div>

                                <div>
                                    <div class="flex justify-between text-sm font-bold mb-1">
                                        <span class="text-orange-400">🔴 NO: \${calcPct(mapOp['NO'])}% (\${(mapOp['NO'] * 100).toFixed(2)}%)</span>
                                        <span class="text-slate-400 font-normal">\${mapVotosCount['NO']} inmuebles</span>
                                    </div>
                                    <div class="w-full bg-slate-800 h-4 rounded-full overflow-hidden">
                                        <div class="bg-orange-500 h-full transition-all duration-500" style="width: \${calcPct(mapOp['NO'])}%"></div>
                                    </div>
                                </div>

                                <div>
                                    <div class="flex justify-between text-sm font-bold mb-1">
                                        <span class="text-slate-300">⚪ VOTO EN BLANCO: \${calcPct(mapOp['BLANCO'])}% (\${(mapOp['BLANCO'] * 100).toFixed(2)}%)</span>
                                        <span class="text-slate-400 font-normal">\${mapVotosCount['BLANCO']} inmuebles</span>
                                    </div>
                                    <div class="w-full bg-slate-800 h-4 rounded-full overflow-hidden">
                                        <div class="bg-slate-400 h-full transition-all duration-500" style="width: \${calcPct(mapOp['BLANCO'])}%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        \`;
                    }).join('');

                } catch (e) { console.error(e); }
            }

            function escaparHtml(valor) {
                return String(valor).replace(/[&<>"']/g, caracter => ({
                    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
                }[caracter]));
            }
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`Servidor iniciado correctamente en el puerto ${PORT}`);
    console.log(`- Mesa de Registro: http://localhost:${PORT}/registro`);
    console.log(`- Pantalla Votación: http://localhost:${PORT}/`);
    console.log(`- Panel Admin:     http://localhost:${PORT}/admin`);
    console.log(`- Pantalla En Vivo: http://localhost:${PORT}/en-vivo`);
    console.log(`==================================================\n`);
});