// External
import express from 'express';
import bodyParser from 'body-parser';
import env from 'dotenv';
import path from 'path';
import colors from 'colors';
import cors from 'cors';

// Internal
import getPool from './db';
import routes from './routes';

const app = express();
const pool = getPool();
const envFilePath = path.join(__dirname, '../.env.local');
const { SERVER_PORT: port, SERVER_HOST: host } = process.env;

env.config({ path: envFilePath });

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.get('/', (_, response) => {
  response.json({ info: 'Node.jss, Express, and Postgres API' });
});

routes(app, pool);

app.listen(port, host, () => {
  const message = colors.brightCyan(`App running on port`);
  const portMsg = colors.underline.brightGreen(`${port}!`);
  console.log(`${message} ${portMsg}`);
});
