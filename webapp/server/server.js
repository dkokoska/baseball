import express from 'express';
import cors from 'cors';
import pg from 'pg';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Database using Environment Variables or Fallback
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:k153fd8w@localhost:5432/postgres',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Error connecting to PostgreSQL:', err);
    } else {
        console.log('Connected to PostgreSQL database at', res.rows[0].now);
    }
});

// Create tables if they don't exist
const createTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS adjustments (
                id SERIAL PRIMARY KEY,
                playerId TEXT NOT NULL,
                stat TEXT NOT NULL,
                delta DOUBLE PRECISION NOT NULL,
                UNIQUE(playerId, stat)
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS player_values (
                playerId TEXT PRIMARY KEY,
                value DOUBLE PRECISION NOT NULL
            );
        `);
        console.log('Tables verified/created');
    } catch (err) {
        console.error('Error creating tables:', err);
    }
};

createTables();

// GET adjustments
app.get('/api/adjustments', async (req, res) => {
    try {
        const result = await pool.query('SELECT playerId, stat, delta FROM adjustments');
        res.json({
            message: 'success',
            data: result.rows
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST adjustment (Upsert)
app.post('/api/adjustments', async (req, res) => {
    const { playerId, stat, delta } = req.body;
    const sql = `
        INSERT INTO adjustments (playerId, stat, delta) 
        VALUES ($1, $2, $3)
        ON CONFLICT(playerId, stat) DO UPDATE SET delta = excluded.delta
        RETURNING *;
    `;

    try {
        const result = await pool.query(sql, [playerId, stat, delta]);
        res.json({
            message: 'success',
            data: result.rows[0]
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST batch adjustments
app.post('/api/batch-adjustments', async (req, res) => {
    const adjustments = req.body; // Expecting array of { playerId, stat, delta }

    if (!Array.isArray(adjustments)) {
        return res.status(400).json({ error: 'Expected an array of adjustments' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const sql = `
            INSERT INTO adjustments (playerId, stat, delta) 
            VALUES ($1, $2, $3)
            ON CONFLICT(playerId, stat) DO UPDATE SET delta = excluded.delta
        `;

        for (const adj of adjustments) {
            await client.query(sql, [adj.playerId, adj.stat, adj.delta]);
        }

        await client.query('COMMIT');
        res.json({ message: 'success', count: adjustments.length });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET player values
app.get('/api/values', async (req, res) => {
    try {
        const result = await pool.query('SELECT playerId, value FROM player_values');
        res.json({
            message: 'success',
            data: result.rows
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// POST player values (Batch Upsert)
app.post('/api/values', async (req, res) => {
    const values = req.body; // Expecting array of { playerId, value }

    if (!Array.isArray(values)) {
        return res.status(400).json({ error: 'Expected an array of values' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const sql = `
            INSERT INTO player_values (playerId, value) 
            VALUES ($1, $2)
            ON CONFLICT(playerId) DO UPDATE SET value = excluded.value
        `;

        for (const v of values) {
            await client.query(sql, [v.playerId, v.value]);
        }

        await client.query('COMMIT');
        res.json({ message: 'success', count: values.length });

        // Serve static files from the React app build directory
        // In Docker, we'll copy 'dist' to the correct location relative to this server file
        app.use(express.static(path.join(__dirname, '../dist')));

        // The "catchall" handler: for any request that doesn't
        // match one above, send back React's index.html file.
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../dist/index.html'));
        });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
