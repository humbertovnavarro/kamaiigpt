import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
    organization: "org-UDKoZsC5H7PZIRep4hquLapi",
    apiKey: process.env.OPENAI_TOKEN
});

export const openai = new OpenAIApi(configuration);