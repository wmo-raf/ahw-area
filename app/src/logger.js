const config = require('config');
const gelfy = require('gelfy');
const bunyan = require('bunyan');

const bformat = require('bunyan-format');

const formatOut = bformat({ outputMode: 'long' });
const formatErr = bformat({ outputMode: 'long' }, process.stderr);

const streams = [
    {
        stream: formatOut,
        level: config.get('logger.level') || 'debug',
    },
    {
        stream: formatErr,
        level: 'warn',
    },
];

if (config.get('logger.toFile')) {
    streams.push({
        level: config.get('logger.level') || 'debug',
        path: config.get('logger.dirLogFile'),
    });
}

// log to graylog if configured
if (config.get('logger.graylog.host') && config.get('logger.graylog.port')) {
    const bunyanStream = gelfy.createBunyanStream({
        host: config.get('logger.graylog.host'),
        port: config.get('logger.graylog.port'),
        protocol: 'udp',
    });

    streams.push({
        stream: bunyanStream,
        type: 'raw',
        level: 'info',
    });
}

const logger = bunyan.createLogger({
    name: config.get('logger.name'),
    src: true,
    streams,
});

module.exports = logger;
