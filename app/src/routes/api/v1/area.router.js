const Router = require("koa-router");
const logger = require("logger");
const config = require("config");

const AreaSerializer = require("serializers/area.serializer");
const AreaModel = require("models/area.model");
const AreaValidator = require("validators/area.validator");
const mongoose = require("mongoose");
const MailService = require("services/mail.service");
const MbglService = require("services/mbgl.service");
const S3Service = require("services/s3.service");

const shouldUseAllFilter = (ctx) =>
    ctx.state.loggedUser.role === "ADMIN" &&
    ctx.query.all &&
    ctx.query.all.trim().toLowerCase() === "true";

const getHostForPaginationLink = (ctx) => {
    if ("referer" in ctx.request.header) {
        const url = new URL(ctx.request.header.referer);
        return url.host;
    }
    return ctx.request.host;
};

function getFilters(ctx) {
    const filter = shouldUseAllFilter(ctx)
        ? {}
        : { userId: ctx.state.loggedUser.id };

    const { query } = ctx;
    if (query.application) {
        filter.application = query.application
            .split(",")
            .map((el) => el.trim());
    }

    if (query.status) {
        filter.status = query.status.trim();
    }

    if (query.public) {
        filter.public = query.public.trim().toLowerCase() === "true";
    }

    const env = query.env ? query.env : "production";
    filter.env = { $in: env.split(",").map((elem) => elem.trim()) };

    return filter;
}

function getFilteredSort(sort) {
    const sortParams = sort.split(",");
    const filteredSort = {};
    const areaAttributes = Object.keys(AreaModel.schema.obj);
    sortParams.forEach((param) => {
        let sign = param.substr(0, 1);
        let signlessParam = param.substr(1);
        if (sign !== "-" && sign !== "+") {
            signlessParam = param;
            sign = "+";
        }
        if (areaAttributes.indexOf(signlessParam) >= 0) {
            filteredSort[signlessParam] = parseInt(sign + 1, 10);
        }
    });
    return filteredSort;
}

function getEmailParametersFromArea(area) {
    const { id, name } = area;
    const emailTags = area.tags && area.tags.join(", ");

    return {
        id,
        name,
        tags: emailTags,
        image_url: area.image,
        location: name,
        subscriptions_url: `${config.get("ahw.flagshipUrl")}/my-hw?lang=${
            area.language
        }`,
        dashboard_link: `${config.get(
            "ahw.flagshipUrl"
        )}/dashboards/aoi/${id}?lang=${area.language}`,
        map_link: `${config.get("ahw.flagshipUrl")}/map/aoi/${id}?lang=${
            area.language
        }`,
    };
}

const serializeObjToQuery = (obj) =>
    Object.keys(obj)
        .reduce((a, k) => {
            a.push(`${k}=${encodeURIComponent(obj[k])}`);
            return a;
        }, [])
        .join("&");

const SUPPORTED_LANG_CODES = ["en"];
const DEFAULT_LANG_CODE = "en";

class AreaRouter {
    static async getAll(ctx) {
        logger.info(
            "[AREAS-ROUTER] Obtaining all areas of the user ",
            ctx.state.loggedUser.id
        );
        const { query, request } = ctx;
        const sort = query.sort || "_id";

        const filter = getFilters(ctx);

        logger.info(`[AREAS-ROUTER] Going to find areas`);
        const page = query["page[number]"]
            ? parseInt(query["page[number]"], 10)
            : 1;
        const limit = query["page[size]"]
            ? parseInt(query["page[size]"], 10)
            : 300;

        const clonedQuery = { ...ctx.query };
        delete clonedQuery["page[size]"];
        delete clonedQuery["page[number]"];
        const serializedQuery = serializeObjToQuery(clonedQuery)
            ? `?${serializeObjToQuery(clonedQuery)}&`
            : "?";

        const apiVersion =
            ctx.mountPath.split("/")[ctx.mountPath.split("/").length - 1];
        const link = `${request.protocol}://${getHostForPaginationLink(
            ctx
        )}/${apiVersion}${request.path}${serializedQuery}`;
        const filteredSort = getFilteredSort(sort);

        const areas = await AreaModel.paginate(filter, {
            page,
            limit,
            sort: filteredSort,
        });

        // await Promise.all(
        //     areas.docs.map(SubscriptionService.mergeSubscriptionSpecificProps)
        // );

        ctx.body = AreaSerializer.serialize(areas, link);
    }

