const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const premiumUsersCollection = client.db("talkThreads").collection("premiumUsers");
    const reportsCollection = client.db("talkThreads").collection("reports");

    // create-payment-intent
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;
      if (!price && priceInCent < 1) return;
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: { enabled: true },
      });

      // send client secret as response
      res.send({ clientSecret: client_secret });
    });

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

    // get user information using email
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // add user to premium users collection and update usersCollection user premiumUser status
    app.post("/premium-users", async (req, res) => {
      const userData = req.body;
      // save new premium user's data in db
      const result = await premiumUsersCollection.insertOne(userData);

      // update a users premium user status using email
      const userEmail = req.body.email;
      const query = { email: userEmail };
      const updateDoc = {
        $set: { premiumUser: true },
      };
      const updatedUserStatus = await usersCollection.updateOne(query, updateDoc);

      res.send({ result, updatedUserStatus });
    });

    // get all posts from db
    app.get("/posts", async (req, res) => {
      const search = req.query.search;
      const popular = req.query.popular;
      const page = parseInt(req.query.page) - 1;
      const size = parseInt(req.query.size);
      let query = { tag: { $regex: search, $options: "i" } };

      let result;
      // sort by vote difference
      if (popular === "true") {
        result = await postsCollection
          .aggregate([
            {
              $match: query,
            },
            {
              $addFields: {
                voteDifference: { $subtract: ["$upvote", "$downvote"] },
              },
            },
            {
              $sort: { voteDifference: -1 },
            },
            {
              $skip: page * size,
            },
            {
              $limit: size,
            },
          ])
          .toArray();
      } else {
        result = await postsCollection
          .find(query)
          .skip(page * size)
          .limit(size)
          .sort({ date: -1 })
          .toArray();
      }
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

    app.patch("/update-vote/:id", async (req, res) => {
      const postId = req.params.id;
      const vote = req.query.vote;
      const query = { _id: new ObjectId(postId) };

      let updateDoc;

      if (vote === "upvote") {
        updateDoc = { $inc: { upvote: 1 } };
      } else {
        updateDoc = { $inc: { downvote: 1 } };
      }

      const result = await postsCollection.updateOne(query, updateDoc);
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

    // get comments of a post using id
    app.get("/comments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { post_id: id };
      const result = await commentsCollection.find(query).toArray();
      res.send(result);
    });

    // get comments count
    app.get("/comments-count/:id", async (req, res) => {
      const id = req.params.id;
      const query = { post_id: id };
      const count = await commentsCollection.countDocuments(query);
      const result = { count: count };
      res.send(result);
    });

    // post comment reports in db
    app.post("/post-comment-reports", async (req, res) => {
      const reportData = req.body;
      const result = await reportsCollection.insertOne(reportData);
      res.send(result);
    });

    // get comment reports
    app.get("/get-reported-comments", async (req, res) => {
      const result = await reportsCollection.find().toArray();
      res.send(result);
    });

    // remove reported comment
    app.delete("/remove-reported-comment/:id", async (req, res) => {
      const reportId = req.params.id;
      const query = { _id: new ObjectId(reportId) };
      const result = await reportsCollection.deleteOne(query);
      res.send(result);
    });

    // remove reported comment
    app.delete("/delete-reported-comment/:id", async (req, res) => {
      const commentId = req.params.id;
      const query = { _id: new ObjectId(commentId) };
      const result = await commentsCollection.deleteOne(query);
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
      const result = await annoucementsCollection.find().sort({ date: -1 }).toArray();
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

    // admin dashboard stats
    app.get("/admin-stats", async (req, res) => {
      const usersCount = await usersCollection.countDocuments();
      const postsCount = await postsCollection.countDocuments();
      const commentsCount = await commentsCollection.countDocuments();
      res.send({ usersCount, postsCount, commentsCount });
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
