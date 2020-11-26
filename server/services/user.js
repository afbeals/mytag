// Internal
import { queryHandler } from './util';

// Constants
const usersTable = process.env.SERVER_USERS_TABLE;

// Queries

const getAllUsers = pool =>
  queryHandler(pool, `SELECT * FROM ${usersTable} ORDER BY id ASC`);

const getUser = (pool, { query: { user: value } }) => {
  const query = {
    text: `SELECT * FROM ${usersTable} WHERE username = $1;`,
    values: [value],
  };
  return queryHandler(pool, query);
};

const createUser = (pool, { body: { username, first_name, last_name } }) => {
  const query = {
    text: `
      INSERT INTO ${usersTable}(username, first_name, last_name)
      VALUES($1,$2,$3)
      RETURNING *;`,
    values: [username, first_name, last_name],
  };
  return queryHandler(pool, query);
};

const deleteUser = (pool, { body: { id } }) => {
  const query = {
    text: `DELETE FROM ${usersTable} WHERE id = $1;`,
    values: [id],
  };
  return queryHandler(pool, query);
};

const updateUser = (pool, { body }) => {
  const { id, ...restBody } = body;
  const updates = Object.entries(restBody);

  if (!id) return Promise.reject({ message: 'Missing user Id' });
  if (updates.length < 1)
    return Promise.reject({ message: 'Nothing requested to update' });

  const text = [`UPDATE ${usersTable} SET`];
  const values = [];
  updates.forEach(([key, val], i) => {
    text.push(`${key} = $${i + 1}`);
    values.push(val);
  });
  text.push(`WHERE id = ${id} RETURNING *;`);

  const query = {
    text: text.join(' '),
    values,
  };

  return queryHandler(pool, query);
};

export default {
  createUser,
  deleteUser,
  getAllUsers,
  getUser,
  updateUser,
};
