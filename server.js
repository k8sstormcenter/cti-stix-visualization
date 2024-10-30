const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3000;

const redisHost = '127.0.0.1';
const redisPort = 51598;
const redisKeyPrefix = 'tetrastix';

//const redisClient = new Redis({ host: redisHost, port: redisPort });
const redisClient = new Redis(redisPort);

app.use(cors());
app.use(express.static(path.join(__dirname)));

// Endpoint to fetch Redis keys
app.get('/redis-keys', async (req, res) => {
    try {
        //example tetrastix:indicator--kh-ce-sys-ptrace:800aa1077359adcf9f03abe0472d2a2c
        const keys = await redisClient.keys(`${redisKeyPrefix}:*`);
        res.json(keys);
    } catch (err) {
        console.error("Error fetching Redis keys:", err);
        res.status(500).send("Error fetching Redis keys");
    }
});

// Endpoint to fetch STIX bundle from Redis
app.get('/stix-bundle/:key', async (req, res) => {
    const key = req.params.key;
    try {
        const data = await redisClient.get(key);
        res.json(JSON.parse(data));
    } catch (err) {
        console.error("Error fetching STIX bundle:", err);
        res.status(500).send("Error fetching STIX bundle");
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});