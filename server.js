const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const path = require('path');
const MongoClient = require('mongodb').MongoClient;
// Make sure your mongodb client is correctly initialized!
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017'; // Replace with your MongoDB connection string
const dbName = process.env.MONGODB_DB_NAME || 'patterns'; // Replace with your database name
const mongoClient = new MongoClient(mongoURI);
let db;
mongoClient.connect(err => {
  if (err) {
    console.error('Failed to connect to MongoDB:', err);
  } else {
    db = mongoClient.db(dbName);
    console.log('Connected to MongoDB');
  }
});

const app = express();
app.use(express.json());

const port = process.env.PORT || 3000; // Default to 3000 if not set

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = process.env.REDIS_PORT || 6379; // Default Redis port
const redisKeyPrefix = process.env.REDIS_KEY_PREFIX || 'tetrastix';
const REDIS_PATTERNKEY = process.env.REDIS_PATTERNKEY || 'tetra_pattern';

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

app.get('/attack-bundles', async (req, res) => {
    try {
        const keys = await redisClient.hgetall(REDIS_PATTERNKEY);
        const formattedBundles = Object.entries(keys).map(([key, value]) => ({
            id: key,
            data: JSON.parse(value) // Important to parse the JSON string!
        }));
        res.json(formattedBundles); 
        console.log("Fetching Redis Attack Bundle:", keys);
    } catch (err) {
        console.error("Error fetching Redis attack bundles:", err);
        res.status(500).send("Error fetching Redis attack bundles");
    }
});

app.post('/add-attack-bundles', async (req, res) => {
    try {
      const newBundle = req.body;
      // Store this in Redis for now...
      // TODO: add check for exact identity to avoid duplicates
      const nextBundleId = (await redisClient.hgetall(REDIS_PATTERNKEY)) + 1; // Assuming integer IDs
      await redisClient.hset(REDIS_PATTERNKEY, nextBundleId, JSON.stringify(newBundle.data));
  
      res.json({ message: 'Attack bundle added', id: nextBundleId });
    } catch (err) {
      console.error("Error adding attack bundle:", err);
      res.status(500).send("Error adding attack bundle");
    }
  });

app.post('/modify-attack-bundles', async (req, res) => {
    try {
        console.error("Request body:", req);
        if (!req ) {  // Check if data exists
            return res.status(400).send("Missing 'data' property in request body"); // Or handle it differently
        }
      const newBundle = req.body;
      // Store this in Redis for now...
      await redisClient.hset(REDIS_PATTERNKEY, newBundle.id, JSON.stringify(newBundle.data));
  
      res.json({ message: 'Attack bundle overwritten', id: newBundle.id });
    } catch (err) {
      console.error("Error overwriting attack bundle:", err);
      res.status(500).send("Error overwriting attack bundle");
    }
  });

  app.post('/delete-attack-bundles', async (req, res) => {
    try {
      const newBundle = req.body;
      // Remove Bundle from Redis.
      await redisClient.hdel(REDIS_PATTERNKEY, newBundle.data.id);
  
      res.json({ message: 'Attack bundle deleted', id: newBundle.data.id });
    } catch (err) {
      console.error("Error deleting attack bundle:", err);
      res.status(500).send("Error deleting attack bundle");
    }
  });


app.post('/persist-to-mongodb', async (req, res) => {
    try {
        if (!db) { // Check if connected to the database
          throw new Error('Not connected to MongoDB');
        }
        const patternData = await redisClient.hgetall(REDIS_PATTERNKEY);
        const collection = db.collection('attack_patterns'); // Replace 'stix_patterns' with your collection name
        const operations = Object.entries(patternData).map(([key, value]) => ({
            updateOne: { // Use updateOne operation for upsert
                filter: { id: key },  // Filter by id
                update: { $set: { id: key, pattern: JSON.parse(value) } }, // Update or insert this document
                upsert: true  
            }
        }));
        const result = await collection.bulkWrite(operations); 
        console.log("MongoDB Upsert Result:", result);
        // Clear Redis after successful persistence (optional) - If you clear, update the frontend to re-fetch
        // await redisClient.del(REDIS_PATTERNKEY);
        res.json({ message: 'Data persisted to MongoDB' });
    } catch (err) {
        console.error("Error persisting to MongoDB:", err);
        res.status(500).send("Error persisting to MongoDB");
    }
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});