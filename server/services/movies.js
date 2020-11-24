// External
import fs from 'fs-extra';
import path from 'path';
import fsD from 'fs';
import ffprobe from 'ffprobe';
import ffprobeS from 'ffprobe-static';
import { exec } from 'child_process';

// Internal
import { queryHandler, pageLimiter } from './util';

// Constants
const {
  SERVER_MOVIES_TAGS_TABLE: moviesTagsTable,
  SERVER_MOVIES_CATEGORY_TABLE: moviesCatTable,
  SERVER_CATEGORIES_TABLE: categoriesTable,
  SERVER_MOVIES_TABLE: moviesTable,
  SERVER_TAGS_TABLE: tagstable,
  SERVER_AD_PATH: adPath,
  SERVER_AD_THUMB: adThumb,
} = process.env;
const selectMovieInfoQuery = (
  { prevId, orderBy, limit, dir, where = null, group = null },
  currentVals = []
) => ({
  text: `
    SELECT
      mv.img_src as img_src,
      mv.name as movie_name,
      string_agg(distinct tg.name, ',' order by tg.name) as tag_name,
      cat.name as category,
      mv.id AS movie_id
    FROM ${moviesTable} AS mv
      LEFT JOIN ${moviesTagsTable} AS mvt
          ON mv.id = mvt.movies_id
      LEFT JOIN ${tagstable} AS tg
          ON mvt.tags_id = tg.id
      LEFT JOIN ${moviesCatTable} AS mvc
          ON mv.id = mvc.movies_id
      LEFT JOIN ${categoriesTable} AS cat
          ON mvc.categories_id = cat.id
      ${pageLimiter({ dir, where, group }, currentVals.length)}`,
  value: [...currentVals, prevId, orderBy, limit, dir],
});

// get query pagination sequence movie (db);
const getMovies = (pool, { query: { prevId, limit, orderBy, dir } }) => {
  const group = `GROUP BY mv.name, mv.id, cat.name`;
  const getMoviesQuery = selectMovieInfoQuery({
    prevId,
    limit,
    orderBy,
    dir,
    group,
  });
  return queryHandler(pool, getMoviesQuery);
};

// get fetch all movies under category (db);
const getMoviesByCategory = (
  pool,
  { query: { categories, prevId, limit, orderBy = 'mv.id', dir = null } }
) => {
  if (!categories.length) return Promise.reject('No category specified');
  const categoriesList = categories.join(',');
  const where = `cat.name IN ($1)`;
  const group = `GROUP BY mv.name, mv.id, cat.name`;
  const movieUnderCatQuery = selectMovieInfoQuery(
    {
      prevId,
      limit,
      orderBy,
      dir,
      where,
      group,
    },
    [categoriesList]
  );
  return queryHandler(pool, movieUnderCatQuery);
};

// fetch db movies under tag(s) (db);
const getMoviesByTags = (
  pool,
  { query: { tags, prevId, orderBy = 'mv.id', limit, dir } }
) => {
  if (!tags.length) return Promise.reject('No tags specified');
  const tagsList = tags.join(',');
  const where = `tg.name IN ($1)`;
  const group = `GROUP BY mv.name, mv.id, cat.name`;
  const movieWithTagsQuery = selectMovieInfoQuery(
    {
      prevId,
      limit,
      orderBy,
      dir,
      where,
      group,
    },
    [tagsList]
  );

  return queryHandler(pool, movieWithTagsQuery);
};

// post update movie (change category (db/folder), add/remove tag(s)(db));
const updateMovie = async (
  pool,
  { body: { movie_id, category_id: new_cat_id = null, tags = [] } }
) => {
  // fetch movie to make sure exists and get info
  const { rows: movieRows } = await queryHandler(pool, {
    text: `SELECT * FROM ${moviesTable} WHERE id = $1`,
    values: [movie_id],
  });
  const movie = movieRows[0];
  if (!movie) return Promise.reject(`couldn't find movie for id ${movie_id}`);

  // if category,
  if (new_cat_id) {
    // get the category matching the old and new
    const oldMovieCatSrc = {
      text: `
    SELECT
      cat.src_folder AS category,
      cat.id
    FROM ${categoriesTable} as cat
    	LEFT JOIN ${moviesCatTable} as mvc
    		ON mvc.categories_id = cat.id
    WHERE mvc.movies_id = $1
      OR cat.id = $2;
    `,
      values: [movie_id, new_cat_id],
    };
    const { rows } = await queryHandler(pool, oldMovieCatSrc);
    let old_category_src, new_category_src;
    // grab old and new category src
    rows.forEach(({ id, category }) =>
      id === new_cat_id
        ? (new_category_src = category)
        : (old_category_src = category)
    );
    // set paths for current src and destination of file
    const movieSrc = path.join(adPath, old_category_src, movie.file_name);
    const movieDst = path.join(adPath, new_category_src, movie.file_name);
    const updateMovieCat = {
      text: `
    UPDATE ${moviesCatTable}
    SET categories_id = $1
    WHERE movies_id = $2;
    `,
      values: [new_cat_id, movie_id],
    };

    // update the join table and then move the file
    await queryHandler(pool, updateMovieCat)
      .then(() => fs.move(movieSrc, movieDst))
      .catch(err => Promise.reject(err));
  }

  if (tags.length > 0) {
    const tagsUpdate = tags.map(tag => {
      const updateTag = {
        text: `INSERT INTO ${moviesCatTable}(movies_id, tags_id)
                VALUES($1, $2)
                ON CONFLICT DO NOTHING;`,
        values: [movie_id, tag],
      };
      return queryHandler(pool, updateTag);
    });
    await Promise.all(tagsUpdate).catch(err => Promise.reject(err));
  }

  const updatedMovie = selectMovieInfoQuery({});
  return queryHandler(pool, updatedMovie);
};

