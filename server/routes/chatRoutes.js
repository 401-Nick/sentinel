const express = require('express');
const router = express.Router();
const dotenv = require('dotenv');
const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require("openai");
const fs = require('fs').promises;
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index('state-laws');


// This array will hold subscribers for SSE
let subscribers = [];
const systemPrompt = "Base initial interaction on USER QUERY. Provide relevant information and guidance in PLAINTEXT.";
const multishotTraining = `
Remember ${systemPrompt}


Example Outputs:


1. IF THE USER ASKS ABOUT A SPECIFIC SECTION OF THE LAW, PROVIDE A DIRECT LINK TO THE SECTION AND A BRIEF SUMMARY OF THE CONTENT.:
    Section Name: [Section Name]
    Section #: [Section Number]
    Direct Link: https://revisor.mo.gov/main/OneSection.aspx?section=[Section Number]

    Section Name: [Section Name]
    Section #: [Section Number]
    Direct Link: https://revisor.mo.gov/main/OneSection.aspx?section=[Section Number]

    Section Name: [Section Name]
    Section #: [Section Number]
    Direct Link: https://revisor.mo.gov/main/OneSection.aspx?section=[Section Number]

2. IF THE USER ASKS FOR GENERAL GUIDANCE OR INFORMATION, PROVIDE A STEP-BY-STEP GUIDE TO ADDRESS THE SITUATION.:
    Based on the the scenario you provided, here are some steps you might consider taking:
    - Step 1: [Action 1]
    - Step 2: [Action 2]
    - Step 3: [Action 3]

3. IF THE USER ASKS FOR A DEFINITION OF A LEGAL TERM, PROVIDE A SIMPLE DEFINITION AND EXAMPLES.:
    Legal Term: [Term]
    Definition: [Definition]
    Example: [Example]
4. THE USER CAN HAVE NORMAL CONVERSATIONS WITH THE BOT.:
    User: [User Input]
    Bot: [Bot Response]


    `

//Pinecone takes the query and returns the 3 most relevant sections
async function queryPinecone(vector) {
    const queryResponse = await index.namespace('state-laws').query({
        vector: vector,
        topK: 3,
        includeValues: true
    });
    return queryResponse.matches.map(match => ({
        section: match.id,
        score: match.score
    }));
}

//Used to convert the user input into a vector
async function embedText(inputText) {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-large",
        input: inputText
    });
    return response.data[0].embedding;
}

// Function to initiate processing with OpenAI
async function initiateOpenAIProcessing(userMessage) {

    //Convert the user input into a vector
    const embedding = await embedText(userMessage);

    //Query Pinecone with the vector to find the top 3 most relevant sections
    const matches = await queryPinecone(embedding);

    //Read the content from the static file and find the sections that match the top 3 most relevant sections
    const fileContent = await fs.readFile('./static_data/content.txt', 'utf8');
    const sections = fileContent.split('[END]').map(section => section + '[END]').slice(0, -1);
    let matchedSections = matches.map(match => {
        const matchedSection = sections.find(section => section.includes(`  ${match.section}.  `));
        return matchedSection ? matchedSection.replace(/\[START\]|\[END\]/g, '') : `No content found for section ${match.section}`;
    }).join('\n\n');

    //GPT API call with example outputs, injected with the user input and matched sections.
    let modelTemplate = `${multishotTraining}\nSCORES:${JSON.stringify(matches)}\nUSER QUERY: ${userMessage}\n\nMATCHED SECTIONS:\n${matchedSections}`
    let messageHistory = [{ role: "system", content: systemPrompt }, { role: "user", content: modelTemplate }];
    try {
        const stream = await openai.chat.completions.create({
            model: "gpt-4-0125-preview",
            messages: messageHistory,
            stream: true,
            // max_tokens: 20,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            console.log('Broadcasting to subscribers:', content);
            subscribers.forEach(subscriber => {
                subscriber.res.write(`data: ${JSON.stringify({ message: content })}\n\n`);
            });
        }
    } catch (error) {
        console.error("Error in streaming from OpenAI:", error);
    }
}

// Endpoint to receive messages and process them
router.post('/send-message', async (req, res) => {
    const userMessage = req.body.message;
    console.log('Received message to process:', userMessage);

    try {
        initiateOpenAIProcessing(userMessage);
        res.json({ message: "Message received and being processed" });
    } catch (error) {
        console.error("Error processing message with OpenAI:", error);
        res.status(500).json({ error: "Failed to process the message" });
    }
});

// Endpoint for clients to connect and receive streaming responses
router.get('/stream-response', (req, res) => {
    console.log('Client connected for streaming responses');

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const subscriber = { id: Date.now(), res };
    subscribers.push(subscriber);

    // Log the total subscribers after a new connection
    console.log('Total subscribers:', subscribers.length);

    req.on('close', () => {
        console.log('Client disconnected');
        // Remove subscriber when client disconnects
        subscribers = subscribers.filter(sub => sub.id !== subscriber.id);
        console.log('Updated total subscribers:', subscribers.length);
    });
});

module.exports = router;
