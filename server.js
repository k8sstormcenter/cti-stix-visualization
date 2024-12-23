const express = require('express');
const Redis = require('ioredis');
const cors = require('cors');
const path = require('path');
//const Queue = require('bull');
const { log } = require('console');
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
const ACTIVE_QUEUE_KEY = process.env.ACTIVE_LOGS_KEY|| 'active_logs';
const BENIGN_LOGS_KEY = 'benign_logs'; 

const LIGHTENINGROD = process.env.LIGHTENINGROD || 'http://localhost:8000';



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

app.get('/health', async (req, res) => { 
    try {
      if (redisClient.status === 'ready' ){
        //&& db.serverConfig.isConnected()) {
        res.status(200).send("OK");
      } else {
        res.status(503).send("Not Ready"); 
      }
    } catch (err) {
      res.status(500).send("Error");
    }
  });


app.get('/reload-tetra', async (req, res) => {
    const rawLogs = await redisClient.lrange(TETRA, 0, -1);
    //now we replace all the logs in the raw logs key
    await redisClient.del(RAW_LOGS_KEY);
    if (rawLogs.length > 0) {  
        await redisClient.rpush(RAW_LOGS_KEY, ...rawLogs); 
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
        const count = await redisClient.llen(ACTIVE_QUEUE_KEY); //Gets the total number of jobs waiting in the active logs queue
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
        const logs = await redisClient.lrange(ACTIVE_QUEUE_KEY, startIndex, startIndex + perPage - 1);
        const totalLogs = await redisClient.llen(ACTIVE_QUEUE_KEY);
        res.json({
            logs: logs,
            page,
            perPage,
            total: totalLogs
        });
    } catch (err) {
        console.error("Error fetching active logs:", err);
        res.status(500).json({ error: "Error fetching active logs" });
    }

//}
});

app.get('/baseline-init-all', async (req, res) => {
    try {
        const rawLogs = await redisClient.lrange(TETRA, 0, -1); // tetra is a list
        const pipeline = redisClient.pipeline();
        for (const log of rawLogs) {  
            try {
                const md5 = JSON.parse(log).md5_hash;  
                console.log("md5", md5);
                if (md5) {  
                    if (!await redisClient.hexists(BENIGN_LOGS_KEY, md5)){
                        pipeline.hset(BENIGN_LOGS_KEY, md5, Date.now());  }
                }
            } catch (err) { console.error("Error in baseline-init-all pipeline hset:", err); }
        } 
        await pipeline.exec();        
        console.log("Baseline initialized with all logs");
        res.json({ message: 'Baseline initialized with all logs' });
    } catch (err) {
        console.error("Error initializing baseline with all logs:", err);
        res.status(500).send("Error initializing baseline with all logs");
    }
});

app.get('/add-all-logs', async (req, res) => {
    try {
        const rawLogs = await redisClient.lrange(RAW_LOGS_KEY, 0, -1);
        const md5s = await redisClient.hkeys(BENIGN_LOGS_KEY);
        const filteredLogs = rawLogs.filter(log => !md5s.includes(JSON.parse(log).md5_hash));

        if (filteredLogs.length > 0) {
            // Use pipeline for efficiency
            const pipeline = redisClient.pipeline();
            filteredLogs.forEach(log => pipeline.rpush(ACTIVE_QUEUE_KEY, log));
            await pipeline.exec();

            console.log(`${filteredLogs.length} logs added to the queue.`);
            return res.json({ message: 'Logs added' });
        } else {
            console.log("No new logs to add.");
            return res.json({ message: 'No new logs to add' }); 
        }

    } catch (err) {
        console.error("Error queuing logs:", err);
        return res.status(500).send("Error queuing logs");
    }
});

app.get('/rm-all-logs', async (req, res) => {   
    try {
        await redisClient.del(ACTIVE_QUEUE_KEY); 
        return res.json({ message: 'All jobs removes'});
        }     
     catch (err) { 
        console.error("Error removing all jobs:", err);
        return res.status(500).send("Error removing all jobs");
     }
});

app.get('/stix-transform', async (req, res) => {
    try {
        q = req.query.queue.toString().trim();
        request = await fetch(`${LIGHTENINGROD}/convert_list_to_stix?queue=${q}`);
        }
        catch (err) { 
            console.error("Error transforming logs:", err);
            return res.status(500).send("Error transforming logs");
         }
    try {
        request = await fetch(`${LIGHTENINGROD}/bundle_for_viz`);
        console.log("Logs bundled");
         }
        catch (err) { 
            console.error("Error bundleing logs:", err);
            return res.status(500).send("Error bundeling logs");
         }
    res.json({ message: 'Logs transformed'});
});



app.get('/add-log', async (req, res) => {
    if (req.query.id) {
        try {
            const logToAdd = req.query.id;
            await redisClient.rpush(ACTIVE_QUEUE_KEY, logToAdd); // Directly add the log (string)
            console.log("Log Added");
            return res.json({ message: 'Log added' });
        } catch (err) {
            console.error("Error queuing log:", err);
            return res.status(500).send("Error queuing log");
        }
    } else {
        return res.status(400).send("Missing data");
    }
});

app.get('/rem-log', async (req, res) => {
    try {
        const logToRemove = req.query.id;
        //lrem removes all instances of that log, that is why we can simply call it with 1
        const removedCount = await redisClient.lrem(ACTIVE_QUEUE_KEY, 1, logToRemove);
        if (removedCount > 0) {
            res.json({ message: 'Log removed'});
            console.log("Log Removed. Count:", removedCount); // removedCount for debug
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
        const tableName = req.query.table || redisKeyPrefix; 
        const keys = await redisClient.hkeys(tableName);
        console.log("Fetching Redis keys:", keys);
        res.json(keys);
    } catch (err) {
        console.error("Error fetching Redis keys:", err);
        res.status(500).send("Error fetching Redis keys");
    }
});

app.get('/stix-bundle/:key', async (req, res) => {
    const key=  req.params.key;
    const tableName = req.query.table || redisKeyPrefix; 
    try {
        console.log("Fetching STIX bundle with key:", key);
        const data = await redisClient.hget(tableName, key);
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