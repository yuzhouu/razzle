'use strict';

const path = require('path');
const fs = require('fs');
const Promise = require('promise');
const axios = require('axios');
const httpAdapter = require('axios/lib/adapters/http');
const copyDir = require('./utils/copy-dir');
const install = require('./utils/install');
const loadExample = require('./utils/load-example');
const loadGitHubExample = require('./utils/load-github-example');
const loadGitExample = require('./utils/load-git-example');
const loadNpmExample = require('./utils/load-npm-example');
const messages = require('./messages');

const isFolder = ({ type }) => type === 'dir';
const prop = key => obj => obj[key];

const branch = 'canary'; // this line auto updates when yarn update-examples is run
const razzlePkg = `razzle${branch == 'master' ? '' : '@' + branch}`;
const razzleDevUtilsPkg = `razzle-dev-utils${branch == 'master' ? '' : '@' + branch}`;

const officialExamplesApiUrl = `https://api.github.com/repos/jaredpalmer/razzle/contents/examples${
  branch == 'master' ? '' : '?ref=' + branch
}`;

const getOfficialExamples = () => {
  if (typeof process.env.CI === 'undefined') {
    return axios
      .get(officialExamplesApiUrl, { adapter: httpAdapter })
      .then(({ data }) => data.filter(isFolder).map(prop('name')));
  } else {
    return Promise.resolve(['basic']);
  }
};

module.exports = function createRazzleApp(opts) {
  const projectName = opts.projectName;

  if (!projectName) {
    console.log(messages.missingProjectName());
    process.exit(1);
  }

  if (fs.existsSync(projectName)) {
    console.log(messages.alreadyExists(projectName));
    process.exit(1);
  }

  const projectPath = (opts.projectPath = process.cwd() + '/' + projectName);

  if (opts.example) {
    if (/^https:\/\/github/.test(opts.example)) {
      loadGitHubExample({
        projectName: projectName,
        example: opts.example,
      }).then(installWithMessageFactory(opts, true))
        .catch(function(err) {
          throw err;
        });
    } else if (/^git\+/.test(opts.example)) {
      loadGitExample({
        projectName: projectName,
        example: opts.example,
      }).then(installWithMessageFactory(opts, true))
        .catch(function(err) {
          throw err;
        });
    } else if (/^file:/.test(opts.example)) {
      const examplePath = opts.example.slice(5);
      copyDir({
        templatePath: examplePath,
        projectPath: projectPath,
        projectName: projectName,
      }).then(installWithMessageFactory(opts, true))
        .catch(function(err) {
          throw err;
        });
    } else {
      getOfficialExamples().then(officialExamples => {
        if (officialExamples.includes(opts.example)) {
          loadExample({
            projectName: projectName,
            example: opts.example,
          }).then(installWithMessageFactory(opts, true))
            .catch(function(err) {
              throw err;
            });
        } else {
          loadNpmExample({
            projectName: projectName,
            example: opts.example,
          }).then(installWithMessageFactory(opts, true))
            .catch(function(err) {
              throw err;
            });
        }
      });
    }
  } else {
    const templatePath = path.resolve(__dirname, '../templates/default');

    copyDir({
      templatePath: templatePath,
      projectPath: projectPath,
      projectName: projectName,
    })
      .then(installWithMessageFactory(opts))
      .catch(function(err) {
        throw err;
      });
  }
};

function installWithMessageFactory(opts, isExample = false) {
  const projectName = opts.projectName;
  const projectPath = opts.projectPath;

  if (!opts.install) {
    return function() {
      console.log(messages.start(projectName));
    };
  }

  return function installWithMessage() {
    return install({
      projectName: projectName,
      projectPath: projectPath,
      packages: isExample
        ? [razzlePkg, razzleDevUtilsPkg]
        : [
            'react',
            'react-dom',
            'react-router-dom',
            razzlePkg,
            razzleDevUtilsPkg,
            'express',
          ],
    })
      .then(function() {
        console.log(messages.start(projectName));
      })
      .catch(function(err) {
        throw err;
      });
  };
}
