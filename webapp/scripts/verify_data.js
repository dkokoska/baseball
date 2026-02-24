import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
    connectionString: 'postgres://postgres:k153fd8w@localhost:5432/postgres'
});
async function check() {
    try {
        const res = await pool.query('SELECT COUNT(*) FROM player_values');
        console.log('Player values count:', res.rows[0].count);
        const res2 = await pool.query('SELECT 1');
        console.log('Connection active:', res2.rows.length > 0);
        process.exit(0);
    } catch (e) {
        console.error('Verification failed:', e);
        process.exit(1);
    }
}
check();
