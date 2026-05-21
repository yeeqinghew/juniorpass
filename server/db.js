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
      user: process.env.postgresUser,
      password: process.env.postgresPassword,
      host: process.env.postgresHost,
      port: process.env.postgresPort,
      database: process.env.postgresDatabase,
    });

module.exports = pool;
