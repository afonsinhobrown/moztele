const {Client}=require('pg');
const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
c.connect().then(()=>c.query('SELECT count(*) as c FROM perfis')).then(r=>{console.log(r.rows[0].c);c.end();}).catch(e=>{console.error(e.message);process.exit(1);});
