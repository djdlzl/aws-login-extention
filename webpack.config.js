const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    popup: './popup.js',
    background: './background.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    clean: true
  },
  resolve: {
    fallback: {
      "crypto": require.resolve("crypto-browserify"),
      "vm": require.resolve("vm-browserify"),
      "buffer": require.resolve("buffer/"),
      "stream": require.resolve("stream-browserify"),
      "process": require.resolve("process/browser")
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'node_modules/@fortawesome/fontawesome-free/css/all.min.css', to: 'all.min.css' },
        { from: 'node_modules/@fortawesome/fontawesome-free/webfonts', to: 'webfonts' }, // 폰트 복사
        { from: 'popup.html', to: 'popup.html' },
        { from: 'styles.css', to: 'styles.css' },
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'icon16.png', to: 'icon16.png' },
        { from: 'icon48.png', to: 'icon48.png' },
        { from: 'icon128.png', to: 'icon128.png' }
      ]
    })
  ]
};