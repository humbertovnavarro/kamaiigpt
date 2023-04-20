// @ts-ignore
import vosk from "vosk";
import fs from "fs";
import { AudioReceiveStream, EndBehaviorType, VoiceReceiver, getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import OpusScript from "opusscript";
import { Client, GuildMember, VoiceBasedChannel } from "discord.js";

type SampleRate = 16000 | 8000 | 48000;

interface VoiceRecognizerOptions {
    sampleRate?: SampleRate;
    modelPath?: string;
    gatherInterval?: number;
    channelId: string;
    client: Client
}

const DEFAULT_SAMPLE_RATE = 16000 as SampleRate;
const DEFAULT_MODEL_PATH = "vosk-model-en-us-0.22";

export class VoiceRecognizer {
    gatherInterval: number;
    interval?: NodeJS.Timer;
    rec: any;
    model: any;
    sampleRate: SampleRate;
    channel: VoiceBasedChannel;
    encoder: OpusScript;
    subscriptions = new Map<GuildMember, AudioReceiveStream>();
    wordCallbacks = new Set<(word: string, member: GuildMember) => void>();
    silenceCallbacks = new Set<(word: string, member: GuildMember) => void>();
    constructor({
        sampleRate = DEFAULT_SAMPLE_RATE,
        modelPath = DEFAULT_MODEL_PATH,
        gatherInterval = 200,
        channelId,
        client
    }: VoiceRecognizerOptions) {
        const channel = client.channels.cache.get(channelId);
        if(!channel) throw new Error("channel not found");
        if(!channel.isVoiceBased()) throw new Error("channel is not voice based");
        this.channel = channel;
        this.sampleRate = sampleRate;   
        this.gatherInterval = gatherInterval;     
        if (!fs.existsSync(modelPath)) {
            throw new Error("Please download the model from https://alphacephei.com/vosk/models and unpack as " + modelPath + " in the current folder.");
        }
        vosk.setLogLevel(0);
        console.log("Loading model...")
        this.model = new vosk.Model(modelPath);
        console.log("Model loaded")
        this.rec = new vosk.Recognizer({model: this.model, sampleRate});
        this.encoder = new OpusScript(sampleRate, 2, OpusScript.Application.AUDIO);
    }

    addEventListener(event: "word" | "silence", callback: (word: string, member: GuildMember) => void) {
        if(event === "word") {
            this.wordCallbacks.add(callback);
        }
        if(event === "silence") {
            this.silenceCallbacks.add(callback);
        }
    }

    listen() {
        if(this.interval) {
            clearInterval(this.interval);
        }
        const channel = this.channel;
        if(!channel) throw new Error("channel not found");
        if(!channel.isVoiceBased()) throw new Error("channel is not voice based");
        joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        const connection = getVoiceConnection(channel.guildId!);
        if(!connection) throw new Error("connection not found");
        const receiver = connection.receiver;
        this.interval = setInterval(() => {
            this.gather(receiver)
        }, this.gatherInterval);
    }

    /**
     * Free the recognizer and model
    */
    destroy() {
        this.rec.free();
        this.model.free();
    }

    private onWord(member: GuildMember, word: string) {
        this.wordCallbacks.forEach(callback => callback(word, member));
    }

    private onSilence(member: GuildMember, said: string) {
        this.silenceCallbacks.forEach(callback => callback(said, member));
    }

    private convert(audio: any): string {
        if(this.rec.acceptWaveform(audio)) {
            return this.rec.result() as string;
        }
        return this.rec.partialResult() as string;
    }

    private finalResult() {
        return this.rec.finalResult();
    }

    /**
     * Free the recognizer and create a new one
     */
    private free() {
        this.rec = new vosk.Recognizer({model: this.model, sampleRate: this.sampleRate});
    }

    private gather(receiver: VoiceReceiver) {
        const { subscriptions, encoder, channel, gatherInterval, rec } = this;

        this.channel.members.forEach(member => {
            if(member.id ===  channel.client.user.id) return;
            let memberSubscription = subscriptions.get(member);
            if(memberSubscription && memberSubscription.closed) {
                subscriptions.delete(member);
                memberSubscription = undefined;
            } else if(memberSubscription) {
                return;
            }

            memberSubscription = receiver.subscribe(member.user.id, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: gatherInterval
                },
            });
            
            subscriptions.set(member, memberSubscription);

            memberSubscription.on("error", (err: any) => {
                console.log(err);
                subscriptions.delete(member);
                this.onSilence(member, rec.finalResult());
                this.free();
            });

            memberSubscription.on("close", () => {
                subscriptions.delete(member);
                this.onSilence(member, rec.finalResult());
                this.free();
            });
            
            memberSubscription.on("end", () => {
                subscriptions.delete(member);
                this.onSilence(member, rec.finalResult());
                this.free();
            });

            memberSubscription.on("data", (data: any) => {
                const pcmBuffer = encoder.decode(data);
                const monoBuffer = Buffer.alloc(pcmBuffer.length / 2);
                for (let i = 0, j = 0; i < pcmBuffer.length; i += 4, j += 2) {
                    monoBuffer.writeInt16LE(Math.round((pcmBuffer.readInt16LE(i) + pcmBuffer.readInt16LE(i + 2)) / 2), j);
                }
                const result = this.convert(monoBuffer);
                if(result) {
                    this.onWord(member, result);
                }
            });
        });
    }

}