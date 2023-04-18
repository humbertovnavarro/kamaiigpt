import { config } from "dotenv";
config();
import request from "axios";
import { Client, GuildMember, IntentsBitField, Message } from "discord.js";
import { Configuration, OpenAIApi } from "openai";
import { PrismaClient } from "@prisma/client";
import OpusScript from "opusscript";
import prompt from "./prompt";
import { VoiceRecognizer } from "./voice-recognizer";
import axios from "axios";
import {  AudioReceiveStream, EndBehaviorType, NoSubscriberBehavior, createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
const prisma = new PrismaClient();
const MONTHLY_USAGE_LIMIT = 1000;
const AI_CHANNEL = "1097699572828090463";

interface ConversationLog {
    role: 'user' | 'system',
    content: string
}

const configuration = new Configuration({
    organization: "org-UDKoZsC5H7PZIRep4hquLapi",
    apiKey: process.env.OPENAI_TOKEN
});

const openai = new OpenAIApi(configuration);

const bot = new Client({
    intents: [
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildVoiceStates,
    ]
});

console.log("loading vosk voice recognition model")
let rec: VoiceRecognizer;
try {
    rec = new VoiceRecognizer(48000);
} catch(e) {
    console.error(e);
    process.exit(1);
}
console.log("finished loading model");

const CHANNEL_ID = process.env.CHANNEL_ID;

const newConversationLog = (message: Message): ConversationLog => {
    return {
        role: message.author.id === bot.user?.id ? "system" : "user",
        content: message.content
    }
}

const reachedUsageLimit = async (message: Message): Promise<boolean> => {
    const usage = await prisma.usage.findFirst({
        where: {
            id: message.author.id
        }
    });

    if(!usage) {
        await prisma.usage.create({
            data: {
                id: message.author.id,
            }
        })
        return false;
    } else if(new Date(Date.now()).getMilliseconds() - usage.date.getMilliseconds() > 60 * 1000 * 60 * 24 * 30) {
        await prisma.usageLog.create({
            data: {
                ...usage
            }
        });
        await prisma.usage.update({
            where: {
                id: message.author.id,
            },
            data: {
                date: new Date(Date.now()),
                count: 0
            }
        });
        return false;
    } else if(usage.count > MONTHLY_USAGE_LIMIT) {
        return true;
    } else {
        return false;
    }
}

const main = async () => {
    bot.login(process.env.DISCORD_TOKEN);
    bot.once("ready", (client) => {
        console.log("logged in as ", client.user);
        const channel = client.channels.cache.get(AI_CHANNEL);
        if(channel?.isVoiceBased()) {
            joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guildId,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            const connection = getVoiceConnection(channel.guild.id);
            if(!connection) throw new Error("could not connect to voice channel");
            const receiver = connection.receiver;
            receiver.speaking.removeAllListeners();
            const encoder = new OpusScript(48000, 2, OpusScript.Application.AUDIO);
            const subscriptions = new Map<GuildMember, AudioReceiveStream>();
            const GATHER_INTERVAL = 200;
            setInterval(() => {
                channel.members.forEach(member => {
                    if(subscriptions.has(member)) {
                        const sub = subscriptions.get(member) as AudioReceiveStream;
                        if(sub.closed) {
                            subscriptions.delete(member);
                        } else {
                            return;
                        }
                    }
                    if(member.id === client.user.id) return;

                    const subscription = receiver.subscribe(member.user.id, {
                        end: {
                            behavior: EndBehaviorType.AfterSilence,
                            duration: GATHER_INTERVAL
                        },
                    });

                    subscriptions.set(member, subscription);

                    console.log("subscribed " + member.user.username)
    
                    subscription.on("data", (chunk: Buffer) => {
                        const pcmBuffer = encoder.decode(chunk);
                        const monoBuffer = Buffer.alloc(pcmBuffer.length / 2);
                        for (let i = 0, j = 0; i < pcmBuffer.length; i += 4, j += 2) {
                            monoBuffer.writeInt16LE(Math.round((pcmBuffer.readInt16LE(i) + pcmBuffer.readInt16LE(i + 2)) / 2), j);
                        }
                        rec.convert(monoBuffer);
                    });
    
                    subscription.once("end", async () => {
                        console.log("sub ended for " + member.user.username);
                        const results = rec.finalResult() as {
                            text: string
                        }
                        console.log(results);
                        rec.free();
                        subscriptions.delete(member);
                        if(!results || !results.text) return;
                        const resource = createAudioResource(await tts(results.text));
                        const player = createAudioPlayer({
                            behaviors: {
                                noSubscriber: NoSubscriberBehavior.Pause,
                            },
                        });
                        player.play(resource);
                        await channel.send({
                            content: results.text,
                        });
                    });
            });
            }, 10);
        }
    });

    bot.on("messageCreate", async (message) => {
        if(message.channelId != AI_CHANNEL) return;
        if(message.author.bot) return;
        await message.channel.sendTyping();
        if(await reachedUsageLimit(message)) {
            await message.channel.send(`You've reached the monthly usage limit of ${MONTHLY_USAGE_LIMIT}`);
            return;
        }

        const conversationLog: ConversationLog[] = [{
            role: "system",
            content: prompt
        }];
        
        const prevMessages = (await message.channel.messages.fetch({ limit: 15 })).reverse();

        prevMessages.forEach(msg => {
            if(message.author.bot && msg.author.id != bot.user?.id) return;
            conversationLog.push(newConversationLog(message))
        })

        try {
            const result = await openai.createChatCompletion({
                model: 'gpt-3.5-turbo',
                messages: conversationLog
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

        await prisma.usage.update({
            where: {
                id: message.author.id
            },
            data: {
                count: {
                    increment: 1
                }
            }
        })

    })
}

async function tts(text: string): Promise<string> {
    const resp = await axios.get("http://localhost:5000/tts?text=" + text);
    return resp.data;
}

main();

