const dotenv = require("dotenv");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EventEmitter = require('events');

class OpenAIResponseStream extends EventEmitter {
    constructor() {
        super();
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    async streamCompletion(prompt) {
        try {
            const stream = await this.openai.chat.completions.create({
                model: "text-davinci-003",
                prompt,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.text;
                if (content) {
                    this.emit('data', content);
                }
            }
        } catch (error) {
            this.emit('error', error);
        }
    }
}

module.exports = OpenAIResponseStream;



const systemPrompt = "Make text nicely formatted in plain text and easy to read. Provide relevant information and guidance.";
let messageHistory = [{ role: "system", content: `${systemPrompt}` }];
const multishotTraining = `
Remember ${systemPrompt}


Example Output:

1. Section Overview
    - Section Name: [Section Name]
    - Section #: [Section Number]
    - Relevance Score: [Relevance Score]
    - Model Confidence: [Model Confidence] // 0 - 100% from 0.00 to 1.00 this comes from your own comparison of the model's response to the actual section returned.
    - Direct Link: https://revisor.mo.gov/main/OneSection.aspx?section=[Section Number]

    Summary:
    [Brief summary or title of the section, if available]

    Relevance Explanation:
    This section has been identified based on your query due to its focus on [general topic]. It is particularly relevant for scenarios involving [specific scenarios or keywords related to the query].

    Recommended Actions:
    - For legal consultation, reference Section #[Section Number][https://revisor.mo.gov/main/OneSection.aspx?section=[Section Number]] regarding [specific aspect].

2. [Repeat the format for each section, with appropriate content for each placeholder.]

Notes:
- The Relevance Score is derived from a matching algorithm indicating the section's relevance to your query, with higher scores signifying greater relevance.
- The "Recommended Actions" are suggested steps you might take after reviewing the section, tailored to the context of your inquiry.
`




dotenv.config();

exports.embedText = async (text) => {
    const response = await openai.embeddings.create({
        model: "text-embedding-3-large",
        input: text
    });
    console.log("Embedding received from OpenAI.");
    console.log("Embedding:", response.data[0].embedding);

};

exports.promptModel = async (userMessage, context, matches) => {
    console.log("Requesting completion from OpenAI...");
    let modelTemplate = `${multishotTraining}\nSCORES:${JSON.stringify(matches)}\nUSER QUERY: ${userMessage}\n\nMATCHED SECTIONS:\n${context}`
    messageHistory.push({ role: "user", content: modelTemplate });
    const stream = await openai.chat.completions.create({
        model: "gpt-4-0125-preview",
        messages: messageHistory,
        stream: true,
    });


    let message = "";
    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        process.stdout.write(content);// Print the response to the console
        message += content;

    }
    messageHistory.push({ role: "assistant", content: message });
    console.log(messageHistory)

    promptUser();
}