    static async get(ctx) {
        logger.info(`Obtaining area with areaId ${ctx.params.id}`);

        if (!mongoose.Types.ObjectId.isValid(ctx.params.id)) {
            ctx.throw(404, "Area not found");
        }

        // 1. Check for area in areas
        const area = await AreaModel.findById(ctx.params.id);
        const areaExists = area !== null;

        if (!areaExists) {
            ctx.throw(404, "Area not found");
        }

        const user = ctx.state.loggedUser || null;

        if (
            area.public === false &&
            (!user ||
                (user && area.userId !== user.id && user.role !== "ADMIN"))
        ) {
            ctx.throw(401, "Area private");
            return;
        }

        const shouldHideAreaInfo =
            !user || (user && area.userId !== user.id && user.role !== "ADMIN");

        if (shouldHideAreaInfo) {
            area.tags = null;
            area.userId = null;
            area.name = null;
            area.webhookUrl = null;
            area.email = null;
            area.language = null;
        }

        if (areaExists && shouldHideAreaInfo) {
            area.subscriptionId = null;
        }

        // area = await SubscriptionService.mergeSubscriptionSpecificProps(area);

        ctx.body = AreaSerializer.serialize(area);
    }

    static async save(ctx) {
        logger.info("Saving area", ctx.request.body);
        const userId = ctx.state.loggedUser.id;

        // save all areas for now
        // TODO: check if we need to process a custom area before saving
        let isSaved = true;

        let image = "";

        if (ctx.request.body.geostore && ctx.request.body.mapStyle) {
            const imageBuffer = await MbglService.getImageFromStyle(
                ctx.request.body.mapStyle
            ).catch((err) => {
                logger.debug("Error getting map image", err);
            });

            const fileName = `${ctx.request.body.geostore}.png`;

            image = await S3Service.uploadBuffer(imageBuffer, fileName).catch(
                (err) => {
                    logger.debug("Error uploading map image", err);
                }
            );
        }

        // Check geostore exists already with status=saved
        const geostore =
            (ctx.request.body && ctx.request.body.geostore) || null;

        logger.info(
            `Checking if data created already for geostore ${geostore}`
        );
        if (geostore) {
            const existsAreaForGeostore =
                await AreaModel.existsSavedAreaForGeostore(geostore);
            if (existsAreaForGeostore) {
                isSaved = true;
            }
        }

        // Check geostoreDataApi exists already with status=saved
        const geostoreDataApi =
            (ctx.request.body && ctx.request.body.geostoreDataApi) || null;
        logger.info(
            `Checking if data created already for geostoreDataApi ${geostoreDataApi}`
        );
        if (geostoreDataApi) {
            const existsAreaForGeostoreDataApi =
                await AreaModel.existsSavedAreaForGeostoreDataApi(
                    geostoreDataApi
                );
            if (existsAreaForGeostoreDataApi) {
                isSaved = true;
            }
        }

        let datasets = [];
        if (ctx.request.body.datasets) {
            datasets = JSON.parse(ctx.request.body.datasets);
        }
        const use = {};
        if (ctx.request.body.use) {
            use.id = ctx.request.body.use ? ctx.request.body.use.id : null;
            use.name = ctx.request.body.use ? ctx.request.body.use.name : null;
        }
        const iso = {};
        if (ctx.request.body.iso) {
            iso.country = ctx.request.body.iso
                ? ctx.request.body.iso.country
                : null;
            iso.region = ctx.request.body.iso
                ? ctx.request.body.iso.region
                : null;
            if (iso.country || iso.region) {
                isSaved = true;
            }
        }
        const admin = {};
        if (ctx.request.body.admin) {
            admin.adm0 = ctx.request.body.admin
                ? ctx.request.body.admin.adm0
                : null;
            admin.adm1 = ctx.request.body.admin
                ? ctx.request.body.admin.adm1
                : null;
            admin.adm2 = ctx.request.body.admin
                ? ctx.request.body.admin.adm2
                : null;
            if (admin.adm0) {
                isSaved = true;
            }
        }
        let wdpaid = null;
        if (ctx.request.body.wdpaid) {
            wdpaid = ctx.request.body.wdpaid;
            if (wdpaid) {
                isSaved = true;
            }
        }
        let tags = [];
        if (ctx.request.body.tags) {
            tags = ctx.request.body.tags;
        }
        let publicStatus = false;
        if (ctx.request.body.public) {
            publicStatus = ctx.request.body.public;
        }

        let webhookUrl = "";
        if (ctx.request.body.webhookUrl) {
            webhookUrl = ctx.request.body.webhookUrl;
        }

        let email = "";
        if (ctx.request.body.email) {
            email = ctx.request.body.email;
        }

        logger.info(`Building areaData`);

        const areaData = {
            name: ctx.request.body.name,
            application: ctx.request.body.application || "ahw",
            geostore: ctx.request.body.geostore,
            geostoreDataApi: ctx.request.body.geostoreDataApi,
            wdpaid,
            userId: userId || ctx.state.loggedUser.id,
            use,
            env: ctx.request.body.env || "production",
            iso,
            admin,
            datasets,
            image,
            tags,
            status: isSaved ? "saved" : "pending",
            public: publicStatus,
            webhookUrl,
            language: SUPPORTED_LANG_CODES.includes(ctx.request.body.language)
                ? ctx.request.body.language
                : DEFAULT_LANG_CODE,
            email,
        };
        logger.info(
            `Creating area with the following data: ${JSON.stringify(
                areaData
            )}`
        );

        const area = await new AreaModel(areaData).save();

        ctx.body = AreaSerializer.serialize(area);

        if (email) {
            const { application, language } = area;
            const lang = language || "en";
            await MailService.sendMail(
                `dashboard-complete-${lang}`,
                getEmailParametersFromArea(area),
                [{ address: area.email }],
                application
            );
        }
    }

