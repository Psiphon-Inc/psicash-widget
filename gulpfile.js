/* eslint-env node */

'use strict';

const browserify = require('browserify');
const babelify   = require('babelify');
const gulp = require('gulp');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const log = require('gulplog');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const connect = require('gulp-connect');
const del = require('del');
const replace = require('gulp-replace');
const rename = require('gulp-rename');
const merge = require('merge-stream');
const exec = require('child_process').exec;
const awspublish = require('gulp-awspublish');
const path = require('path');


let config = {
  version: 'v2',
  src: {
    widget: 'src/widget',
    landing: 'landing'
  },
  dist: {
    base: 'dist',
    get widgetRoot() { return `${config.dist.base}/widget`; },
    get widget() { return `${config.dist.widgetRoot}/${config.version}`; },
    get landing() { return `${config.dist.base}/landing`; }
  },
  js: {
    entryPoints: ['src/widget/iframe.js', 'src/widget/page.js'],
    outputFile: 'psicash.js',
  },
  copy: {
    get landing() { return `${config.src.landing}/*.html`; },
    get widget() { return `${config.src.widget}/*.html`; }
  },
  serve: {
    landingPort: 33333,
    widgetPort: 44444,
    base: 'temp'
  }
};

function clean() {
  return del([config.dist.base, config.serve.base]);
}

function javascript() {
  // set up the browserify instance on a task basis
  let b = browserify({
    entries: config.js.entryPoints,
    debug: true})
    .transform(babelify, { presets : [ '@babel/env' ], plugins: [ '@babel/plugin-proposal-class-properties' ] });

  return b.bundle()
    .pipe(source(config.js.outputFile))
    .pipe(gulp.dest(config.dist.widget));
}

function discardSourceMap() {
  return gulp
    .src(`${config.dist.widget}/${config.js.outputFile}`)
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    // We loaded the sourcemaps, but we're not writing them
    .pipe(gulp.dest(config.dist.widget));
}

function uglification() {
  return gulp
    .src(`${config.dist.widget}/${config.js.outputFile}`)
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    // Add transformation tasks to the pipeline here.
    .pipe(uglify())
    .on('error', log.error)
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest(config.dist.widget));
}

function dist() {
  return merge(
    gulp
      .src(config.copy.landing)
      .pipe(gulp.dest(config.dist.landing)),
    gulp
      .src(config.copy.widget)
      .pipe(gulp.dest(config.dist.widget)));
}

function webserverPrep() {
  // To serve the landing pages and widget we need to rewrite some of the URLs in the files.
  return gulp.src([`${config.dist.base}/*/**`])
    .pipe(replace('https://widget.psi.cash', `http://localhost:${config.serve.widgetPort}`))
    // Flip this flag when serving for testing
    .pipe(replace('LOCAL_TESTING_BUILD = false', 'LOCAL_TESTING_BUILD = true'))
    .pipe(gulp.dest(`${config.serve.base}/${config.dist.base}`));
}

function webserver(cb) {
  connect.server({
    port: config.serve.landingPort,
    root: `${config.serve.base}/${config.dist.landing}`
  });

  connect.server({
    port: config.serve.widgetPort,
    root: `${config.serve.base}/${config.dist.widgetRoot}`
  });

  cb();
}

function gitInfo(cb) {
  let cmd = `git describe --always --long --dirty --tags > ${config.dist.widget}/git.txt`;
  exec(cmd, function(err/*, stdout, stderr*/) {
    cb(err);
  });
}

function deployProd(callback) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('You are attempting to deploy to prod. Are you sure? ', response => {
    readline.close();
    if (response !== 'yes') {
      callback(new Error('Response is not "yes"; aborting'));
    }

    callback(null, s3Upload(false));
  });
}

function deployDev() {
  return s3Upload(true);
}

function s3Upload(isDev) {
  // create a new publisher using S3 options
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
  const publisher = awspublish.create(
    {
      region: 'us-east-1',
      params: {
        Bucket: 'psicash'
      }
    }
  );

  // define custom headers
  const headers = {
    'Cache-Control': 'must-revalidate, public'
  };

  return gulp
    .src(`${config.dist.base}/*/**`)

    // Dev files live in the same bucket, with different key prefix
    .pipe(
      rename(function(filepath) {
        if (isDev) {
          let dirs = filepath.dirname.split(path.sep);
          dirs[0] = `${dirs[0]}-dev`;
          filepath.dirname = dirs.join(path.sep);
        }
      })
    )

    // gzip, Set Content-Encoding headers and add .gz extension
    //.pipe(awspublish.gzip({ ext: '.gz' })) // CloudFront auto-compresses for us

    // publisher will add Content-Length, Content-Type and headers specified above
    // If not specified it will set x-amz-acl to public-read by default
    .pipe(publisher.publish(headers))

    // print upload updates to console
    .pipe(awspublish.reporter());
}

function shopify() {
  // All our steps and config are in this funciton, for coding expediency.
  // We should clean this up at some point.

  // set up the browserify instance on a task basis
  let b = browserify({
    entries: ['src/shopify/shopify.js'],
    debug: true})
    .transform(babelify, { presets : [ '@babel/env' ], plugins: [ '@babel/plugin-proposal-class-properties' ] });

  return b.bundle()
    .pipe(source('shopify-psicash.js'))
    .pipe(gulp.dest('dist/shopify'))
    //* disable uglification
    .pipe(buffer())
    .pipe(sourcemaps.init({loadMaps: true}))
    // Add transformation tasks to the pipeline here.
    .pipe(uglify())
    .on('error', log.error)
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('dist/shopify'));//*/
}

function devifyBuild() {
  // To serve the landing pages and widget we need to rewrite some of the URLs in the files.
  return gulp.src([`${config.dist.base}/*/**`])
    .pipe(replace('https://widget.psi.cash', `https://widget.dev.psi.cash`))
    .pipe(replace('IS_NOT_DEV_BUILD', 'IS_____DEV_BUILD'))
    .pipe(gulp.dest(config.dist.base));
}

let fullBuild = gulp.series(javascript, uglification, dist, gitInfo);
let serveBuild = gulp.series(javascript, dist, discardSourceMap, webserverPrep);

function watch() {
  return gulp.watch([`${config.src.landing}/*`, `${config.src.widget}/*`], serveBuild);
}

exports.clean = clean;
exports.build = gulp.series(clean, fullBuild);
exports.serve = gulp.series(clean, serveBuild, webserver, watch);
exports.shopify = gulp.series(shopify);
exports.deployDev = gulp.series(devifyBuild, deployDev);
exports.deployProd = deployProd;
