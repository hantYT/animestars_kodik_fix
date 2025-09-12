const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    'content-script': './src/content/content-script.ts',
    'background': './src/background/background.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  target: 'web',
  optimization: {
    minimize: false // Для лучшей отладки
  },
  plugins: [
    // Очищаем dist перед сборкой
    new CleanWebpackPlugin(),
    
    // Копируем статические файлы
    new CopyWebpackPlugin({
      patterns: [
        // Манифест
        {
          from: 'manifest.json',
          to: 'manifest.json'
        },
        // Стили
        {
          from: 'src/styles',
          to: '.',
          globOptions: {
            ignore: ['**/.gitkeep']
          },
          noErrorOnMissing: true
        },
        // Popup файлы
        {
          from: 'src/popup',
          to: '.',
          globOptions: {
            ignore: ['**/.gitkeep']
          },
          noErrorOnMissing: true
        },
        // Иконки
        {
          from: 'assets/icons',
          to: 'icons',
          globOptions: {
            ignore: ['**/.gitkeep']
          },
          noErrorOnMissing: true
        },
        // HLS.js библиотека
        {
          from: 'assets/hls.min.js',
          to: 'hls.min.js',
          noErrorOnMissing: true
        },
        // Любые другие статические ресурсы
        {
          from: 'assets/static',
          to: '.',
          globOptions: {
            ignore: ['**/.gitkeep']
          },
          noErrorOnMissing: true
        }
      ]
    })
  ]
};
