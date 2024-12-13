const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const path = require('path');
const Queue = require('bull');
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
const RAW_LOGS_KEY = process.env.RAW_LOGS_KEY || 'raw_logs';
const TETRA = process.env.TETRA || 'tetra';
const ACTIVE_LOGS_KEY = process.env.ACTIVE_LOGS_KEY|| 'active_logs';

const redisClient = new Redis({ host: redisHost, port: redisPort });
//confirm redis connection 
redisClient.on('connect', () => {
    console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
    console.error('Redis error:', err);
});
const redisConfig = {
    redis: {
      port: 6379, // Redis server port
      host: 'localhost', // Redis server host
    },
  };
const ACTIVE_QUEUE = new Queue(ACTIVE_LOGS_KEY, redisConfig);
app.use(cors());
app.use(express.static(path.join(__dirname)));


app.get('/reload-tetra', async (req, res) => {
    const rawLogs = await redisClient.lrange(TETRA, 0, -1);
    //now we replace all the logs in the raw logs key
    await redisClient.del(RAW_LOGS_KEY);
    if (rawLogs.length > 0) {  // Check if rawLogs is not empty
        await redisClient.rpush(RAW_LOGS_KEY, ...rawLogs); // Use rpush with spread operator
        console.log("Reloaded raw logs from Tetra");
    }
});

app.get('/raw-logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; 
        const perPage = parseInt(req.query.perPage) || 5; 

        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage - 1;

        const rawLogs = await redisClient.lrange(RAW_LOGS_KEY, startIndex, endIndex);
        const totalLogs = await redisClient.llen(RAW_LOGS_KEY); 

        res.json({
            logs: rawLogs,
            page: page,
            perPage: perPage,
            total: totalLogs
        });
    } catch (err) { 
        console.error("Error fetching raw logs:", err);
        res.status(500).send("Error fetching raw logs");
     }
});

app.get('/active-logs-count', async (req, res) => {
    try {
        const count = await ACTIVE_QUEUE.getWaitingCount(); //Gets the total number of jobs waiting in the active logs queue
        res.json({ total: count });
    } catch (err) {
        console.error("Error getting active logs count:", err);
        res.status(500).json({ error: "Error getting active logs count" });
    }
});

app.get('/active-logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 5; 

        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage - 1;

        const jobs = await ACTIVE_QUEUE.getWaiting(startIndex, perPage); //Get a page of active logs
        const totalJobs = await ACTIVE_QUEUE.getWaitingCount();

        //Extract job data
        const logs = jobs.map(job => job.data.data);

        res.json({
            logs: logs
        });

    } catch (err) {
        console.error("Error fetching active logs:", err);
        res.status(500).json({ error: "Error fetching active logs" });
    }

});

app.get('/add-log', async (req, res) => {      
    try {
        const logToAdd = req.query.id;
        const jobs = await ACTIVE_QUEUE.getWaiting();
 
        const jobToAdd = jobs.find(job => job.data.data === logToAdd);
        if (jobToAdd) {
            res.json({ message: 'Log already active', id: jobToAdd.id });
            
        } else {
            await ACTIVE_QUEUE.add(logToAdd);
            console.log("Log Added")
        }  
        res.json({ message: 'Log added', id: key });
    } catch (err) { 
        console.error("Error queuing log:", err);
        res.status(500).send("Error queuing log");
     }
});
app.get('/rem-log', async (req, res) => {      
    try {
        const logToRemove = req.query.id;
        const jobs = await ACTIVE_QUEUE.getWaiting();
 
        const jobToRemove = jobs.find(job => job.data.data === logToRemove); // Find job by log content

        if (jobToRemove) {
            await ACTIVE_QUEUE.removeJobs(jobToRemove.id);  // Remove the job using its ID!
            res.json({ message: 'Log removed', id: jobToRemove.id });
            console.log("Log Removed. Job ID:", jobToRemove.id, "Log content:", logToRemove);
        } else {
            res.status(404).json({ error: 'Log not found in queue' }); // Handle not found
        }            
    } catch (err) { 
        console.error("Error removing log:", err);
        res.status(500).send("Error removing log");
     }
});


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
        //console.log("Fetching Redis Attack Bundle:", res.status());
    } catch (err) {
        console.error("Error fetching Redis attack bundles:", err);
        res.status(500).send("Error fetching Redis attack bundles");
    }
});

app.get('/attack-bundle-max', async (req, res) => {
    try {
        //retrieve the highest ID from Redis
        const keys = await redisClient.hgetall(REDIS_PATTERNKEY);
        if (Object.keys(keys).length === 0) { // Handle empty hash
            return res.json(0); // Or whatever default value you want
        }
        const maxId = Math.max(...Object.keys(keys).map(Number)); // Correct way to find max
        res.json(maxId);
        console.log("Fetching highest ID:", maxId);
    } catch (err) {
        console.error("Error fetching highest ID:", err);
        res.status(500).send("Error fetching highest ID");
    }
});

app.post('/add-attack-bundles', async (req, res) => {
    try {
      const newBundle = req.body;
      // TODO: add check for exact identity to avoid duplicates
      const nextBundleId = newBundle.data.id; // Assuming integer IDs
      await redisClient.hset(REDIS_PATTERNKEY, nextBundleId, JSON.stringify(newBundle.data));
      res.json({ message: 'Attack bundle added', id: nextBundleId });
    } catch (err) {
      console.error("Error adding attack bundle:", err);
      res.status(500).send("Error adding attack bundle");
    }
  });

app.post('/modify-attack-bundles', async (req, res) => {
    try {
        if (!req ) {  // Check if data exists
            return res.status(400).send("Missing request body"); // Or handle it differently
        }
      const newBundle = req.body;
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