    static async update(ctx) {
        const area = await AreaModel.findById(ctx.params.id);
        if (!area) {
            ctx.throw(404, "Area not found");
            return;
        }

        const { body } = ctx.request;

        if (body.application || !area.application) {
            area.application = body.application || "gfw";
        }
        if (body.name) {
            area.name = body.name;
        }

        let isSaved = false;

        if (body.geostore) {
            // check if it exists in db with status=saved
            const { geostore } = body;
            logger.info(
                `Checking if data created already for geostore ${geostore}`
            );
            if (await AreaModel.existsSavedAreaForGeostore(geostore))
                isSaved = true;
            area.geostore = body.geostore;

            // Update status to saved if geostore already exists with status=saved
            area.status = isSaved ? "saved" : "pending";
            logger.info(
                `Updating area with id ${ctx.params.id} to status ${
                    isSaved ? "saved" : "pending"
                }`
            );
        } else if (body.geostore === null) {
            area.geostore = null;
        }

        if (Object.keys(body).includes("geostoreDataApi")) {
            const { geostoreDataApi } = body;
            area.geostoreDataApi = geostoreDataApi;

            // check if it exists in db with status=saved
            logger.info(
                `Checking if data created already for geostoreDataApi ${geostoreDataApi}`
            );
            if (geostoreDataApi) {
                const existsAreaForGeostoreDataApi =
                    await AreaModel.existsSavedAreaForGeostoreDataApi(
                        geostoreDataApi
                    );
                if (existsAreaForGeostoreDataApi) {
                    isSaved = true;
                }
            }

            // Update status to saved if geostoreDataApi already exists with status=saved
            area.status = isSaved ? "saved" : "pending";

            logger.info(
                `Updating area with id ${ctx.params.id} to status ${
                    isSaved ? "saved" : "pending"
                }`
            );
        }

        if (body.wdpaid) {
            area.wdpaid = body.wdpaid;
        }
        const use = {};
        if (body.use) {
            use.id = body.use ? body.use.id : null;
            use.name = body.use ? body.use.name : null;
        }
        area.use = use;
        const iso = {};
        if (body.iso) {
            iso.country = body.iso ? body.iso.country : null;
            iso.region = body.iso ? body.iso.region : null;
        }
        area.iso = iso;
        const admin = {};
        if (body.admin) {
            admin.adm0 = body.admin ? body.admin.adm0 : null;
            admin.adm1 = body.admin ? body.admin.adm1 : null;
            admin.adm2 = body.admin ? body.admin.adm2 : null;
        }
        area.admin = admin;
        if (body.datasets) {
            area.datasets = JSON.parse(body.datasets);
        }
        if (body.tags) {
            area.tags = body.tags;
        }
        if (body.public) {
            area.public = body.public;
        }
        const updateKeys = body && Object.keys(body);

        area.public = updateKeys.includes("public") ? body.public : area.public;

        area.webhookUrl = updateKeys.includes("webhookUrl")
            ? body.webhookUrl
            : area.webhookUrl;

        area.env = updateKeys.includes("env") ? body.env : area.env;

        area.subscriptionId = updateKeys.includes("subscriptionId")
            ? body.subscriptionId
            : area.subscriptionId;
        area.email = updateKeys.includes("email") ? body.email : area.email;
        area.status =
            updateKeys.includes("status") &&
            ctx.state.loggedUser.role === "ADMIN"
                ? body.status
                : area.status;
        if (updateKeys.includes("language")) {
            area.language = SUPPORTED_LANG_CODES.includes(body.language)
                ? body.language
                : DEFAULT_LANG_CODE;
        }

        if (typeof body.templateId !== "undefined") {
            area.templateId = body.templateId;
        }
        area.updatedAt = Date.now();
        await area.save();

        ctx.body = AreaSerializer.serialize(area);

        if (area.email && area.status === "saved") {
            const { email, application } = area;
            const lang = area.language || "en";
            await MailService.sendMail(
                `subscription-preference-change-${lang}`,
                getEmailParametersFromArea(area),
                [{ address: email }],
                application
            );
        }
    }

