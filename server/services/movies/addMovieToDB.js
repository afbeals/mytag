// External
import fs from 'fs-extra';
import path from 'path';
import fsD from 'fs';
import ffprobe from 'ffprobe';
import ffprobeS from 'ffprobe-static';
import { exec } from 'child_process';
import ws from 'windows-shortcuts';

// Internal
import { queryHandler } from '../util';

// Constants
const {
  SERVER_MOVIES_GROUPS_TABLE: moviesGroupsTable,
  SERVER_MOVIES_TAGS_TABLE: moviesTagsTable,
  SERVER_MOVIES_CATEGORY_TABLE: moviesCatTable,
  SERVER_CATEGORIES_TABLE: categoriesTable,
  SERVER_MOVIES_TABLE: moviesTable,
  SERVER_GROUPS_TABLE: groupsTable,
  SERVER_TAGS_TABLE: tagsTable,
  SERVER_AD_GROUP: adGroup,
  SERVER_AD_PATH: adPath,
  SERVER_AD_THUMB: adThumb,
} = process.env;

// post create movie/thumb/gif (db)
const addMovieToDB = async (
  pool,
  {
    body: {
      primary_group = null,
      related_groups = [],
      tag_ids,
      category_id,
      file_src,
      name,
      notes,
    },
  }
) => {
  // // rename wmv files for insert
  // const file_src = init_file_src.replace('.wmv', '.mp4');

  // add movie and get row info
  const insertMovieQuery = {
    text: `INSERT INTO ${moviesTable}(file_src, name, notes)
      VALUES($1, $2, $3)
      RETURNING *;`,
    values: [file_src, name, notes],
  };
  const catInfoQuery = {
    text: `SELECT * FROM ${categoriesTable} WHERE id = $1;`,
    values: [category_id],
  };

  let groupInfo = null;
  const { rows: movieRows } = await queryHandler(pool, insertMovieQuery);
  const { rows: catRows } = await queryHandler(pool, catInfoQuery);
  if (primary_group) {
    const groupInfoQuery = {
      text: `SELECT * FROM ${groupsTable} Where id = $1`,
      values: [primary_group],
    };
    const { rows: groupsRows } = await queryHandler(pool, groupInfoQuery);
    groupInfo = groupsRows[0];
  }
  const { id: movie_id } = movieRows[0];
  const { src_folder: cat_src, id: cat_id } = catRows[0];
  let movie_duration = 0;

  // get moviePath
  let moviePath = groupInfo
    ? `${adGroup}/${groupInfo.src_folder}/${file_src}`
    : `${adPath}/${cat_src}/${file_src}`;

  // //rename wmv files
  // if (moviePath.includes('.wmv')) {
  //   const newPath = moviePath.replace('.wmv', '.mp4');
  //   await fs.rename(moviePath, newPath);
  //   moviePath = newPath;
  // }

  // if sysLink, get actual path
  if (moviePath.includes('.lnk')) {
    const linkData = await new Promise((res, rej) =>
      ws.query(path.resolve(moviePath), (err, stats) => {
        if (err) rej(err);
        res(stats);
      })
    );
    moviePath = path.resolve(linkData.target);
  }

  // create images
  // make sure dir exists
  const thumbDir = path.join(adThumb, `${movie_id}`);
  await fs.ensureDir(thumbDir);
  const thumbPath = path.join(thumbDir, 'thumb.jpg');

  const createThumb = await new Promise((res, rej) =>
    fsD.access(thumbPath, fs.F_OK, err => {
      // if file doesn't exist
      if (err) {
        // get info from movie file

        ffprobe(
          moviePath,
          { path: ffprobeS.path },
          (ffprobeErr, { streams: movieStats }) => {
            if (ffprobeErr) rej(ffprobeErr);

            // create thumbnail
            movie_duration = Math.round(movieStats[0].duration);
            const startTime = Math.round(movieStats[0].duration / 3).toFixed(2);

            const execScript = [
              'ffmpeg', // start process
              `-ss ${startTime}`, // set start time
              `-i "${moviePath}"`, // set input file
              '-vframes 1', // set amount of frames per sec
              '-vf "scale=w=480:h=-1"', // use filter scale the image
              `${thumbPath}`, // set the output name
            ];
            const ffmpegScript = execScript.join(' ');

            exec(ffmpegScript, execError => {
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
  const createGif = await new Promise((res, rej) =>
    fsD.access(gifPath, fs.F_OK, err => {
      // if file doesn't exist
      if (err) {
        // get info from movie file

        ffprobe(
          moviePath,
          { path: ffprobeS.path },
          (ffprobeErr, { streams: movieStats }) => {
            if (ffprobeErr) rej(ffprobeErr);

            // create gif starting halfway through
            const startTime = Math.round(movieStats[0].duration / 2).toFixed(2);

            const execScript = [
              'ffmpeg', // start process
              `-ss ${startTime}`, // set start time
              `-t 6`, // set the gif duration
              `-i "${moviePath}"`, // set input file
              // https://engineering.giphy.com/how-to-make-gifs-with-ffmpeg/
              // eslint-disable-next-line max-len
              '-filter_complex "[0:v] fps=12,scale=480:-1,split [a][b];[a] palettegen [p];[b][p] paletteuse"',
              `${gifPath}`, // set the output name
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
            SET img_src = $1,
                duration = $2
            WHERE id = $1`,
    values: [movie_id, `${movie_duration}`],
  };
  await queryHandler(pool, updateMovieImgSrc);

  // update cat/movie table ON CONFLICT DO NOTHING
  const addMovieCat = {
    text: `INSERT INTO ${moviesCatTable}(movies_id, categories_id)
            VALUES($1, $2)
            ON CONFLICT (movies_id, categories_id) DO NOTHING;`,
    values: [movie_id, cat_id],
  };
  await queryHandler(pool, addMovieCat);

  // update tags/movie table
  const insertTagsQuery = {
    text: `
      INSERT INTO ${moviesTagsTable}(movies_id, tags_id)
         VALUES ($movie_id,${tag_ids
           .map(v => `'${v}'::int`)
           .join('),($movie_id,')});
    `,
    values: {
      movie_id,
    },
  };

  const insertTagsReq = queryHandler(pool, insertTagsQuery);

  // update movie groups
  if (primary_group) {
    const addMovieGroupsQuery = {
      text: `
      INSERT INTO ${moviesGroupsTable}(movies_id, groups_id, related_groups_ids)
        VALUES($1, $2, $3)`,
      values: [movie_id, groupInfo.id, related_groups],
    };
    await queryHandler(pool, addMovieGroupsQuery);
  }

  // wait for transactions
  await Promise.all([createThumb, createGif, insertTagsReq]);

  return queryHandler(pool, {
    text: `SELECT
      mv.img_src as img_src,
      mv.name as movie_name,
      mv.notes as notes,
      grp.id as group_id,
      mvg.related_groups_ids as alt_group,
      array_agg(
        distinct tg.id
      ) FILTER (WHERE tg.id IS NOT NULL) as tag_ids,
      cat.id as category_id,
      mv.id AS movie_id,
      mv.duration AS movie_duration
    FROM ${moviesTable} AS mv
      LEFT JOIN ${moviesTagsTable} AS mvt
          ON mv.id = mvt.movies_id
      LEFT JOIN ${tagsTable} AS tg
          ON mvt.tags_id = tg.id
      LEFT JOIN ${moviesCatTable} AS mvc
          ON mv.id = mvc.movies_id
      LEFT JOIN ${categoriesTable} AS cat
          ON mvc.categories_id = cat.id
      LEFT JOIN ${moviesGroupsTable} AS mvg
          ON mv.id = mvg.movies_id
      LEFT JOIN ${groupsTable} AS grp
          ON mvg.groups_id = grp.id
      WHERE mv.id = $1
      GROUP BY
        mv.name,
        mv.id,
        cat.id,
        grp.id,
        mvg.related_groups_ids`,
    values: [movie_id],
  });
};

export default addMovieToDB;
