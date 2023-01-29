const config = require("config");
const jwt = require("jsonwebtoken");
const logger = require("logger");

const auth = config.get("auth");

const jwtSecret = `-----BEGIN PUBLIC KEY-----\r\n${auth.secret}\r\n-----END PUBLIC KEY-----`;

const jwtVerify = async (ctx, next) => {
    let token = null;

    if (ctx.headers && ctx.headers.authorization) {
        const parts = ctx.headers.authorization.split(" ");
        if (parts.length === 2) {
            const scheme = parts[0];
            if (/^Bearer$/i.test(scheme)) {
                // eslint-disable-next-line
                token = parts[1];
            }
        }
    }

    if (token) {
        logger.info("Checking token");
        try {
            const jwtDecodedToken = jwt.verify(token, jwtSecret, {
                algorithms: ["RS256"],
            });

            if (jwtDecodedToken) {
                const user = {
                    id: jwtDecodedToken.sub,
                    email: jwtDecodedToken.email,
                    role:
                        jwtDecodedToken.resource_access &&
                        jwtDecodedToken.resource_access[auth.clientId] &&
                        jwtDecodedToken.resource_access[auth.clientId].roles[0],
                };
                ctx.state.loggedUser = user;
            }
        } catch (err) {
            logger.info("Invalid token", err);
        }
    }

    await next();
};

module.exports = jwtVerify;
