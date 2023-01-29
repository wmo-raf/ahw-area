const config = require('config');
const logger = require('logger');

const { Storage } = require('@google-cloud/storage');

const gcsConfig = config.get('gcs');

const storage = new Storage({ keyFilename: gcsConfig.keyFilePath });
const bucket = storage.bucket(gcsConfig.bucket);

class GcsService {

    static async upload(geostoreId, fileBuffer) {
        logger.info('Uploading Image to Google Cloud');

        const fileName = `${gcsConfig.folder}/${geostoreId}.png`;

        const blob = bucket.file(fileName);

        return blob
            .save(fileBuffer, {
                public: true,
                metadata: {
                    contentType: 'image/png',
                },
            })
            .then(() => `https://storage.googleapis.com/ahw/${fileName}`);
    }

}

module.exports = GcsService;
