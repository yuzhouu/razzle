#! /usr/bin/env node
'use strict';

process.env.NODE_ENV = 'development';
const fs = require('fs-extra');
const mri = require('mri');
const webpack = require('webpack');
const createConfig = require('../config/createConfigAsync');
const loadRazzleConfig = require('../config/loadRazzleConfig');
const devServer = require('../config/razzleDevServer');
const printErrors = require('razzle-dev-utils/printErrors');
const clearConsole = require('react-dev-utils/clearConsole');
const logger = require('razzle-dev-utils/logger');
const setPorts = require('razzle-dev-utils/setPorts');
const chalk = require('chalk');
const terminate = require('terminate');

process.once('SIGINT', () => {
  console.error(chalk.bgRedBright(' SIGINT '), chalk.redBright('exiting...'));
  terminate(process.pid, 'SIGINT', { timeout: 1000 }, () => {
    console.error(chalk.bgGreen(' Goodbye '));
    terminate(process.pid);
  });
});

process.noDeprecation = true; // turns off that loadQuery clutter.

const argv = process.argv.slice(2);
const cliArgs = mri(argv);
// Capture any --inspect or --inspect-brk flags (with optional values) so that we
// can pass them when we invoke nodejs
process.env.INSPECT_BRK = formatInspectFlag(cliArgs, 'inspect-brk');
process.env.INSPECT = formatInspectFlag(cliArgs, 'inspect');

function main() {
  return new Promise(async (resolve, reject) => {
    loadRazzleConfig(webpack).then(
      async ({ razzle, razzleOptions, webpackObject, plugins, paths }) => {

        const verbose = razzleOptions.verbose;

        const clientOnly = /spa|single-page-application/.test(razzleOptions.buildType);
        const serverOnly = /serveronly|server-only/.test(razzleOptions.buildType);

        process.env.BUILD_TYPE = razzleOptions.buildType;

        setPorts(clientOnly)
        .then(async () => {
          // Optimistically, we make the console look exactly like the output of our
          // FriendlyErrorsPlugin during compilation, so the user has immediate feedback.
          // clearConsole();
          logger.start('Compiling...');

          let clientConfig;
          // Create dev configs using our config factory, passing in razzle file as
          // options.
          clientConfig = await createConfig(
            'web',
            'dev',
            razzle,
            webpackObject,
            clientOnly,
            paths,
            plugins,
            razzleOptions
          );
          if (clientOnly) {
            // Check for public/index.html file
            if (!fs.existsSync(paths.appHtml)) {
              clearConsole();
              logger.error(`index.html dose not exists public folder.`);
              process.exit(1);
            }
          }

          // Delete assets.json to always have a manifest up to date
          fs.removeSync(paths.appAssetsManifest);

          const clientCompiler = compile(clientConfig, verbose);

          let serverCompiler;
          let serverConfig;
          if (!clientOnly) {
            serverConfig = await createConfig(
              'node',
              'dev',
              razzle,
              webpackObject,
              clientOnly,
              paths,
              plugins,
              razzleOptions
            );
            serverCompiler = compile(serverConfig, verbose);
          }

          const port = razzle.port || clientConfig.devServer.port;

          // Compile our assets with webpack
          // Instatiate a variable to track server watching
          let watching;

          // in SPA mode we want to give the user
          // feedback about the port that app is running on
          // this variable helps us to don't show
          // the message multiple times ...
          let logged = false;

          // Start our server webpack instance in watch mode after assets compile
          clientCompiler.hooks.done.tap('razzle', () => {
            // If we've already started the server watcher, bail early.
            if (watching) {
              return;
            }

            if (!clientOnly && serverCompiler) {
              // Otherwise, create a new watcher for our server code.
              watching = serverCompiler.watch(
                {
                  quiet: !verbose,
                  stats: 'none',
                },
                /* eslint-disable no-unused-vars */
                stats => {}
              );
            }

            // in SPA mode we want to give the user
            // feedback about the port that app is running on
            if (clientOnly && !logged) {
              logged = true;
              console.log(chalk.green(`> SPA Started on port ${port}`));
            }
          });

          // Create a new instance of Webpack-dev-server for our client assets.
          // This will actually run on a different port than the users app.
          const clientDevServer = new devServer(
            clientCompiler,
            Object.assign(clientConfig.devServer, { verbose: verbose })
          );
          // Start Webpack-dev-server
          clientDevServer.listen(port, err => {
            if (err) {
              logger.error(err);
            }
          });

          ['SIGINT', 'SIGTERM'].forEach(sig => {
            process.on(sig, () => {
              clientDevServer.close();
              if (watching) {
                watching.close();
              }
            });
          });

          resolve();
        }
      );

    })
    .catch(console.error);
  });
}

// Webpack compile in a try-catch
function compile(config, verbose) {
  let compiler;
  try {
    compiler = webpack(config);
  } catch (e) {
    printErrors('Failed to compile.', [e], verbose);
    process.exit(1);
  }
  return compiler;
}

function formatInspectFlag(cliArgs, flag) {
  const value = cliArgs[flag];

  if (typeof value === 'undefined' || value === '') {
    return '';
  }

  // When passed as `--inspect`.
  if (value === true) {
    return '--' + flag;
  }

  // When passed as `--inspect=[port]` or `--inspect=[host:port]`
  return '--' + flag + '=' + value.toString();
}

main();