// get search for movie by name(db)
const searchMovies = async (
  pool,
  { query: { name = '', tags: tg = [], category: cat = [], prevId } }
) => {
  const where = Object.entries({ cat: cat.join(','), tg: tg.join(',') })
    .map(([key, val], i) => (val.length > 0 ? `${key}.name IN ($${i})` : ''))
    .push("mv.name LIKE '%$3%'")
    .join(' AND ');
  const group = `GROUP BY mv.name, mv.id, cat.name`;
  const searchQuery = selectMovieInfoQuery(
    {
      prevId,
      where,
      group,
    },
    [cat, tg, name]
  );
  return queryHandler(pool, searchQuery);
};

// delete delete movie (db, folder);
const deleteMovie = async (pool, { body: { id } }) => {
  // get all movie info needed to remove folder and db info
  const getMovieInfoQuery = {
    text: `
  SELECT
    mv.file_name AS file_name,
    mv.img_src AS img_src,
    cg.src_folder AS categories_src
  FROM ${moviesCatTable} AS m_c
    INNER JOIN
      ${moviesTable} AS mv
    ON mv.id = m_c.movies_id
    INNER JOIN
      ${categoriesTable} AS cg
    ON cg.id = m_c.categories_id
  WHERE mv.id = $1`,
    values: [id],
  };
  const { rows } = await queryHandler(pool, getMovieInfoQuery);
  const { file_name = null, img_src = null, categories_src = null } = rows[0];

  // if no info, then don't try to do anything else
  if (!file_name || !categories_src)
    return Promise.reject("Movie doesn't exist");

  // remove movie first
  const moviePath = path.join(adPath, categories_src, file_name);
  await new Promise((_, rej) =>
    fs
      .remove(moviePath)
      .then(() => {
        if (img_src) {
          // has img, try to remove
          const imgPath = path.join(adPath, categories_src, img_src);
          fs.remove(imgPath, imgErr => rej(imgErr));
        }
        const deleteMovieQuery = {
          text: `DELETE FROM ${moviesTable} WHERE id = $1;`,
          values: [id],
        };
        return queryHandler(pool, deleteMovieQuery);
      })
      .catch(err => err)
  );

  // remove thumbs
  const thumbsPath = path.join(adThumb, id);
  return fs.remove(thumbsPath).catch(err => err);
};

// get available movies (by category)
const getAvailableMovies = ({ query: { category } }) =>
  new Promise((res, rej) => {
    const ad = path.resolve(adPath, category);
    return fs.readdir(ad, (err, files) => {
      if (err) rej(err);
      res(files);
    });
  });

