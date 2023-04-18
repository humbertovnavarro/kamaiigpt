from flask import Flask, request
from TTS.api import TTS
import sys

tts = TTS(model_name="tts_models/multilingual/multi-dataset/your_tts", progress_bar=False, gpu=False)
file_path="tts.wav"

app = Flask(__name__)
@app.route('/tts')
def route_tts():
    args = request.args
    print(args)
    text = args.get('text')
    if text is None:
        return 'No text provided'
    tts.tts_to_file("This is voice cloning.", speaker_wav="speaker.wav", language="en", file_path="tts.wav")
    return "tts.wav"
app.run()