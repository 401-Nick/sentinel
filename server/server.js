// /server/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const chatRoutes = require('./routes/chatRoutes'); // Import your chat routes
const dotenv = require('dotenv');
dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors({
    origin: "*",
    methods: "GET,POST",
    credentials: true,
}));


app.use(bodyParser.json());

// Routes
app.use('/api', chatRoutes);
console.log('endpoint /api is ready');

// Start the server
app.listen(port, () => console.log(`Server running on port ${port}`));
