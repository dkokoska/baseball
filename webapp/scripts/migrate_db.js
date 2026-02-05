
import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQLite Connection
const sqliteDbPath = path.resolve(__dirname, '../server/baseball.db');
const sqliteDb = new sqlite3.Database(sqliteDbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening SQLite database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database.');
});

// PostgreSQL Connection
const pool = new Pool({
    connectionString: 'postgres://postgres:k153fd8w@localhost:5432/postgres',
});

async function migrate() {
    try {
        console.log('Starting migration...');

        // 1. Create Tables in Postgres
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

        console.log('Tables created in PostgreSQL.');

        // 2. Migrate Adjustments
        console.log('Migrating adjustments...');
        const adjustmentRows = await new Promise((resolve, reject) => {
            sqliteDb.all('SELECT playerId, stat, delta FROM adjustments', (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });

        if (adjustmentRows.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const insertAdjText = `
                    INSERT INTO adjustments (playerId, stat, delta) 
                    VALUES ($1, $2, $3)
                    ON CONFLICT(playerId, stat) DO UPDATE SET delta = excluded.delta
                `;
                for (const row of adjustmentRows) {
                    await client.query(insertAdjText, [row.playerId, row.stat, row.delta]);
                }
                await client.query('COMMIT');
                console.log(`Migrated ${adjustmentRows.length} adjustments.`);
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } else {
            console.log('No adjustments to migrate.');
        }

        // 3. Migrate Player Values
        console.log('Migrating player values...');
        const valueRows = await new Promise((resolve, reject) => {
            sqliteDb.all('SELECT playerId, value FROM player_values', (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });

        if (valueRows.length > 0) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const insertValText = `
                    INSERT INTO player_values (playerId, value) 
                    VALUES ($1, $2)
                    ON CONFLICT(playerId) DO UPDATE SET value = excluded.value
                `;
                for (const row of valueRows) {
                    await client.query(insertValText, [row.playerId, row.value]);
                }
                await client.query('COMMIT');
                console.log(`Migrated ${valueRows.length} player values.`);
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } else {
            console.log('No player values to migrate.');
        }

        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        sqliteDb.close();
        await pool.end();
    }
}

migrate();
