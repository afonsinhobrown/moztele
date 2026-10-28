const {Pool}=require('pg');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:1,connectionTimeoutMillis:10000});
pool.query('SELECT 1').then(r=>{console.log(r.rows[0]);pool.end();}).catch(e=>{console.error(e.message);process.exit(1);});
