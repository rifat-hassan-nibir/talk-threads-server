const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

const app = express();

// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.okheupy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const postsCollection = client.db("talkThreads").collection("posts");
    const usersCollection = client.db("talkThreads").collection("users");
    const tagsCollection = client.db("talkThreads").collection("tags");
    const annoucementsCollection = client.db("talkThreads").collection("announcements");
    const commentsCollection = client.db("talkThreads").collection("comments");

    // save user's data in db
    app.put("/user", async (req, res) => {
      const userInfo = req.body;
      const query = { email: userInfo?.email };

      // Check if user already exists or not
      const isExists = await usersCollection.findOne(query);
      if (isExists) return res.send(isExists);

      // if user is new
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...userInfo,
          timeStamp: Date.now(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // update user role using email
    app.patch("/update-role/:email", async (req, res) => {
      const email = req.params.email;
      const role = req.body;
      const query = { email: email };
      const updateDoc = {
        $set: {
          ...role,
          timeStamp: Date.now(),
        },
      };
      const options = { upsert: true };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // get users data from db
    app.get("/users", async (req, res) => {
      const searchText = req.query.search;
      const page = parseInt(req.query.page) - 1;
      const size = parseInt(req.query.size);
      let query = {};
      if (searchText) query = { userName: { $regex: searchText, $options: "i" } };
      const result = await usersCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });

    // get users count from db
    app.get("/users-count", async (req, res) => {
      const searchText = req.query.search;
      const query = { userName: { $regex: searchText, $options: "i" } };
      const count = await usersCollection.countDocuments(query);
      res.send({ count });
    });

    // get user role using email
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // get all posts from db
    app.get("/posts", async (req, res) => {
      const search = req.query.search;
      const page = parseInt(req.query.page) - 1;
      const size = parseInt(req.query.size);
      let query = { tag: { $regex: search, $options: "i" } };
      const result = await postsCollection
        .find(query)
        .skip(page * size)
        .limit(size)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // pagination: get all posts count
    app.get("/posts-count", async (req, res) => {
      const search = req.query.search;
      let query = { tag: { $regex: search, $options: "i" } };
      const count = await postsCollection.countDocuments(query);
      res.send({ count });
    });

    // get all posts for a user using email
    app.get("/posts-count/:email", async (req, res) => {
      const email = req.params.email;
      let query = { "authorInfo.email": email };
      const count = await postsCollection.countDocuments(query);
      res.send({ count });
    });

    // get single post data from db
    app.get("/post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postsCollection.findOne(query);
      res.send(result);
    });

    // add post to db
    app.post("/add-post", async (req, res) => {
      const post = req.body;
      const result = await postsCollection.insertOne(post);
      res.send(result);
    });

    // get all posts for a user using email
    app.get("/my-posts/:email", async (req, res) => {
      const email = req.params.email;
      const sortText = req.query.dateSort;
      const sortOrder = sortText === "ascending" ? 1 : -1;

      const query = { "authorInfo.email": email };
      const result = await postsCollection.find(query).sort({ date: sortOrder }).toArray();
      res.send(result);
    });

    // delete a post using id
    app.delete("/delete-post/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postsCollection.deleteOne(query);
      res.send(result);
    });

    // comment on post
    app.post("/post-comment", async (req, res) => {
      const comment = req.body;
      const result = await commentsCollection.insertOne(comment);
      res.send(result);
    });

    // post annoucement to db
    app.post("/announcements", async (req, res) => {
      const annoucement = req.body;
      const result = await annoucementsCollection.insertOne(annoucement);
      res.send(result);
    });

    // get announcements data from db
    app.get("/announcements", async (req, res) => {
      const result = await annoucementsCollection.find().toArray();
      res.send(result);
    });

    // get all tags from db
    app.get("/tags", async (req, res) => {
      const result = await tagsCollection.find().toArray();
      res.send(result);
    });

    // post tag to db
    app.post("/tags", async (req, res) => {
      const tag = req.body;
      const result = await tagsCollection.insertOne(tag);
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Talk threads server running perfectly");
});

app.listen(port, () => console.log(`Server running on port ${port}`));
