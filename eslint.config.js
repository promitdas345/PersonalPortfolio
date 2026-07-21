const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'claude-code/**',
      'public/flappy-bird-ai/libraries/**',
    ],
  },
  {
    files: ['server.js', 'build.js', 'lib/**/*.js', 'routes/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['public/**/*.js'],
    ignores: ['public/flappy-bird-ai/libraries/**', 'public/flappy-bird-ai/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, gtag: 'readonly', Quill: 'readonly' },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // p5.js global-mode sketch split across multiple <script> tags that share
    // one browser global scope; each file's own top-level `let`s look
    // undefined to eslint when linted in isolation.
    files: ['public/flappy-bird-ai/**/*.js'],
    ignores: ['public/flappy-bird-ai/libraries/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // p5.js built-ins
        createCanvas: 'readonly', resizeCanvas: 'readonly', createVector: 'readonly',
        createFileInput: 'readonly', loadImage: 'readonly', windowWidth: 'readonly', windowHeight: 'readonly',
        push: 'readonly', pop: 'readonly', translate: 'readonly', rotate: 'readonly', image: 'readonly',
        fill: 'readonly', stroke: 'readonly', strokeWeight: 'readonly', rect: 'readonly',
        text: 'readonly', textAlign: 'readonly', textSize: 'readonly',
        constrain: 'readonly', map: 'readonly', random: 'readonly', randomGaussian: 'readonly',
        abs: 'readonly', floor: 'readonly', min: 'readonly', max: 'readonly', pow: 'readonly',
        PI: 'readonly', LEFT: 'readonly', RIGHT: 'readonly', RIGHT_ARROW: 'readonly',
        key: 'readonly', keyCode: 'readonly', frameRate: 'readonly',
        // shared across sketch.js/bird.js/pipe.js/population.js/etc.
        canvas: 'writable', gravity: 'writable', panSpeed: 'writable', superSpeed: 'writable',
        pauseBecauseDead: 'writable', birdSprite: 'writable', topPipeSprite: 'writable',
        bottomPipeSprite: 'writable', groundSprite: 'writable', randomPipeHeights: 'writable',
        showBest: 'writable', showNothing: 'writable', worlds: 'writable', connectionGene: 'writable',
        Player: 'writable', Ground: 'writable', Pipe: 'writable', PipePair: 'writable',
        Population: 'writable', Species: 'writable', Genome: 'writable', arrayCopy: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
    },
  },
];
