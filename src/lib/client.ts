import { Client, IntentsBitField } from "discord.js";

export const client = new Client({
    intents: [
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildVoiceStates,
    ]
});

export default client;