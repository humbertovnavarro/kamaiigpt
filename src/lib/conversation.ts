import { Message } from "discord.js";
import { ChatCompletionRequestMessage } from "openai";
const defaultPrompt = `
You are a discord chat bot that can respond using discord markdown formatting.
You may respond using code blocks, italics, underlines, spoiler tags, and block quotes.
Do not include your username in your response.
Kamaii: Hello!
How are you doing today Kamaii?
Kamaii: I'm doing great!
I'm glad to hear that!
`


interface AIConversationOptions {
    prompt: string;
    ignorePrefix?: string;
}

export class AIConversation {
    private prompt: string;
    private ignorePrefix: string | undefined;
    private messages: ChatCompletionRequestMessage[] = [];
    constructor({
        prompt,
        ignorePrefix
    }: AIConversationOptions) {
        this.prompt = prompt;
        this.ignorePrefix = ignorePrefix;
    }
    static defaultPrompt() {
        return defaultPrompt;
    }
    addMessages(...messages : Message[]) {
        for(const message of messages) {
            if(message.author.bot && message.author.id != message.client.user.id) return;
            if(this.ignorePrefix && message.content.startsWith(this.ignorePrefix)) return;
            if(message.content.startsWith("!")) return;
            this.messages.push({
                role: message.author.id === message.client.user?.id ? "system" : "user",
                content: `${message.author.username}: ${message.content}`
            });
        }
    }
    setPrompt(prompt: string) {
        this.prompt = prompt;
    }
    /**
     * @returns The conversation log compatible with OpenAI's API
     */
    getConversation() {
        return [
            {
                role: 'system',
                content: this.prompt
            } as ChatCompletionRequestMessage,
            ...this.messages
        ]
    }
}