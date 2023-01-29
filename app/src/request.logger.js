const util = require('util');

const LOG_FORMAT = '  <-- %s %s %d %sms\n';

module.exports = function requestLogger(logger, options) {
    const opts = options || {};

    const defaultLevel = opts.level || 'info';

    return function (ctx, next) {
        const start = ctx[Symbol.for('request-received.startAt')]
            ? ctx[Symbol.for('request-received.startAt')]
            : process.hrtime();
        return next().then(() => {
            let delta = process.hrtime(start);

            // Format to high resolution time with nano time
            delta = delta[0] * 1000 + delta[1] / 1000000;

            // truncate to milliseconds.
            delta = Math.round(delta);

            logger[defaultLevel](
                {
                    method: ctx.method,
                    status: ctx.status,
                    ip: ctx.ip,
                    path: ctx.path,
                    httpVersion: ctx.req.httpVersion,
                    duration: delta,
                },
                util.format(LOG_FORMAT, ctx.method, ctx.path, ctx.status, delta)
            );
        });
    };
};
