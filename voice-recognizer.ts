// @ts-ignore
import vosk from "vosk";
import fs from "fs";

export class VoiceRecognizer {
    rec: any;
    model: any;
    sampleRate: number;
    constructor(sampleRate: number) {
        const MODEL_PATH = "vosk-model-en-us-0.22"
        if (!fs.existsSync(MODEL_PATH)) {
            throw new Error("Please download the model from https://alphacephei.com/vosk/models and unpack as " + MODEL_PATH + " in the current folder.");
        }
        vosk.setLogLevel(0);
        this.model = new vosk.Model(MODEL_PATH);
        this.rec = new vosk.Recognizer({model: this.model, sampleRate});
        this.sampleRate = sampleRate;
    }
    convert(audio: any): string {
        if(this.rec.acceptWaveform(audio)) {
            return this.rec.result() as string;
        }
        return this.rec.partialResult() as string;
    }
    finalResult() {
        return this.rec.finalResult();
    }
    destroy() {
        this.rec.free();
        this.model.free();
    }
    free() {
        this.rec = new vosk.Recognizer({model: this.model, sampleRate: this.sampleRate});
    }
}