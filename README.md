# Project Setup

See also https://www.keithcirkel.co.uk/how-to-use-npm-as-a-build-tool/

`npm install -D node-sass`

(directory needs to contain at least one sccss file)

`npm install eslint --save-dev`

`npm install eslint-config-airbnb --save-dev`

`npm install eslint-plugin-react --save-dev`

(eslint-config-airbnb apparently needs the eslint-plugin-react plugin in package.json)

Babel when required (global install):

`sudo npm install --global babel-cli`

And the necessary Babel profile:

`npm install --save-dev babel-preset-es2015`

Browserify to make modules:

`npm install browserify --save-dev`

Some tools needed for the various build goals:

`npm install parallelshell`

`npm install onchange`

`npm install http-server`

# Project Development

Run one of the goals, for example: `npm run build:watch`

# Adding Dependencies

Add as a node package: `npm install <somepackage>`

Then you require the relevant package in your module: `require <somepackage>`