import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3').verbose();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Initialize Database
const dbPath = path.resolve(__dirname, 'baseball.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ' + dbPath, err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playerId TEXT NOT NULL,
      stat TEXT NOT NULL,
      delta REAL NOT NULL,
      UNIQUE(playerId, stat)
    )`);
    }
});

// GET adjustments
app.get('/api/adjustments', (req, res) => {
    const sql = 'SELECT playerId, stat, delta FROM adjustments';
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: rows
        });
    });
});

// POST adjustment (Upsert)
app.post('/api/adjustments', (req, res) => {
    const { playerId, stat, delta } = req.body;
    const sql = `INSERT INTO adjustments (playerId, stat, delta) VALUES (?, ?, ?)
               ON CONFLICT(playerId, stat) DO UPDATE SET delta = excluded.delta`;

    db.run(sql, [playerId, stat, delta], function (err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({
            message: 'success',
            data: { id: this.lastID, playerId, stat, delta }
        });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
