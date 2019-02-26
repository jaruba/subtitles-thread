var path = require('path')
var fs = require('fs')
var child = require('child_process')

var back = '../..';
var binDir = path.resolve(__dirname, back, 'bin');

// in case of asar, go one level down
while (binDir.includes('/app.asar/') || binDir.includes('\\app.asar\\')) {
    back += '/..'
    binDir = path.resolve(__dirname, back, 'bin');
}

// for safety
if (!fs.existsSync(binDir)) {
  back += '/..'
  binDir = path.resolve(__dirname, back, 'bin');
}

var subtitlesThread = path.join(binDir, 'subtitles-thread')

var fileName = 'subtitles-thread' + (process.platform == 'win32' ? '.exe' : '')

if (fs.existsSync(path.join(subtitlesThread, fileName)))
  subtitlesThread = path.join(subtitlesThread, fileName)

module.exports = () => {
  return child.spawn(subtitlesThread, { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] })
}
