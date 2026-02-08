import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs";

let pyodide = null;

function post(type, data = {}) {
  self.postMessage({ type, ...data });
}

async function init() {
  pyodide = await loadPyodide();
  pyodide.setStdout({ batched: s => post("stdout", { text:s }) });

  pyodide.globals.set("__canvas_cmd__", (obj) => {
    post("canvas_cmd", { cmd: obj });
  });

  await pyodide.runPythonAsync(`
import math, sys, types

def emit(**k): __canvas_cmd__(k)

class T:
    def __init__(self):
        self.x = self.y = 0.0
        self.heading = 0.0
        self.speed = 10
        self.visible = True
        self.color = "#00ff66"

    def forward(self, d):
        r = math.radians(self.heading)
        nx = self.x + math.cos(r)*d
        ny = self.y + math.sin(r)*d
        emit(type="line", x1=self.x, y1=self.y,
             x2=nx, y2=ny, color=self.color, width=2, speed=self.speed)
        self.x, self.y = nx, ny
        emit(type="turtle", x=self.x, y=self.y,
             heading=self.heading, visible=self.visible, color=self.color)

    def left(self, a):
        self.heading = (self.heading + a) % 360
        emit(type="turtle", x=self.x, y=self.y,
             heading=self.heading, visible=self.visible, color=self.color)

t = T()
mod = types.SimpleNamespace(
    forward=t.forward,
    left=t.left,
    speed=lambda s=None: setattr(t,"speed",int(s)) if s is not None else t.speed
)
sys.modules["turtle"] = mod
  `);

  post("ready");
}

self.onmessage = async e => {
  if (e.data.type === "run") {
    if (!pyodide) await init();
    await pyodide.runPythonAsync(e.data.code);
  }
};
