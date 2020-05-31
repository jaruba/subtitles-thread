const Promise = require('bluebird')

Promise.config({
    warnings: {
        wForgottenReturn: false
    }
});

const osMod = require('opensubtitles-api')
const fs = require('fs')
const parser = require('./parser')
const parseVideo = require('video-name-parser')

var objective = {};
var checkedFiles = {};
var subtitles = {};

function atob(str) {
    return Buffer.from(str, 'base64').toString('binary');
}

subtitles.os = new osMod(atob('T3BlblN1YnRpdGxlc1BsYXllciB2NC43'));
subtitles.findHashTime = 0;

subtitles.tryLater = hashMs => {
    subtitles.stopTrying();
    subtitles.findHashTime = setTimeout(() => {
        subtitles.findHash();
    }, hashMs);
}

subtitles.searchFor = (searcher, objective, postTo) => {
    subtitles.os.search(searcher).then( subData => {
        if (Object.keys(subData).length) {

            var result = {};
            for (var key in subData) {
                var item = subData[key]
                if (Array.isArray(item)) {
                    item.forEach((el, ij) => {
                        var vrf = el.url.substr(el.url.indexOf('vrf-'));
                        vrf = vrf.substr(0,vrf.indexOf('/'));
                        if (el.langcode) {
                            result[el.lang+ (ij ? ' ' + (ij+1) : '') + '[lg]'+el.langcode] = 'http://dl.opensubtitles.org/en/download/subencoding-utf8/'+vrf+'/file/'+el.url.split('/').pop()+'.'+el.format;
                        } else {
                            result[el.langName+ (ij ? ' ' + (ij+1) : '') + '[lg]'+el.lang] = 'http://dl.opensubtitles.org/en/download/subencoding-utf8/'+vrf+'/file/'+el.url.split('/').pop();
                        }
                    })
                } else {
                    var vrf = item.url.substr(item.url.indexOf('vrf-'));
                    vrf = vrf.substr(0,vrf.indexOf('/'));
                    if (item.langcode) {
                        result[item.lang+ '[lg]'+item.langcode] = 'http://dl.opensubtitles.org/en/download/subencoding-utf8/'+vrf+'/file/'+item.url.split('/').pop()+'.'+item.format;
                    } else {
                        result[item.langName+'[lg]'+item.lang] = 'http://dl.opensubtitles.org/en/download/subencoding-utf8/'+vrf+'/file/'+item.url.split('/').pop();
                    }
                }
            }
            objective.cb(result);
            objective = {};
        } else {
            objective.cb('null');
        }
        return subData;
    }).catch(err => {
        if (postTo) { // this means it's a hash check
            subtitles.tryLater(15000);
        }
    });
}

subtitles.byAnything = (objective, limit) => {
   if (!objective.sublanguageid)
        objective.sublanguageid = 'all'
    objective.extensions = ['srt','sub','vtt']
    objective.limit = limit

    subtitles.searchFor(objective, objective)
}

subtitles.byExactHash = (hash, fileSize, tag, limit) => {

    var filename = objective.filename;
    
    var searcher = {
        extensions: ['srt','sub','vtt'],
        hash: hash,
        filesize: fileSize,
        filename: filename,
        limit: limit,
    };

   searcher.sublanguageid = objective.sublanguageid || 'all'

    if (objective.imdbid)
        searcher.imdbid = objective.imdbid

    if (objective.query)
        searcher.query = objective.query

    if (filename) {
        var parsedFilename = parseVideo(filename);
        if (parsedFilename.type == 'series' && parsedFilename.season && (parsedFilename.episode || []).length) {
            searcher.season = parsedFilename.season + '';
            searcher.episode = parsedFilename.episode[0] + '';
        }

    }
    
    if (objective.fps) searcher.fps = objective.fps;

    subtitles.searchFor(searcher, objective);
}

subtitles.fetchSubs = newObjective => {
    subtitles.stopTrying();
    objective = newObjective;
    if (objective.filepath) {

        if (!objective.filename)
            objective.filename = parser(objective.filepath).filename()
        
        if (!objective.byteLength)
            objective.byteLength = fs.statSync(objective.filepath).size;

        subtitles.stopTrying();
        subtitles.findHash();

    } else {
        subtitles.byAnything(objective)
    }
}

subtitles.findHash = () => {

    var filepath = objective.filepath,
        byteLength = objective.byteLength,
        torrentHash = objective.torrentHash,
        isFinished = objective.isFinished,
        filename = objective.filename,
        limit = objective.limit;

    if (!checkedFiles[filename])
        checkedFiles[filename] = {};

    if (torrentHash) {
        subtitles.os.hash(filepath).then(infos => {
            var hash = infos.moviehash;
            if (isFinished) {
                if (byteLength) subtitles.byExactHash(hash, byteLength, filename, limit);
            } else {
                if (!checkedFiles[filename][hash]) {
                    checkedFiles[filename][hash] = 1;
                    subtitles.stopTrying();
                    subtitles.findHashTime = setTimeout(() => {
                        subtitles.findHash();
                    },10000);
                } else {
                    if (checkedFiles[filename][hash] >= 1) {
                        checkedFiles[filename][hash]++;
                        if (byteLength)
                            subtitles.byExactHash(hash, byteLength, filename, limit);
                        
                    } else checkedFiles[filename][hash]++;
                }
            }
        }).catch(err => {
            subtitles.findHashTime = setTimeout(() => {
                subtitles.findHash();
            },10000);
        });
    } else {
        subtitles.os.hash(filepath).then(infos => {
            if (!byteLength && filepath) {
                fs.stat(filepath, (err, stats) => {
                    if (stats && stats.size)
                        subtitles.byExactHash(infos.moviehash, stats.size, filename, limit);
                })
                byteLength = fs.statSync(filepath).size;
            } else {
                if (!byteLength) byteLength = 0;
                subtitles.byExactHash(infos.moviehash, byteLength, filename, limit);
            }
        }).catch(err => {
            // nothing else to do, local file
            objective.cb('null')
        });
    }
}

subtitles.stopTrying = () => {
    if (subtitles.findHashTime) {
        clearTimeout(subtitles.findHashTime);
        subtitles.findHashTime = null;
    }
}

process.on('message', msg => {
    objective = msg
    objective.cb = subs => {
        process.send && process.send(subs)
    };
    subtitles.fetchSubs(objective);
})

setTimeout(() => {}, 3600000)
