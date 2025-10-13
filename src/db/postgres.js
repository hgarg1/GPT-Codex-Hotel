const { Sequelize } = require('sequelize');

let sequelize;

function getSequelize() {
  if (sequelize) {
    return sequelize;
  }

  const {
    DINING_DATABASE_URL,
    DINING_DATABASE_HOST,
    DINING_DATABASE_PORT,
    DINING_DATABASE_USER,
    DINING_DATABASE_PASSWORD,
    DINING_DATABASE_NAME
  } = process.env;

  if (DINING_DATABASE_URL) {
    sequelize = new Sequelize(DINING_DATABASE_URL, {
      dialect: 'postgres',
      logging: false,
      dialectOptions: {
        ssl:
          process.env.DINING_DATABASE_SSL === 'true'
            ? {
                require: true,
                rejectUnauthorized: false
              }
            : undefined
      }
    });
    return sequelize;
  }

  if (DINING_DATABASE_HOST && DINING_DATABASE_USER && DINING_DATABASE_NAME) {
    sequelize = new Sequelize(DINING_DATABASE_NAME, DINING_DATABASE_USER, DINING_DATABASE_PASSWORD, {
      host: DINING_DATABASE_HOST,
      port: DINING_DATABASE_PORT ? Number(DINING_DATABASE_PORT) : undefined,
      dialect: 'postgres',
      logging: false
    });
    return sequelize;
  }

  sequelize = new Sequelize('postgres://placeholder@localhost:5432/dining', {
    dialect: 'postgres',
    logging: false,
    retry: { max: 0 },
    pool: {
      max: 0,
      min: 0,
      acquire: 1000,
      idle: 1000
    }
  });
  return sequelize;
}

module.exports = {
  getSequelize
};
