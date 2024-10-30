const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const path = require('path');


// apiVersion: apps/v1
// kind: Deployment
// metadata:
//   name: stix-visualizer
// spec:
//   replicas: 1
//   selector:
//     matchLabels:
//       app: stix-visualizer
//   template:
//     metadata:
//       labels:
//         app: stix-visualizer
//     spec:
//       containers:
//       - name: stix-visualizer
//         image: k8sstormcenter/cti-stix-visualizer:0.0.1
//         ports:
//         - containerPort: 3000
//         env:
//         - name: PORT
//           value: "3000"
//         - name: REDIS_HOST
//           value: "your-redis-host"
//         - name: REDIS_PORT
//           value: "51598"
//         - name: REDIS_KEY_PREFIX
//           value: "tetrastix"

const app = express();

//const redisPort = 51598;
//const redisKeyPrefix = 'tetrastix';

const port = process.env.PORT || 3000; // Default to 3000 if not set

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || 6379; // Default Redis port
const redisKeyPrefix = process.env.REDIS_KEY_PREFIX || 'tetrastix';

const redisClient = new Redis({ host: redisHost, port: redisPort });


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
    const key=  req.params.key;
    try {
        console.log("Fetching STIX bundle with key:", key);
        data = await redisClient.lrange(key,-1,-1);
        data = data[0];
        res.json(data);
    } catch (err) {
        console.error("Error fetching STIX bundle:", err);
        res.status(500).send("Error fetching STIX bundle");
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});