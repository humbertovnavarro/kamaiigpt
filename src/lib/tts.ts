import { spawn } from "child_process";
const python = spawn("python", ["./tts.py"], {
    detached: true,
});
python.stdout.on("data", function(data) {
    console.log(data.toString());
    }
);

python.stdin.write("Hello World");
