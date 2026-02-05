
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgres://postgres:k153fd8w@localhost:5432/postgres',
});

async function verify() {
    try {
        const resAdj = await pool.query('SELECT count(*) FROM adjustments');
        console.log(`Adjustments count: ${resAdj.rows[0].count}`);

        const resVal = await pool.query('SELECT count(*) FROM player_values');
        console.log(`Player Values count: ${resVal.rows[0].count}`);

        const sample = await pool.query('SELECT * FROM player_values LIMIT 1');
        console.log('Sample value:', sample.rows[0]);

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        await pool.end();
    }
}

verify();
