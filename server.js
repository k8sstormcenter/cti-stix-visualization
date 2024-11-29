const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const path = require('path');


const app = express();

const port = process.env.PORT || 3000; // Default to 3000 if not set

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || 6379; // Default Redis port
const redisKeyPrefix = process.env.REDIS_KEY_PREFIX || 'tetrastix';

const redisClient = new Redis({ host: redisHost, port: redisPort });
//confirm redis connection 
redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});

app.use(cors());
app.use(express.static(path.join(__dirname)));

// Endpoint to fetch Redis keys
app.get('/redis-keys', async (req, res) => {
    try {
        const keys = await redisClient.hkeys(redisKeyPrefix);
        console.log("Fetching Redis keys:", keys);
        res.json(keys);
    } catch (err) {
        console.error("Error fetching Redis keys:", err);
        res.status(500).send("Error fetching Redis keys");
    }
});

// Endpoint to fetch STIX bundle from Redis
app.get('/stix-bundle/:key', async (req, res) => {
    const key=  req.params.key;
    try {
        console.log("Fetching STIX bundle with key:", key);
        const data = await redisClient.hget(redisKeyPrefix, key);
        res.json(data);
    } catch (err) {
        console.error("Error fetching STIX bundle:", err);
        res.status(500).send("Error fetching STIX bundle");
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});