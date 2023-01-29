const logger = require("logger");
const ErrorSerializer = require("serializers/error.serializer");

class AreaValidator {
    static isObject(property) {
        return property instanceof Object && property.length === undefined;
    }

    static isBool(property) {
        return typeof property === "boolean";
    }

    static notEmptyString(property) {
        return typeof property === "string" && property.length > 0;
    }

    static isArray(property) {
        if (property instanceof Array) {
            const invalid = property.filter((str) => {
                const regex = RegExp(
                    /^[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_ ]*$/i
                );
                return typeof str !== "string" || !regex.test(str);
            });
            return invalid.length === 0;
        }
        return false;
    }

    static async create(ctx, next) {
        logger.debug("Validating body for create area");
        ctx.checkBody("name").notEmpty().len(1, 100);
        ctx.checkBody("application")
            .optional()
            .check(
                (application) => AreaValidator.notEmptyString(application),
                "cannot be empty"
            );

        // Validate geostore field as hexadecimal only if present
        ctx.checkBody("geostore").optional();
        if (ctx.request.body.geostore) {
            ctx.checkBody("geostore").isHexadecimal();
        }
        ctx.checkBody("geostoreDataApi").optional();

        // Validate geostore and geostoreDataApi were not provided at the same time
        if (
            ctx.request.body.geostore &&
            ctx.request.body.geostore.length > 0 &&
            ctx.request.body.geostoreDataApi &&
            ctx.request.body.geostoreDataApi.length > 0
        ) {
            ctx.throw(
                400,
                "geostore and geostoreDataApi are mutually exclusive, cannot provide both at the same time"
            );
        }

        ctx.checkBody("datasets").optional().isJSON();
        ctx.checkBody("iso")
            .optional()
            .check((iso) => AreaValidator.isObject(iso), "must be an object");
        ctx.checkBody("admin")
            .optional()
            .check(
                (admin) => AreaValidator.isObject(admin),
                "must be an object"
            );
        ctx.checkBody("use")
            .optional()
            .check((use) => AreaValidator.isObject(use), "must be an object");
        ctx.checkBody("env")
            .optional()
            .toLow()
            .check(
                (env) => AreaValidator.notEmptyString(env),
                "must be a string"
            );
        ctx.checkBody("tags")
            .optional()
            .check(
                (tags) => AreaValidator.isArray(tags),
                "must be an array of valid strings"
            );
        ctx.checkBody("status")
            .optional()
            .check(
                (status) => AreaValidator.notEmptyString(status),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("public")
            .optional()
            .check((pub) => AreaValidator.isBool(pub), "must be boolean");
        ctx.checkBody("webhookUrl")
            .optional()
            .check(
                (webhookUrl) => AreaValidator.notEmptyString(webhookUrl),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("subscriptionId")
            .optional()
            .check(
                (sub) => AreaValidator.notEmptyString(sub),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("email")
            .optional()
            .check(
                (email) => AreaValidator.notEmptyString(email),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("language")
            .optional()
            .check(
                (lang) => AreaValidator.notEmptyString(lang),
                "must be a string - cannot be empty"
            );

        if (ctx.errors) {
            ctx.body = ErrorSerializer.serializeValidationBodyErrors(
                ctx.errors
            );
            ctx.status = 400;
            return;
        }
        await next();
    }

    static async updateByGeostore(ctx, next) {
        logger.debug("Validating body for update area by geostore");
        ctx.checkBody("/update_params/application", true)
            .optional()
            .check(
                (applications) =>
                    applications.forEach((application) =>
                        AreaValidator.notEmptyString(application)
                    ),
                "Applications can only have string values"
            );

        if (ctx.errors) {
            ctx.body = ErrorSerializer.serializeValidationBodyErrors(
                ctx.errors
            );
            ctx.status = 400;
            return;
        }
        await next();
    }

    static async update(ctx, next) {
        logger.debug("Validating body for update area");
        ctx.checkBody("name").optional().len(2, 100);
        ctx.checkBody("application")
            .optional()
            .check(
                (application) => AreaValidator.notEmptyString(application),
                "cannot be empty"
            );

        // Validate geostore field as hexadecimal only if present
        ctx.checkBody("geostore").optional();
        if (ctx.request.body.geostore) {
            ctx.checkBody("geostore").isHexadecimal();
        }
        ctx.checkBody("geostoreDataApi").optional();

        // Validate geostore and geostoreDataApi were not provided at the same time
        if (
            ctx.request.body.geostore &&
            ctx.request.body.geostore.length > 0 &&
            ctx.request.body.geostoreDataApi &&
            ctx.request.body.geostoreDataApi.length > 0
        ) {
            ctx.throw(
                400,
                "geostore and geostoreDataApi are mutually exclusive, cannot provide both at the same time"
            );
        }

        ctx.checkBody("datasets").optional().isJSON();
        ctx.checkBody("iso")
            .optional()
            .check((iso) => AreaValidator.isObject(iso), "must be an object");
        ctx.checkBody("admin")
            .optional()
            .check(
                (admin) => AreaValidator.isObject(admin),
                "must be an object"
            );
        ctx.checkBody("use")
            .optional()
            .check((use) => AreaValidator.isObject(use), "must be an object");
        ctx.checkBody("env")
            .optional()
            .check(
                (env) => AreaValidator.notEmptyString(env),
                "must be a string"
            );
        ctx.checkBody("templateId").optional();
        ctx.checkBody("tags")
            .optional()
            .check(
                (tags) => AreaValidator.isArray(tags),
                "must be an array of valid strings"
            );
        ctx.checkBody("status")
            .optional()
            .check(
                (status) => AreaValidator.notEmptyString(status),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("public")
            .optional()
            .check((pub) => AreaValidator.isBool(pub), "must be boolean");
        ctx.checkBody("webhookUrl")
            .optional()
            .check(
                (webhookUrl) => AreaValidator.notEmptyString(webhookUrl),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("subscriptionId")
            .optional()
            .check(
                (sub) => AreaValidator.notEmptyString(sub),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("email")
            .optional()
            .check(
                (email) => AreaValidator.notEmptyString(email),
                "must be a string - cannot be empty"
            );
        ctx.checkBody("language")
            .optional()
            .check(
                (lang) => AreaValidator.notEmptyString(lang),
                "must be a string - cannot be empty"
            );

        if (ctx.errors) {
            ctx.body = ErrorSerializer.serializeValidationBodyErrors(
                ctx.errors
            );
            ctx.status = 400;
            return;
        }
        await next();
    }
}

module.exports = AreaValidator;
