const Pool = require("pg").Pool;
require("dotenv").config();

const isProduction =
  process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";

const pool = isProduction
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    })
  : new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      database: process.env.POSTGRES_DATABASE,
    });

module.exports = pool;
