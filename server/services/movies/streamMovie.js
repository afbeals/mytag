// External
import path from 'path';
import fsD from 'fs';
import ws from 'windows-shortcuts';

// Internal
import { queryHandler } from '../util';

// Constants
const {
  SERVER_MOVIES_CATEGORY_TABLE: moviesCatTable,
  SERVER_MOVIES_GROUPS_TABLE: moviesGroupsTable,
  SERVER_GROUPS_TABLE: groupsTable,
  SERVER_CATEGORIES_TABLE: categoriesTable,
  SERVER_MOVIES_TABLE: moviesTable,
  SERVER_AD_PATH: adPath,
  SERVER_AD_GROUP: adGroup,
} = process.env;

// stream movie (db);
const streamMovie = async (
  pool,
  {
    headers,
    query: {
      suggestedPath = null,
      suggestedCat = null,
      suggestedGrp = null,
      id: movie_id,
    },
  }
) => {
  let moviePath;
  if (suggestedPath) {
    if (suggestedGrp) {
      const getGroupPathQuery = {
        text: `SELECT src_folder FROM ${groupsTable}
          WHERE id = $1;`,
        values: [suggestedGrp],
      };
      const { rows } = await queryHandler(pool, getGroupPathQuery);
      const { src_folder } = rows[0];
      moviePath = path.join(adGroup, src_folder, suggestedPath);
    } else if (suggestedCat) {
      const getCathPathQuery = {
        text: `SELECT src_folder FROM ${categoriesTable}
        WHERE id = $1;`,
        values: [suggestedCat],
      };
      const { rows } = await queryHandler(pool, getCathPathQuery);
      const { src_folder } = rows[0];
      moviePath = path.join(adPath, src_folder, suggestedPath);
    } else {
      return Promise.reject({
        message: 'Need either category or group with path given',
      });
    }
  } else {
    const getMovieCatInfo = {
      text: `SELECT
                mv.file_src as file_src,
                grp.src_folder as grp_src,
                cat.src_folder as cat_src
              FROM ${moviesTable} AS mv
              LEFT JOIN ${moviesCatTable} AS mvc
              ON mv.id = mvc.movies_id
              LEFT JOIN ${categoriesTable} AS cat
              ON mvc.categories_id = cat.id
              LEFT JOIN ${moviesGroupsTable} AS mvg
              ON mv.id = mvg.movies_id
              LEFT JOIN ${groupsTable} AS grp
              ON mvg.groups_id = grp.id
              WHERE mv.id = $1`,
      values: [movie_id],
    };

    const { rows: movieCatRow } = await queryHandler(pool, getMovieCatInfo);
    const { grp_src = null, cat_src, file_src } = movieCatRow[0];
    moviePath = grp_src
      ? path.join(adGroup, grp_src, file_src)
      : path.join(adPath, cat_src, file_src);
  }

  if (moviePath.includes('.lnk')) {
    const linkData = await new Promise((res, rej) =>
      ws.query(path.resolve(moviePath), (err, stats) => {
        if (err) rej(err);
        res(stats);
      })
    );
    moviePath = path.resolve(linkData.target);
  }

  return new Promise((res, rej) => {
    fsD.stat(moviePath, (err, stat) => {
      // Handle file not found
      if (err !== null && err.code === 'ENOENT') {
        rej(404);
      }

      // get file info
      const { size: fileSize } = stat;
      const { range } = headers;
      let file;
      let head;
      let status;
      let filePath;

      // if range, stream video in chunks
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');

        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        const chunksize = end - start + 1;

        file = fsD.createReadStream(moviePath, { start, end });
        head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
        };
        filePath = path.resolve(moviePath);
        status = 206;
      } else {
        head = {
          'Content-Length': fileSize,
        };
        status = 200;
        file = fsD.createReadStream(moviePath);
        filePath = path.resolve(moviePath);
      }
      res({
        file,
        head,
        status,
        filePath,
      });
    });
  });
};

export default streamMovie;