// post create movie/thumb/gif (db)
const addMovieToDB = async (
  pool,
  { body: { tag_ids, category_id, file_name, name } }
) => {
  // add movie and get row info
  const insertMovieQuery = {
    text: `INSERT INTO ${moviesTable}(file_name, name)
      VALUES($1, $2)
      RETURNING *;`,
    values: [file_name, name],
  };
  const catInfoQuery = {
    text: `SELECT * FROM ${categoriesTable} WHERE id = $1;`,
    values: [category_id],
  };
  const { rows: movieRows } = await queryHandler(pool, insertMovieQuery);
  const { rows: catRows } = await queryHandler(pool, catInfoQuery);
  const { id: movie_id } = movieRows[0];
  const { src_folder: cat_src, id: cat_id } = catRows[0];

  // create images
  const thumbDir = path.join(adThumb, movie_id);
  const thumbPath = path.join(thumbDir, 'thumb.jpg');
  const createThumb = new Promise((res, rej) =>
    fsD.access(thumbPath, fs.F_OK, err => {
      // if file doesn't exist
      if (err) {
        // get info from movie file
        const moviePath = `${adPath}/${cat_src}/${file_name}`;
        ffprobe(
          moviePath,
          { path: ffprobeS.path },
          (ffprobeErr, movieStats) => {
            if (err) rej(ffprobeErr);

            // create thumbnail
            const startTime = (
              Math.round(movieStats.duration / 3) / 100
            ).toFixed(2);
            const execScript = [
              'ffmpeg', // start process
              `-ss ${startTime}`, // set start time
              `-i ${moviePath}`, // set input file
              '-vframes 1', // set amount of frames per sec
              '-vf "scale=w=480:h=-1"', // use filter scale the image
              thumbPath, // set the output name
            ];
            exec(execScript.join(' '), execError => {
              if (execError) {
                rej(execError);
              }

              res();
            });
          }
        );
      } else {
        // Image already exists
        res();
      }
    })
  );

  // create Gif
  const gifPath = path.join(thumbDir, 'gif.gif');
  const createGif = new Promise((res, rej) =>
    fsD.access(gifPath, fs.F_OK, err => {
      // if file doesn't exist
      if (err) {
        // get info from movie file
        const moviePath = `${adPath}/${cat_src}/${file_name}`;
        ffprobe(
          moviePath,
          { path: ffprobeS.path },
          (ffprobeErr, movieStats) => {
            if (err) rej(ffprobeErr);

            // create gif starting halfway through
            const startTime = (
              Math.round(movieStats.duration / 2) / 100
            ).toFixed(2);
            const execScript = [
              'ffmpeg', // start process
              `-ss ${startTime}`, // set start time
              `-t 3`, // set the gif duration
              `-i ${moviePath}`, // set input file
              // https://engineering.giphy.com/how-to-make-gifs-with-ffmpeg/
              // eslint-disable-next-line max-len
              '-filter_complex "[0:v] fps=12,scale=480:-1,split [a][b];[a] palettegen [p];[b][p] paletteuse"',
              gifPath, // set the output name
            ];
            exec(execScript.join(' '), execError => {
              if (execError) {
                rej(execError);
              }
              res();
            });
          }
        );
      } else {
        // Image already exists
        res();
      }
    })
  );

  // update img_src
  const updateMovieImgSrc = {
    text: `UPDATE ${moviesTable}
            SET img_src = $1
            WHERE id = $1`,
    values: [movie_id],
  };
  await queryHandler(pool, updateMovieImgSrc);

  // update cat/movie table ON CONFLICT DO NOTHING
  const addMovieCat = {
    text: `INSERT INTO ${moviesCatTable}(movies_id, categories_id)
            VALUES($1, $2)
            ON CONFLICT DO NOTHING;`,
    values: [movie_id, cat_id],
  };
  await queryHandler(pool, addMovieCat);

  // update tags/movie table
  const addMovieTags = tag_ids.map(tag_id => {
    const addMovieTag = {
      text: `INSERT INTO ${moviesTagsTable}(movies_id, tags_id)
              VALUES($1, $2)
              ON CONFLICT DO NOTHING;`,
      values: [movie_id, tag_id],
    };
    return queryHandler(pool, addMovieTag);
  });

  // wait for transactions
  await Promise.all([createThumb, createGif, ...addMovieTags]);
};

// stream movie (db);
const streamMovie = async (pool, { headers, query: { id: movie_id } }) => {
  const getMovieCatInfo = {
    text: `SELECT
              mv.file_name as file_name,
              cat.src_folder as cat_src
            FROM ${moviesTable} AS mv
            LEFT JOIN ${moviesCatTable} AS mvc
            ON mv.id = mvc.movies_id
            LEFT JOIN ${categoriesTable} AS cat
            ON mvc.categories_id = cat.id
            WHERE mv.id = $1`,
    values: [movie_id],
  };
  const { row: movieCatRow } = await queryHandler(pool, getMovieCatInfo);
  const { cat_src, file_name } = movieCatRow[0];
  const moviePath = path.join(adPath, cat_src, file_name);
  return new Promise((res, rej) => {
    fsD.stat(moviePath, (err, stat) => {
      // Handle file not found
      if (err !== null && err.code === 'ENOENT') {
        return rej(404);
      }

      // get file info
      const { size: fileSize } = stat;
      const { range } = headers;
      let file;
      let head;
      let status;

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
          'Content-Type': 'video/mp4',
        };
        status = 206;
      } else {
        head = {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
        };
        status = 200;
        file = fsD.createReadStream(moviePath);
      }
      res({
        file,
        head,
        status,
      });
    });
  });
};

export default {
  addMovieToDB,
  deleteMovie,
  getAvailableMovies,
  getMovies,
  getMoviesByCategory,
  getMoviesByTags,
  searchMovies,
  streamMovie,
  updateMovie,
};
