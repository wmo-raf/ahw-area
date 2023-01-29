const logger = require("logger");
const axios = require("axios");
const config = require("config");

const MGBL_RENDER_API_URL = config.get("mbglRenderApiUrl");

class MbglService {
    static async getImageFromStyle(mapStyle) {
        logger.info("Generating map image from style");
        const image = await axios
            .post(MGBL_RENDER_API_URL, mapStyle, {
                timeout: 30000,
                responseType: "arraybuffer",
            })
            .then((res) => res.data);

        return image;
    }
}

module.exports = MbglService;
