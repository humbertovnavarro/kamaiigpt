import { config } from "dotenv";
config();
import request from "axios";
import { GuildMember } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { VoiceRecognizer } from "./lib/vosk";
import { AIConversation } from "./lib/conversation";
import { openai } from "./lib/openai";
import client from "./lib/client";
import { MONTHLY_USAGE_LIMIT, addUsage, reachedUsageLimit } from "./lib/usage";
const AI_CHANNEL = "1097699572828090463";

const main = async () => {
    client.login(process.env.DISCORD_TOKEN);
    client.once("ready", (client) => {
        const voiceRecognizer = new VoiceRecognizer({
            channelId: AI_CHANNEL,
            client
        });
        voiceRecognizer.addEventListener("silence", (word, member) => { 
            console.log(`silence: ${word} from ${member.displayName}`);
        });
    });

    client.on("messageCreate", async (message) => {
        if(message.channelId != AI_CHANNEL) return;
        await message.channel.sendTyping();
        if(!message.author.bot)
        if(await reachedUsageLimit(message)) {
            await message.channel.send(`You've reached the monthly usage limit of ${MONTHLY_USAGE_LIMIT}`);
            return;
        }

        const conversation = new AIConversation({
            prompt: AIConversation.defaultPrompt()
        });

        try {
            const result = await openai.createChatCompletion({
                model: 'gpt-3.5-turbo',
                messages: conversation.getConversation(),
            });
            const reply = result.data.choices[0].message;
            if(reply)
            message.reply(reply?.content)
        } catch(error) {
            if(request.isAxiosError(error)) {
                if(error.status === 429) {
                    await message.channel.send("I ran out of credits :(")
                }
                console.log(error.toJSON())
            }
            await message.channel.send("Something went wrong while querying openai");
        }
        addUsage(message);
    });
}

main();