    static async delete(ctx) {
        logger.info(`Deleting area with id ${ctx.params.id}`);

        const areaToDelete = await AreaModel.findById(ctx.params.id);

        if (areaToDelete == null) {
            ctx.throw(404, "Area not found");
            return;
        }

        await AreaModel.deleteOne({ _id: ctx.params.id });

        logger.info(`Area ${ctx.params.id} deleted successfully`);

        ctx.body = "";
        ctx.statusCode = 204;
    }

    static async updateByGeostore(ctx) {
        const geostores = ctx.request.body.geostores || [];
        const updateParams = ctx.request.body.update_params || {};
        logger.info("Updating geostores: ", geostores);
        logger.info("Updating with params: ", updateParams);

        try {
            updateParams.updatedAt = Date.now();
            const response = await AreaModel.updateMany(
                { geostore: { $in: geostores } },
                { $set: updateParams }
            );

            logger.info(`Updated ${response.nModified} out of ${response.n}.`);
            const areas = await AreaModel.find({
                geostore: { $in: geostores },
            });
            ctx.body = AreaSerializer.serialize(areas);

            const areasToNotify = areas.filter((a) => a.status === "saved");
            await Promise.all(
                areasToNotify.map((area) => {
                    const { email, application } = area;
                    const lang = area.language || "en";
                    if (!email) {
                        return new Promise((resolve) => resolve());
                    }

                    return MailService.sendMail(
                        `dashboard-complete-${lang}`,
                        getEmailParametersFromArea(area),
                        [{ address: email }],
                        application
                    );
                })
            );
        } catch (err) {
            ctx.throw(400, err.message);
        }
    }
}

async function ensureUserIsLogged(ctx, next) {
    if (!ctx.state.loggedUser) {
        ctx.throw(401, "Unauthorized");
        return;
    }
    await next();
}

async function checkPermission(ctx, next) {
    ctx.assert(ctx.params.id, 400, "Id required");
    const area = await AreaModel.findById(ctx.params.id);
    if (
        area &&
        area.userId !== ctx.state.loggedUser.id &&
        area.userId !== ctx.request.body.userId &&
        ctx.state.loggedUser.role !== "ADMIN"
    ) {
        ctx.throw(403, "Not authorized");
        return;
    }
    await next();
}

async function unwrapJSONStrings(ctx, next) {
    if (
        ctx.request.body.use &&
        typeof ctx.request.body.use === "string" &&
        ctx.request.body.use.length > 0
    ) {
        try {
            ctx.request.body.use = JSON.parse(ctx.request.body.use);
        } catch (e) {
            // not a JSON, ignore and move on
        }
    }
    if (
        ctx.request.body.iso &&
        typeof ctx.request.body.iso === "string" &&
        ctx.request.body.iso.length > 0
    ) {
        try {
            ctx.request.body.iso = JSON.parse(ctx.request.body.iso);
        } catch (e) {
            // not a JSON, ignore and move on
        }
    }

    await next();
}

const ensureAdminUser = async (ctx, next) => {
    if (ctx.state.loggedUser.role !== "ADMIN") {
        ctx.throw(401, "Not authorized");
        return;
    }

    await next();
};

const router = new Router({ prefix: "/area" });

router.get("/", ensureUserIsLogged, AreaRouter.getAll);
router.post(
    "/",
    ensureUserIsLogged,
    unwrapJSONStrings,
    AreaValidator.create,
    AreaRouter.save
);
router.patch(
    "/:id",
    ensureUserIsLogged,
    checkPermission,
    unwrapJSONStrings,
    AreaValidator.update,
    AreaRouter.update
);
router.get("/:id", AreaRouter.get);
router.delete("/:id", ensureUserIsLogged, checkPermission, AreaRouter.delete);
router.post(
    "/update",
    ensureUserIsLogged,
    ensureAdminUser,
    AreaValidator.updateByGeostore,
    AreaRouter.updateByGeostore
);

module.exports = router;
