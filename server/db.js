const Pool = require("pg").Pool;
require("dotenv").config();

const pool = new Pool({
  user: process.env.postgresUser,
  password: process.env.postgresPassword,
  host: process.env.postgresHost,
  port: process.env.postgresPort,
  database: process.env.postgresDatabase,
});

module.exports = pool;
