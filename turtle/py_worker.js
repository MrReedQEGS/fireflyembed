// py_worker.js (type: module)
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.mjs";

let pyodide = null;
let pendingInputResolve = null;

function post(type, data = {}) {
  self.postMessage({ type, ...data });
}

async function ensurePyodide() {
  if (pyodide) return;

  post("status", { text: "Loading Python…" });
  pyodide = await loadPyodide();

  pyodide.setStdout({ batched: s => post("stdout", { text: s }) });
  pyodide.setStderr({ batched: s => post("stderr", { text: s }) });

  // async input() -> UI
  pyodide.globals.set("__worker_console_input__", (prompt) => {
    post("input_request", { prompt: String(prompt ?? "") });
    return new Promise(resolve => { pendingInputResolve = resolve; });
  });

  // Canvas bridge: worker -> UI drawing commands
  pyodide.globals.set("__canvas_post__", (obj) => {
    // obj is a JS proxy; make a plain JSON-ish object
    post("canvas_cmd", obj.toJs ? obj.toJs() : obj);
  });

  // Install async input
  await pyodide.runPythonAsync(`
import builtins
async def _input(prompt=""):
    return await __worker_console_input__(str(prompt))
builtins.input = _input
  `);

  // Install a minimal browser "turtle" compatible module
  await pyodide.runPythonAsync(`
import math, types

# send a canvas command to the UI
def _cmd(**kwargs):
    __canvas_post__(kwargs)

class _WebTurtle:
    def __init__(self):
        self.x = 0.0
        self.y = 0.0
        self.heading = 0.0   # degrees, 0 = east
        self.pendown = True
        self.pencolor = "#00ff66"
        self.pensize = 2

    def _line_to(self, nx, ny):
        if self.pendown:
            _cmd(type="line", x1=self.x, y1=self.y, x2=nx, y2=ny, color=self.pencolor, width=self.pensize)
        self.x, self.y = nx, ny

    def forward(self, d):
        r = math.radians(self.heading)
        nx = self.x + math.cos(r) * d
        ny = self.y + math.sin(r) * d
        self._line_to(nx, ny)

    def backward(self, d):
        self.forward(-d)

    def left(self, deg):
        self.heading = (self.heading + deg) % 360.0

    def right(self, deg):
        self.heading = (self.heading - deg) % 360.0

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._line_to(float(x), float(y))

    def penup(self):
        self.pendown = False

    def pendown_(self):
        self.pendown = True

    def pencolor_(self, c):
        self.pencolor = str(c)

    def pensize_(self, w):
        self.pensize = float(w)

    def home(self):
        self.goto(0, 0)
        self.heading = 0.0

    def setheading(self, deg):
        self.heading = float(deg) % 360.0

    def clear(self):
        _cmd(type="clear")

    def bgcolor(self, c):
        _cmd(type="bg", color=str(c))

# Single shared turtle like classic turtle module
_T = _WebTurtle()

# Module functions mirroring turtle
def reset():
    _cmd(type="clear")
    _cmd(type="bg", color="#111111")
    global _T
    _T = _WebTurtle()

def forward(d): _T.forward(d)
def fd(d): _T.forward(d)
def backward(d): _T.backward(d)
def bk(d): _T.backward(d)
def left(a): _T.left(a)
def lt(a): _T.left(a)
def right(a): _T.right(a)
def rt(a): _T.right(a)
def goto(x, y=None): _T.goto(x, y)
def setpos(x, y=None): _T.goto(x, y)
def penup(): _T.penup()
def pu(): _T.penup()
def pendown(): _T.pendown_()
def pd(): _T.pendown_()
def pencolor(c=None):
    if c is None: return _T.pencolor
    _T.pencolor_(c)
def pensize(w=None):
    if w is None: return _T.pensize
    _T.pensize_(w)
def width(w=None): return pensize(w)
def clear(): _T.clear()
def bgcolor(c): _T.bgcolor(c)
def home(): _T.home()
def setheading(a): _T.setheading(a)

# OO API: Turtle() returns a new turtle that draws on same canvas
class Turtle(_WebTurtle):
    pass

# Very small Screen shim
class Screen:
    def bgcolor(self, c): bgcolor(c)
    def clearscreen(self): clear()
    def reset(self): reset()

# Create a real module object called "turtle"
turtle = types.ModuleType("turtle")
for _name, _obj in list(globals().items()):
    if _name.startswith("_"): 
        continue
    setattr(turtle, _name, _obj)

import sys
sys.modules["turtle"] = turtle
  `);

  post("ready");
}

function wrapUserCode(src) {
  const t = src.replace(/(^|[^\w.])input\s*\(/g, "$1await input(");
  const i = t.split("\n").map(l => "    " + l);
  return ["async def __main__():", ...i, "", "await __main__()"].join("\n");
}

self.onmessage = async (ev) => {
  const msg = ev.data || {};
  try {
    if (msg.type === "init") {
      await ensurePyodide();
      return;
    }

    if (msg.type === "run") {
      await ensurePyodide();

      // Trinket-like: reset turtle each run
      post("canvas_cmd", { type: "clear" });
      post("canvas_cmd", { type: "bg", color: "#111111" });

      await pyodide.runPythonAsync(`import turtle; turtle.reset()`);

      post("status", { text: "Running…" });
      const code = wrapUserCode(msg.code ?? "");
      await pyodide.runPythonAsync(code);
      post("done");
      return;
    }

    if (msg.type === "input_response") {
      if (pendingInputResolve) {
        pendingInputResolve(String(msg.text ?? ""));
        pendingInputResolve = null;
      }
      return;
    }
  } catch (e) {
    post("error", { text: String(e) });
  }
};
